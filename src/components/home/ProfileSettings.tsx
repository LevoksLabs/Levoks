"use client";
import { useState } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import {
  ArrowUpRight,
  Check,
  Github,
  Globe,
  HardDrive,
  LogOut,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import styles from "./home.module.css";

export default function ProfileSettings() {
  const { data: session, status, update } = useSession();
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  return (
    <div className={styles.profile}>
      <div className={styles.heading}>
        <div>
          <h1>Your profile</h1>
          <p>Your account and workspace, in one place.</p>
        </div>
      </div>
      {status === "loading" ? (
        <p role="status">Loading your profile…</p>
      ) : !session ? (
        <section className={styles.profileSection}>
          <UserRound size={32} strokeWidth={1.5} />
          <h2>Make yourself at home</h2>
          <p>
            You’re working locally. Sign in to access cloud projects and your
            account. Your saved projects will stay on this device.
          </p>
          <Link
            href="/auth/signin?callbackUrl=%2Fprofile"
            className={styles.primary}
          >
            Sign in <ArrowUpRight size={16} />
          </Link>
        </section>
      ) : (
        <>
          <section className={styles.profileSection}>
            <div className={styles.profileIdentity}>
              <span className={styles.largeAvatar}>
                {session.user?.name?.[0]?.toUpperCase() || "U"}
              </span>
              <div>
                <h2>{session.user?.name || "Your account"}</h2>
                <p>{session.user?.email}</p>
              </div>
            </div>
            <form
              className={styles.profileForm}
              onSubmit={(event) => {
                event.preventDefault();
                setBusy(true);
                setError("");
                setSaved(false);
                const displayName = (name ?? session.user?.name ?? "").trim();
                void update({ name: displayName })
                  .then((result) => {
                    if (result?.user?.name !== displayName)
                      throw new Error(
                        "Your profile could not be updated. Try again.",
                      );
                    setSaved(true);
                  })
                  .catch((reason) => setError(reason.message))
                  .finally(() => setBusy(false));
              }}
            >
              <label>
                Display name
                <input
                  value={name ?? session.user?.name ?? ""}
                  maxLength={80}
                  required
                  onChange={(event) => {
                    setName(event.target.value);
                    setSaved(false);
                  }}
                />
              </label>
              <p>
                Used for this Levoks session. Your sign-in provider’s profile
                stays unchanged.
              </p>
              <label>
                Email
                <input value={session.user?.email || "Not provided"} readOnly />
              </label>
              <p>Your email is managed by your sign-in provider.</p>
              <div className={styles.profileSave}>
                <button
                  className={styles.primary}
                  disabled={busy || !(name ?? session.user?.name ?? "").trim()}
                >
                  {busy ? "Saving…" : "Save profile"}
                </button>
                {saved && (
                  <span role="status">
                    <Check size={16} /> Profile saved
                  </span>
                )}
              </div>
              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}
            </form>
          </section>
          <section className={styles.profileSection}>
            <h2>Sign-in account</h2>
            <p>Manage your identity with the provider you use to sign in.</p>
            <div className={styles.providerRow}>
              {session.provider === "github" ? (
                <Github size={22} />
              ) : (
                <Globe size={22} />
              )}
              <span>
                {session.provider === "github"
                  ? "GitHub"
                  : session.provider === "google"
                    ? "Google"
                    : "Account provider"}
              </span>
              <span className={styles.connected}>
                <ShieldCheck size={15} /> Signed in
              </span>
              {session.provider &&
                ["github", "google"].includes(session.provider) && (
                  <a
                    className={styles.secondary}
                    href={
                      session.provider === "github"
                        ? "https://github.com/settings/profile"
                        : "https://myaccount.google.com/"
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    Manage account <ArrowUpRight size={15} />
                  </a>
                )}
            </div>
          </section>
        </>
      )}
      <section className={styles.profileSection}>
        <h2>Project storage</h2>
        <div className={styles.providerRow}>
          <HardDrive size={22} />
          <div>
            <strong>Local first</strong>
            <p>
              Projects, groups, stars, and Trash are stored in this browser.
              Save projects to your account from the editor or export a backup
              from Home.
            </p>
          </div>
        </div>
        <Link href="/" className={styles.secondary}>
          Go to projects <ArrowUpRight size={15} />
        </Link>
      </section>
      {session && (
        <section className={styles.profileSection}>
          <h2>Sign out</h2>
          <p>Local projects remain on this device after you sign out.</p>
          <button
            className={styles.secondary}
            onClick={() => void signOut({ callbackUrl: "/" })}
          >
            <LogOut size={16} /> Sign out of Levoks
          </button>
        </section>
      )}
    </div>
  );
}
