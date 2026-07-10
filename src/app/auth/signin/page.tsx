"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Shield } from "lucide-react";
import styles from "./page.module.css";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
};

const cardVariant = {
  hidden: { opacity: 0, y: 30, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.15 },
  },
};

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function SignInContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

  const handleSignIn = (provider: string) => {
    setLoadingProvider(provider);
    signIn(provider, { callbackUrl: "/" });
  };

  const errorMessages: Record<string, string> = {
    OAuthSignin: "Could not start the sign-in flow. Please try again.",
    OAuthCallback: "Something went wrong during authentication.",
    OAuthAccountNotLinked: "This email is already linked to another account. Try a different provider.",
    Default: "An unexpected error occurred. Please try again.",
  };

  return (
    <div className={styles.authPage}>
      {/* Background effects */}
      <div className={styles.bgOrb + " " + styles.orb1} />
      <div className={styles.bgOrb + " " + styles.orb2} />
      <div className={styles.bgOrb + " " + styles.orb3} />
      <div className={styles.gridOverlay} />

      {/* Floating particles */}
      <div className={styles.particles}>
        {[...Array(6)].map((_, i) => (
          <div key={i} className={styles.particle} />
        ))}
      </div>

      {/* Card */}
      <motion.div
        className={styles.card}
        variants={cardVariant}
        initial="hidden"
        animate="visible"
      >
        {/* Logo */}
        <motion.div
          className={styles.logoArea}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={0}
        >
          <div className={styles.logoGlow}>
            <img
              src="/levoks_logo.svg"
              alt="Levoks"
              className={styles.logo}
              width={52}
              height={52}
            />
          </div>
          <span className={styles.brandName}>Levoks</span>
          <div className={styles.tagline}>
            <motion.span className={styles.tagWord} variants={fadeUp} custom={1}>
              Build.
            </motion.span>
            <motion.span className={styles.tagWord} variants={fadeUp} custom={2}>
              Design.
            </motion.span>
            <motion.span className={styles.tagWord} variants={fadeUp} custom={3}>
              Ship.
            </motion.span>
          </div>
        </motion.div>

        {/* Subtitle */}
        <motion.p
          className={styles.subtitle}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={4}
        >
          Sign in to save your projects, collaborate,<br />
          and push directly to GitHub.
        </motion.p>

        {/* Error banner */}
        {error && (
          <motion.div
            className={styles.errorBanner}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
          >
            ⚠️ {errorMessages[error] || errorMessages.Default}
          </motion.div>
        )}

        {/* Provider buttons */}
        <motion.div
          className={styles.providers}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={5}
        >
          <button
            className={`${styles.providerBtn} ${styles.githubBtn}`}
            onClick={() => handleSignIn("github")}
            disabled={loadingProvider !== null}
          >
            {loadingProvider === "github" ? (
              <div className={styles.spinner} />
            ) : (
              <span className={styles.providerIcon}><GitHubIcon /></span>
            )}
            Continue with GitHub
            <span className={styles.recommended}>Recommended</span>
          </button>

          <div className={styles.divider}>
            <div className={styles.dividerLine} />
            <span className={styles.dividerText}>or</span>
            <div className={styles.dividerLine} />
          </div>

          <button
            className={`${styles.providerBtn} ${styles.googleBtn}`}
            onClick={() => handleSignIn("google")}
            disabled={loadingProvider !== null}
          >
            {loadingProvider === "google" ? (
              <div className={styles.spinner} />
            ) : (
              <span className={styles.providerIcon}><GoogleIcon /></span>
            )}
            Continue with Google
          </button>
        </motion.div>

        {/* Scope info */}
        <motion.div
          className={styles.scopeInfo}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={6}
        >
          <Shield size={14} className={styles.scopeIcon} />
          <span>
            GitHub sign-in requests repository access so Levoks can push
            your generated code directly to your account.
          </span>
        </motion.div>

        {/* Footer */}
        <motion.div
          className={styles.footer}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={7}
        >
          By continuing, you agree to our{" "}
          <a href="#">Terms of Service</a> and{" "}
          <a href="#">Privacy Policy</a>.
        </motion.div>
      </motion.div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  );
}
