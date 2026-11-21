/**
 * # proxy.ts - gives each new browser a random workspace id cookie (no login needed)
 *
 * - Runs before every page and API request (not static files or the cron route).
 * - The cookie is HttpOnly, so page scripts can't read it; SameSite=Lax, so other sites can't post with it.
 * - The id is also written onto the current request, so this very first page load already sees its workspace.
 */
import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "wid"; // same name as WORKSPACE_COOKIE in lib/workspace.ts
const THIRTY_DAYS = 60 * 60 * 24 * 30;

// Create the workspace cookie if this browser doesn't have one yet.
export function proxy(request: NextRequest) {
  if (request.cookies.has(COOKIE)) return NextResponse.next();

  const id = crypto.randomUUID();
  request.cookies.set(COOKIE, id);
  const response = NextResponse.next({ request: { headers: request.headers } });
  response.cookies.set(COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: THIRTY_DAYS,
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/cron).*)"],
};
