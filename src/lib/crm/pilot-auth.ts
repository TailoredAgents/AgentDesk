import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { pilotConfiguration } from "./config";
import { ApiError } from "../auth";

/** Authentication is owned by Auth.js. Brokerage authorization is reloaded from DB per operation. */
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  basePath: "/api/pilot/auth",
  secret: process.env.PILOT_AUTH_SECRET,
  trustHost: true,
  useSecureCookies:
    process.env.APP_URL?.startsWith("https:") ||
    process.env.NODE_ENV === "production",
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  providers: pilotConfiguration().ready
    ? [
        Google({
          clientId: process.env.PILOT_GOOGLE_CLIENT_ID,
          clientSecret: process.env.PILOT_GOOGLE_CLIENT_SECRET,
          checks: ["pkce", "state", "nonce"],
        }),
      ]
    : [],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        if (
          account.provider !== "google" ||
          !profile?.sub ||
          profile.email_verified !== true
        )
          throw new Error("Verified identity required");
        token.sub = `google:${profile.sub}`;
      }
      // Never copy identity-provider access/refresh tokens into the session.
      return { sub: token.sub };
    },
    async session({ session, token }) {
      return { expires: session.expires, user: { id: token.sub } };
    },
    async redirect() {
      return `${process.env.APP_URL?.replace(/\/$/, "")}/pilot`;
    },
  },
  logger: {
    error() {
      console.error(
        "[agentdesk] Individual sign-in failed; check identity provider configuration.",
      );
    },
  },
}));

export async function requirePilotSubject() {
  if (!pilotConfiguration().ready)
    throw new ApiError(
      503,
      "The private CRM pilot is awaiting individual sign-in configuration.",
      "pilot_not_configured",
    );
  const session = await auth();
  if (!session?.user?.id?.startsWith("google:"))
    throw new ApiError(
      401,
      "Sign in individually to use the CRM pilot.",
      "pilot_sign_in_required",
    );
  return session.user.id;
}
