import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { HttpError } from "./http";
export async function requireOwner() {
  const session=await getServerSession(authOptions);
  if(!session?.user?.id)throw new HttpError(401,"Sign in to manage secure connections and cloud projects.");
  return session.user.id;
}
