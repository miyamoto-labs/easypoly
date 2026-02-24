import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware — Open beta (no code gate).
 * The beta code wall has been removed for open access.
 * Keeping middleware in place for future use (rate limiting, geo-blocking, etc.)
 */
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|apple-touch-icon\\.png|icon-.*\\.png|easyp\\.jpg|screenshots).*)",
  ],
};
