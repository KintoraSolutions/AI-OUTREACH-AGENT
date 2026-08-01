import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

// Protect the dashboard area. Unauthenticated users are redirected to /signin.
export default auth((req) => {
  const isAuthed = !!req.auth?.user;
  const { pathname } = req.nextUrl;

  const isProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/leads") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/campaigns") ||
    pathname.startsWith("/jobs");

  if (isProtected && !isAuthed) {
    const url = new URL("/signin", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", pathname);
    return Response.redirect(url);
  }

  return undefined;
});

export const config = {
  matcher: ["/dashboard/:path*", "/leads/:path*", "/settings/:path*", "/campaigns/:path*", "/jobs/:path*"],
};
