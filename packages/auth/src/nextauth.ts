import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { accounts, getDb, sessions, users, verificationTokens } from "@familyarchive/db";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { verifyPassword } from "./password";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
  }
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Auth.js (NextAuth v5): email/password only in v1 (PRD §9.1). JWT sessions —
 * required with the Credentials provider. The token carries only the user id;
 * roles are read fresh from the database by the guards in ./guards.ts.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt" },
  // Self-hosted: the deployment host is operator-controlled (APP_URL), not a
  // platform-verified domain, so Auth.js must be told to trust it.
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase().trim();
        const rows = await getDb().select().from(users).where(eq(users.email, email)).limit(1);
        const user = rows[0];
        if (!user?.passwordHash) return null;
        const valid = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!valid) return null;
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],
  callbacks: {
    session: ({ session, token }) => {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
}));
