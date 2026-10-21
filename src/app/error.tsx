"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="fatal-state">
      <h1>Let’s get you back to your day.</h1>
      <p>Something interrupted the workspace. Your saved work is safe.</p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
