import Link from "next/link";
import { auth, signIn, signOut } from "@/lib/crm/pilot-auth";
import { pilotConfiguration } from "@/lib/crm/config";
import { getDatabase } from "@/lib/db";
import { findActor } from "@/lib/crm/service";
import { ApiError } from "@/lib/auth";
import { PilotWorkspace } from "@/components/crm/pilot-workspace";

export const dynamic = "force-dynamic";
export default async function PilotPage() {
  const config = pilotConfiguration();
  const session = config.ready ? await auth() : null;
  let member = false;
  if (session?.user?.id) {
    try {
      await findActor((await getDatabase()).db, session.user.id);
      member = true;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 403) throw error;
    }
  }
  return (
    <main className="crm-shell">
      <header className="crm-topbar">
        <Link href="/" className="crm-brand">
          AgentDesk<span>CRM pilot</span>
        </Link>
        <div className="crm-actions">
          <Link href="/">Sample workspace</Link>
          {session && (
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/pilot" });
              }}
            >
              <button className="button secondary" type="submit">
                Sign out
              </button>
            </form>
          )}
        </div>
      </header>
      {member ? (
        <PilotWorkspace />
      ) : (
        <section className="crm-welcome">
          <span className="eyebrow">YOUR SYSTEMS, WORKING TOGETHER</span>
          <h1>
            Your CRM.
            <br />
            Your AI workforce.
          </h1>
          <p>
            Bring authorized Lofty context into AgentDesk, prepare useful work,
            and review every CRM change before it happens.
          </p>
          <div className="crm-card">
            <h2>
              {!config.ready
                ? "Private pilot · awaiting setup"
                : session
                  ? "Your access is waiting for approval"
                  : "Start with your individual account"}
            </h2>
            <p>
              The shared sample login cannot connect a CRM or access customer
              data. Each pilot agent has their own account and assigned records.
            </p>
            {!config.ready ? (
              <>
                <p className="crm-muted">
                  Individual sign-in has not been configured. The sample
                  workspace remains ready to use.
                </p>
                <Link className="button primary" href="/">
                  Open sample workspace
                </Link>
              </>
            ) : !session ? (
              <form
                action={async () => {
                  "use server";
                  await signIn("google", { redirectTo: "/pilot" });
                }}
              >
                <button className="button primary" type="submit">
                  Continue with Google
                </button>
              </form>
            ) : (
              <>
                <p>
                  Ask your administrator to add this account to your brokerage’s
                  pilot.
                </p>
                <label>
                  Account reference
                  <code className="crm-account-ref">{session.user?.id}</code>
                </label>
              </>
            )}
          </div>
          <p className="crm-footnote">
            Lofty remains the source for CRM records. AgentDesk owns drafts,
            recommendations, and approval history. Live authorization requires
            Lofty approval and verified endpoint access.
          </p>
        </section>
      )}
    </main>
  );
}
