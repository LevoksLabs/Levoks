// Each page lifetime belongs to one account. Pending saves must never be
// retargeted when the session changes; the auth boundary reloads instead.
let owner: string | null | undefined;

export function bindWorkspaceAccount(account: string | null): boolean {
  if (owner === undefined) owner = account;
  return owner === account;
}

export function accountStorageKey(base: string): string {
  if (owner === undefined && typeof window !== "undefined")
    throw new Error("Wait for your account before opening workspace storage.");
  // Keep legacy data in the guest workspace; its original owner is unknown.
  return owner ? `${base}:account:${encodeURIComponent(owner)}` : base;
}
