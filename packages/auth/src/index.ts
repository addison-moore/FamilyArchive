import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { accounts, getDb, sessions, users, verificationTokens } from "@familyarchive/db";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

/**
 * Auth.js (NextAuth v5) configuration: email/password only in v1 (PRD §9.1).
 * JWT session strategy — required when using the Credentials provider.
 *
 * Milestone 1 wires the plumbing only; `authorize` intentionally rejects every
 * sign-in until registration/login land in Milestone 2 (PRD §33).
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
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async () => {
        // Milestone 2: look up the user, verify the password hash, return the user.
        return null;
      },
    }),
  ],
}));
