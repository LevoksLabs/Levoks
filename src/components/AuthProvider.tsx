"use client";

import { SessionProvider, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { bindWorkspaceAccount } from "@/lib/project/account-scope";
import { flushWorkspace } from "@/store/workspaceStore";

function AccountBoundary({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const owner = session?.user?.id || null;
  const [readyOwner, setReadyOwner] = useState<string | null | undefined>();
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "loading") return;
    let cancelled = false;
    void (async () => {
      if (bindWorkspaceAccount(owner)) {
        // Defer mounting children until their storage namespace is bound.
        await Promise.resolve();
        if (!cancelled) setReadyOwner(owner);
      } else {
        try {
          await flushWorkspace();
          if (!cancelled) window.location.replace("/");
        } catch {
          if (!cancelled)
            setError("Your account changed, but pending edits could not be saved. Sign back into the previous account to recover them.");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [owner, status]);

  if (readyOwner === undefined || readyOwner !== owner)
    return <div role="status">{error || "Opening your workspace…"}</div>;
  return children;
}

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider refetchInterval={30}>
      <AccountBoundary>{children}</AccountBoundary>
    </SessionProvider>
  );
}
