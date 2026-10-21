"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole } from "lucide-react";
import styles from "./login.module.css";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Sign-in could not be completed.");
      window.location.assign("/");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Sign-in could not be completed.",
      );
      setPending(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.brand}>
        <span className={styles.mark}>
          a<span>·</span>
        </span>
        <span>AgentDesk</span>
      </div>
      <section className={styles.panel} aria-labelledby="login-title">
        <div className={styles.label}>
          <span /> YOUR REAL ESTATE AI WORKFORCE
        </div>
        <div className={styles.lock}>
          <LockKeyhole size={23} strokeWidth={1.6} />
        </div>
        <h1 id="login-title">
          Your day, beautifully
          <br />
          taken care of.
        </h1>
        <p className={styles.description}>
          Welcome to AgentDesk. Enter your workspace password to get back to the
          people and properties that matter.
        </p>
        <form onSubmit={signIn} className={styles.form}>
          <label htmlFor="workspace-password">Workspace password</label>
          <div className={styles.inputWrap}>
            <input
              id="workspace-password"
              type={visible ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              maxLength={256}
              placeholder="Enter your password"
              aria-describedby={error ? "login-error" : undefined}
            />
            <button
              type="button"
              onClick={() => setVisible(!visible)}
              aria-label={visible ? "Hide password" : "Show password"}
            >
              {visible ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {error && (
            <p id="login-error" className={styles.error} role="alert">
              {error}
            </p>
          )}
          <button className={styles.submit} type="submit" disabled={pending}>
            {pending ? "Opening your workspace…" : "Open workspace"}
            {!pending && <ArrowRight size={18} />}
          </button>
        </form>
        <div className={styles.caption}>
          A protected sample workspace. Thoughtfully built for real work.
        </div>
      </section>
      <footer className={styles.footer}>
        Developed by <strong>Tailored Agents</strong>
        <span>Made for the human side of real estate.</span>
      </footer>
    </main>
  );
}
