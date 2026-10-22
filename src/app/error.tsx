"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="fatal-state">
      <div className="brand-mark" aria-label="AgentDesk">
        a
      </div>
      <h1>Let’s get you back to your day.</h1>
      <p>
        Something interrupted the workspace. Try again to reload your saved
        records. Unsaved edits may need to be entered again.
      </p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
