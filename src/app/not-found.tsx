import Link from "next/link";
export default function NotFound() {
  return (
    <main className="fatal-state">
      <h1>This space is still undiscovered.</h1>
      <p>The page you’re looking for isn’t here.</p>
      <Link className="button primary" href="/">
        Back to Today
      </Link>
    </main>
  );
}
