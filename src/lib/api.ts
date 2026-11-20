/**
 * # api.ts - how the Next.js server talks to the Python API (FastAPI in backend/)
 *
 * - Forwards the visitor's workspace cookie and IP, so the API sees the same browser the UI does.
 * - The browser itself reaches the API through the /api/* rewrite in next.config.ts (used by the chat stream).
 */
import "server-only";
import { cookies, headers } from "next/headers";

// On Vercel the API is a service of this same project, reachable at the production URL; locally it runs on :8000.
const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
export const API_URL = process.env.API_URL ?? (vercelUrl ? `https://${vercelUrl}` : "http://127.0.0.1:8000");

export type ApiResult<T> = { ok: boolean; status: number; data: T };

// Call the API as this visitor and return the parsed JSON with the status.
export async function api<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      cookie: (await cookies()).toString(),
      "x-forwarded-for": (await headers()).get("x-forwarded-for") ?? "",
    },
  });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) };
}
