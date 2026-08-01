import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { authConfig } from "@/auth.config";
import { isDevLoginEnabled } from "@/lib/env";

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
});
