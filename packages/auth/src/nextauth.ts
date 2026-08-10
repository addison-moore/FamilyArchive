import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { accounts, getDb, sessions, users, verificationTokens } from "@familyarchive/db";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { verifyAbsentUser, verifyPassword } from "./password";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
    /**
     * `users.updatedAt` as of sign-in. The guards reject a session whose stamp
     * predates the account's current `updatedAt`, which is how a password reset
     * revokes tokens issued before it. Null on sessions minted before this
     * existed — those are honoured until they expire.
     */
    credentialsStamp?: number | null;
  }
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Auth.js (NextAuth v5): email/password only in v1. JWT sessions —
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
        if (!user?.passwordHash) {
          // Spend the same work as a real verify. Returning straight away was
          // measurable — ~210ms for a registered address against ~4ms for an
          // unknown one — which let anyone enumerate accounts by timing, and
          // undid the care the password-reset flow takes not to reveal them.
          await verifyAbsentUser(parsed.data.password);
          return null;
        }
        const valid = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!valid) return null;
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],
  callbacks: {
    /**
     * Stamp the account's `updatedAt` into the token at sign-in. Sessions are
     * JWTs, so the `sessions` table is inert and there is no server-side handle
     * to revoke — without this stamp a token stolen before a password reset kept
     * working for the full 30-day default afterwards. `users.updatedAt` is
     * written only by `consumeResetToken`, so this invalidates sessions on a
     * password change and on nothing else.
     */
    jwt: async ({ token, user }) => {
      if (user?.id) {
        const [row] = await getDb()
          .select({ updatedAt: users.updatedAt })
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1);
        token.credentialsStamp = row?.updatedAt.getTime() ?? 0;
      }
      return token;
    },
    session: ({ session, token }) => {
      if (token.sub) session.user.id = token.sub;
      session.credentialsStamp =
        typeof token.credentialsStamp === "number" ? token.credentialsStamp : null;
      return session;
    },
  },
}));
