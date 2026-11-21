"""
# ai.py - the two AI jobs: analyse a lead (typed output) and answer chat questions about it (streamed text)

- Built on pydantic-ai. FallbackModel tries Gemini 3.5 Flash-Lite first and switches to Groq gpt-oss-120b when
  Gemini errors or is out of quota, trying each configured Groq key in order until one answers.
  If the output breaks the schema, the agent retries once with the error shown.
- Both providers are free tier. Models are created lazily so tests and imports don't need API keys.
"""

import os
import re
from collections.abc import AsyncIterator
from functools import cache

from pydantic_ai import Agent, NativeOutput
from pydantic_ai.exceptions import AgentRunError, FallbackExceptionGroup
from pydantic_ai.messages import ModelMessage, ModelRequest, ModelResponse, TextPart, UserPromptPart
from pydantic_ai.models import Model
from pydantic_ai.models.fallback import FallbackModel
from pydantic_ai.models.google import GoogleModel, GoogleModelSettings
from pydantic_ai.models.groq import GroqModel, GroqModelSettings
from pydantic_ai.providers.google import GoogleProvider
from pydantic_ai.providers.groq import GroqProvider

from app.ai.prompts import ANALYSIS_INSTRUCTIONS, analysis_prompt, chat_instructions
from app.schemas import LeadAnalysis

PRIMARY_MODEL = "gemini-3.5-flash-lite"
FALLBACK_MODEL = "openai/gpt-oss-120b"

# What the AI calls raise when every model failed (quota, outage, bad output).
AI_ERRORS = (AgentRunError, FallbackExceptionGroup)

# Low thinking keeps answers fast; reading a lead is careful reading, not puzzle solving.
SETTINGS = GoogleModelSettings(google_thinking_config={"thinking_level": "low"}) | GroqModelSettings(
    groq_reasoning_effort="low"
)

analysis_agent = Agent(
    output_type=NativeOutput(LeadAnalysis, strict=True),
    instructions=ANALYSIS_INSTRUCTIONS,
    retries=1,
    model_settings=SETTINGS | {"temperature": 0.2, "max_tokens": 2500, "timeout": 25},
)
chat_agent = Agent(model_settings=SETTINGS | {"temperature": 0.5, "max_tokens": 700, "timeout": 30})


def groq_keys() -> list[str]:
    """Every Groq key set in the environment: GROQ_API_KEY, then GROQ_API_KEY_2, GROQ_API_KEY_3, ... in order."""
    names = [k for k in os.environ if re.fullmatch(r"GROQ_API_KEY(_\d+)?", k) and os.environ[k]]
    return [
        os.environ[k] for k in sorted(names, key=lambda k: int(k.rsplit("_", 1)[1]) if k[-1].isdigit() else 1)
    ]


@cache
def default_model() -> Model:
    """Gemini first; if it fails, each Groq key in turn, so one key running out of quota moves on to the next."""
    gemini = GoogleModel(PRIMARY_MODEL, provider=GoogleProvider(api_key=os.environ["GEMINI_API_KEY"]))
    groq = [GroqModel(FALLBACK_MODEL, provider=GroqProvider(api_key=key)) for key in groq_keys()]
    return FallbackModel(gemini, *groq)


def _clip(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


async def analyze_lead(lead, model: Model | None = None) -> tuple[LeadAnalysis, str]:
    """Analyse one lead; returns the analysis and the name of the model that answered."""
    result = await analysis_agent.run(analysis_prompt(lead), model=model or default_model())
    a = result.output
    # Gemini doesn't enforce string lengths, so trim the fields the UI shows in tight spaces.
    a.summary = _clip(a.summary, 320)
    a.suggested_response = _clip(a.suggested_response, 900)
    a.next_action.detail = _clip(a.next_action.detail, 180)
    return a, result.response.model_name or "unknown"


def history_to_messages(rows: list[tuple[str, str]]) -> list[ModelMessage]:
    """Turn stored (role, text) chat rows into pydantic-ai message history."""
    return [
        ModelRequest(parts=[UserPromptPart(content=text)])
        if role == "user"
        else ModelResponse(parts=[TextPart(content=text)])
        for role, text in rows
    ]


async def stream_chat(
    lead, history: list[tuple[str, str]], question: str, model: Model | None = None
) -> AsyncIterator[str]:
    """Stream the answer to the salesperson's latest question about this lead, chunk by chunk."""
    async with chat_agent.run_stream(
        question,
        model=model or default_model(),
        instructions=chat_instructions(lead),
        message_history=history_to_messages(history),
    ) as result:
        async for chunk in result.stream_text(delta=True):
            yield chunk
