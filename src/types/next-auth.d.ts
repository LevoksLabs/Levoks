/* eslint-disable @typescript-eslint/no-unused-vars */
import NextAuth, { DefaultSession } from "next-auth";
import { JWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
    githubAccessToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    githubAccessToken?: string;
  }
}
