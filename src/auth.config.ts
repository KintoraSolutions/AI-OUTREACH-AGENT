import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { env } from "@/lib/env";

/**
 * Edge-safe auth config shared with middleware. It must NOT import Prisma or any
 * Node-only module. The Prisma adapter and the development credentials provider
 * live in `src/auth.ts`, which runs only in the Node runtime.
 */
const providers: NextAuthConfig["providers"] = [];

if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/signin",
    // Auth.js otherwise renders its own built-in /api/auth/error page, so a
    // refused sign-in left the visitor on a generic Auth.js screen with no
    // explanation. Pointing the error page back at /signin lets that page read
    // the `error` code and say what happened. This changes only what a refused
    // visitor is told — the `signIn` callback in src/auth.ts still decides who
    // is refused, unchanged.
    error: "/signin",
  },
  providers,
  callbacks: {
    // Pure token shaping only. No database access (runs on the edge in middleware).
    jwt({ token, user }) {
      if (user?.id) {
        token.uid = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid ?? token.sub) as string;
      }
      return session;
    },
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;
