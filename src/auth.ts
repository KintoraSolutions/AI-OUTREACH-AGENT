import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { authConfig } from "@/auth.config";
import { env, isDevLoginEnabled, signInAllowList } from "@/lib/env";
import { decideSignIn } from "@/lib/auth/sign-in-policy";

/**
 * Node-runtime auth. Extends the edge-safe config with the Prisma adapter and,
 * in development only, a credentials provider that signs in as an existing
 * (seeded) user. The dev provider never runs in production.
 */
const devProviders = isDevLoginEnabled
  ? [
      Credentials({
        id: "dev-login",
        name: "Development login",
        credentials: {
          email: { label: "Email", type: "email" },
        },
        async authorize(credentials) {
          const email =
            typeof credentials?.email === "string" && credentials.email.trim()
              ? credentials.email.trim().toLowerCase()
              : "founder@example-clinic-sales.test";
          const user = await prisma.user.findUnique({ where: { email } });
          if (!user) return null;
          return { id: user.id, name: user.name, email: user.email, image: user.image };
        },
      }),
    ]
  : [];

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [...authConfig.providers, ...devProviders],
  callbacks: {
    ...authConfig.callbacks,
    /**
     * Gate sign-in. This lives here rather than in `auth.config.ts` because the
     * "existing user" fallback needs Prisma, and that config is also loaded by
     * middleware on the edge runtime where Prisma cannot run.
     *
     * Without this there was no `signIn` callback at all: any Google account
     * could sign in, and the first-login bootstrap handed it a fresh
     * organization with an OWNER membership.
     */
    async signIn({ user }) {
      const email = user?.email?.trim().toLowerCase() ?? null;
      const isProduction = env.NODE_ENV === "production";

      // Only consult the database when the answer actually depends on it: with
      // an allowlist configured, or outside production, it does not.
      const needsExistingCheck = isProduction && signInAllowList.length === 0;
      const isExistingUser =
        needsExistingCheck && email
          ? (await prisma.user.findUnique({ where: { email }, select: { id: true } })) != null
          : false;

      const decision = decideSignIn({
        email,
        allowList: signInAllowList,
        isExistingUser,
        isProduction,
      });

      if (!decision.allowed) {
        console.warn(`[auth] sign-in refused (${decision.reason})`);
        return false;
      }
      return true;
    },
  },
});
