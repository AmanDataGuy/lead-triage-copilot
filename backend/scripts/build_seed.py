"""
# build_seed.py - re-runs the sample leads in app/seed.json through the real AI pipeline and saves the results

- Every new visitor's workspace starts with these pre-analysed leads, so browsing the demo costs no AI quota.
- Run after changing the prompts or the schema: `uv run --env-file ../.env python -m scripts.build_seed`
"""

import asyncio
import json
from pathlib import Path
from types import SimpleNamespace

from app.ai import analyze_lead
from app.scoring import score_lead

SEED_FILE = Path("app/seed.json")


async def main() -> None:
    """Analyse each sample lead and write the analyses back into seed.json."""
    seed = json.loads(SEED_FILE.read_text())
    for item in seed:
        analysis, model = await analyze_lead(SimpleNamespace(**item["lead"], call_notes=""))
        score, tier, _ = score_lead(analysis)
        print(f"{tier:5} {score:3}  {item['lead']['name']}  ({model})")
        item["analysis"], item["model"] = analysis.model_dump(by_alias=True), model
    SEED_FILE.write_text(json.dumps(seed, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    asyncio.run(main())
