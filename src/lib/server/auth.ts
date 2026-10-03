import type { NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
export const authOptions: NextAuthOptions = {
  providers: [
    ...(process.env.GITHUB_ID && process.env.GITHUB_SECRET
      ? [
          GithubProvider({
            clientId: process.env.GITHUB_ID,
            clientSecret: process.env.GITHUB_SECRET,
            authorization: { params: { scope: "read:user user:email" } },
          }),
        ]
      : []),
    ...(process.env.GOOGLE_ID && process.env.GOOGLE_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_ID,
            clientSecret: process.env.GOOGLE_SECRET,
          }),
        ]
      : []),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, trigger, session }) {
      if (account) {
        token.id = `${account.provider}:${account.providerAccountId}`;
        token.provider = account.provider;
      }
      // Only accept the editable display field; never trust client-supplied identity or provider.
      if (trigger === "update" && typeof session?.name === "string") {
        const name = session.name.trim();
        if (name.length > 0 && name.length <= 80) token.name = name;
      }
      delete token.githubAccessToken;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id || token.sub || "";
        session.user.name = token.name;
      }
      session.provider = token.provider;
      return session;
    },
  },
  pages: { signIn: "/auth/signin" },
};
