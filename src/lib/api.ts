/**
 * # api.ts - how the Next.js server talks to the Python API (FastAPI in backend/)
 *
 * - Forwards the visitor's workspace cookie and IP, so the API sees the same browser the UI does.
 * - The browser itself reaches the API on the same origin: Vercel routes /api/* to the FastAPI service
 *   (vercel.json); locally next.config.ts forwards it to the dev server.
 */
import "server-only";
import { cookies, headers } from "next/headers";

export type ApiResult<T> = { ok: boolean; status: number; data: T };

// Where the API lives: on Vercel the service binding injects BACKEND_URL at runtime; locally it runs on :8000.
function apiUrl(): string {
  return process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
}

// Call the API as this visitor and return the parsed JSON with the status.
export async function api<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const res = await fetch(`${apiUrl()}${path}`, {
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
