# AgentDesk + Lofty: authorized pilot setup

This release provides an isolated CRM foundation at `/pilot`. It does not claim a live Lofty connection. The existing six-agent fictional workspace, Sarah/Willow demonstration, documents/PDFs, tasks, listings, and reset remain at `/` with the existing shared demo login.

Read the [capability investigation](LOFTY_CAPABILITIES.md) first. The public OAuth guide does not document state echo; that is a **release gate**, not a security check to remove if the first callback fails.

## What is implemented

- Individual Google OIDC authentication through Auth.js (`next-auth` v5 beta.32, the version currently prescribed by its Next.js installation guide), with PKCE, state, nonce, encrypted sessions, and no Google API access retained. Google sign-in is identity only, not a Gmail/Calendar integration.
- Explicit server-side membership: immutable Google subject → human agent → brokerage → expected Lofty user/team IDs. Every operation reloads active membership. Agent and leader permissions cannot be changed with a browser view switch.
- OAuth initiation/callback, one-use hashed state, session and browser binding, ten-minute expiry, AES-256-GCM server token encryption bound to connection ownership, serialized refresh, provider identity verification, and local disconnect.
- Bounded on-demand assigned-lead reconciliation, exact external IDs, selective CRM projections, related notes/tasks/appointments, transaction context, and a bounded Lofty communication timeline. CRM records are read-only locally. No name/email deduplication.
- Durable approval/execution ledger for note creation, regular task creation, and task text/deadline updates. Approval, submission, and read-after-write confirmation are separate states.
- One shared authorized context for Daily Coordinator, Conversation Assistant, Relationship Assistant, Listing Coordinator, and Team Coach. Optional AI draft preparation uses the existing configured OpenAI model, structured output, source checks, and `store:false`; no model tools can write to Lofty.
- Reviewed intelligence stays in AgentDesk. An explicitly reviewed confirmed replacement can supersede a prior plan; tentative observations cannot replace one. The prior fact and its sources remain historical. AI drafts and snapshots are stored separately from the sample's work products.
- Connection manager, capabilities, account identity, refresh/error history, provenance, approval history, and personal-phone copy drafts. Leaders see connection health for their brokerage, not another agent's private CRM content.

## Boundaries for the first pilot

This is not a full migration of every existing page to real CRM data. The real-data workflow lives in `/pilot`; the polished six-agent demonstration remains a separate sample. Sample approvals never write to Lofty. Existing PDF/document workflows are preserved for the sample; the pilot currently produces sourced work packages and message/note drafts, not the sample's seller-document/PDF flow.

Lead reconciliation is **on demand**, one page of up to 100 records per request, with a 2,000-lead pilot cap. Continue an unfinished import with the button. There is no background scheduler or webhook receiver. A later run reconciles changed records by external ID and content hash; no undocumented modified-since query is used. The completed scan marks missing records unavailable, not proven deleted. Partial scans never infer deletion. Missing/unavailable leads lose cached CRM content and associated pilot drafts; audit metadata remains. A 30-minute abandoned scan starts again. The lead selector shows 250 records; another assigned lead can be opened by exact ID.

Related history is fetched when the agent explicitly refreshes a selected lead. The communication timeline returns the first 1,000 chronological entries; a full page is marked incomplete. No personal-device history is fabricated. Broader listing search/inventory, independent calendar feeds, communication sending, task completion, assignment changes, prices/stages, and transaction mutations are not enabled. Lead-linked property details and appointment-type tasks can supply context. Grant only the selected capabilities.

All projections older than 15 minutes are qualified as stale, not silently current. Missing or ambiguous provider update timestamps remain unknown. A successful fetch is not proof that the underlying information was recently changed. Provider permission changes are detected on requests; there is no real-time revocation webhook guarantee.

Lofty's selected write contracts do not document a provider idempotency key or conditional-update precondition. The local claim is committed before sending; concurrent/repeated submissions cannot resend the same action. An interrupted claim or ambiguous network response remains unconfirmed and is **never automatically retried**. Inspect Lofty manually before proposing a replacement. Task updates read and compare the source hash first, but cannot guarantee atomic compare-and-swap against a simultaneous edit inside Lofty. Do not expand these writes to sensitive fields without stronger provider semantics.

## Developer application preparation — do not submit automatically

Register through the [Lofty Developer Platform](https://api.lofty.com/vendor/frontend/static/index.html#/login). The [official onboarding guide](https://help.lofty.com/hc/en-us/articles/4405826620571-Getting-Started-with-the-Lofty-Developer-Platform) describes signup and production review. Provide the actual legal organization/operator details; do not invent business registration or privacy URLs.

Prepare these items for the portal and confirm the portal's current required fields:

| Item | Proposed entry / owner action |
| --- | --- |
| App name | AgentDesk by Tailored Agents |
| Organization | Actual legal operator name, business address, administrator name, business email, and phone |
| Website | Your public AgentDesk/Tailored Agents website; verify domain ownership and public accessibility |
| App URL | `https://agentdesk-705d.onrender.com/pilot` unless you have moved to a custom domain |
| Lofty callback | `https://agentdesk-705d.onrender.com/api/pilot/lofty/callback` (must exactly match `APP_URL`) |
| Privacy policy | Operator-approved published policy describing CRM/AI processing, retention, deletion, subprocessors, and contact details; **not created or claimed as published by this change** |
| Terms / support | Actual published terms and monitored support contact if the portal requests them |
| Testing account | An authorized Lofty sandbox/development account or owner-approved test brokerage, plus two agents with deliberately distinct records |
| Testing owner | Identify the authorized Team Owner / Company Owner who can arrange test permissions; confirm Lofty's development-mode authorization rules in the portal |
| Credentials | Obtain client ID/secret from the approved application's My Authorization area. Store only in Render Environment or private local environment files |

Proposed accurate application description:

> AgentDesk helps real estate agents prepare administrative work using authorized Lofty CRM context. Each pilot agent signs in individually and authorizes their own Lofty account. AgentDesk reads assigned lead details, CRM notes, tasks and permitted relationship context to prepare sourced summaries, follow-up drafts and recommendations. CRM records remain authoritative in Lofty. Supported note and task updates require explicit human review, approval and submission, with an execution audit and a separate provider confirmation. AgentDesk does not send communications, change lead assignments, or import personal-phone history. The initial pilot is restricted to explicitly provisioned agents and brokerages.

### Requested endpoints and reasons

Start with reads. The OAuth token scope is `openApi`; the following are **application capability names**, not invented OAuth scopes. Match them to actual endpoint grants in the Lofty portal.

| AgentDesk capability | Endpoint grants | Reason |
| --- | --- | --- |
| Required identity | `GET /v1.0/me` | Verify expected agent and brokerage |
| `leads.read` | `GET /v1.0/leads`, `GET /v1.0/leads/{leadId}` | Assigned lead context and access revalidation |
| `notes.read` | `GET /v1.0/notes`, `GET /v1.0/notes/{noteId}` | Relationship notes and write confirmation |
| `tasks.read` | `GET /v2.0/tasks`, `GET /v2.0/tasks/{taskId}` | Open work, appointment context, edit preflight and confirmation |
| `activities.read` | `GET /v2.0/leads/{leadId}/activities` | Authorized Lofty call/text/email timeline metadata, not off-platform history |
| `transactions.read` | `GET /v1.0/leads/{leadId}/transactions` | Linked transaction stage and timing context |
| `notes.create` | `POST /v1.0/notes` plus note reads | Human-approved CRM note |
| `tasks.create` | `POST /v2.0/tasks` plus task reads | Human-approved regular task |
| `tasks.update` | `PUT /v2.0/tasks/{taskId}` plus task reads | Human-approved text/deadline adjustment |

Ask Lofty to confirm: authorization endpoint/state echo, callback behavior on denial, form-encoded POST token exchange and refresh, test-account eligibility, endpoint grant names, account/team ID availability, rate-reset units, and whether stronger idempotency/conditional-write and signed-webhook contracts exist. Do not enable `LOFTY_STATE_VERIFIED` on the basis of marketing copy.

## Render configuration

The existing Blueprint, PostgreSQL service, startup, health endpoint, and sample credentials remain compatible. New migrations run through the existing pre-deploy migration command. **No optional pilot setting is required for the sample deployment to succeed.** Set these server-only environment variables in the Render web service after the prerequisites are ready:

| Variable | Value / purpose |
| --- | --- |
| `APP_URL` | Canonical HTTPS origin only, no path; existing Blueprint supplies the Render service URL |
| `CRM_PILOT_ENABLED` | `1` enables individual pilot sign-in |
| `PILOT_AUTH_SECRET` | Dedicated random secret, at least 32 characters; different from the sample session secret |
| `PILOT_GOOGLE_CLIENT_ID`, `PILOT_GOOGLE_CLIENT_SECRET` | Google OAuth web application credentials; request only sign-in identity |
| `CRM_TOKEN_ENCRYPTION_KEY` | 64 hexadecimal characters representing 32 random bytes; store a secure recovery copy |
| `LOFTY_CLIENT_ID`, `LOFTY_CLIENT_SECRET` | Approved/authorized development vendor credentials |
| `LOFTY_APP_APPROVED` | `1` only when the application's current mode permits this test account to authorize |
| `LOFTY_STATE_VERIFIED` | `1` only after confirmed state echo support and a controlled round-trip test |
| `LOFTY_CAPABILITIES` | Initially `leads.read,notes.read,tasks.read`; add only verified endpoint grants |
| `CRM_AI_ENABLED` | Initially `0`; change to `1` after brokerage approval of AI data processing |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Existing server configuration; needed only for requested AI draft preparation |

Do not put secrets into `render.yaml`, Git, browser code, chat, screenshots, or membership JSON. Rotating the token encryption key without retaining the old key makes existing tokens unreadable: disconnect affected accounts first, rotate, then reauthorize. Rotating the individual authentication secret signs users out. Never reuse the shared demo password for real identities.

Google authorized redirect URI:

`https://agentdesk-705d.onrender.com/api/pilot/auth/callback/google`

Use the exact matching custom-domain origin if applicable. Configure allowed Google test users/consent-screen status in your own Google project. This release does not create that application or perform a live Google login on your behalf.

## Exact first-connection sequence

1. Finish the Lofty developer application prerequisites and obtain authorized development/production credentials and endpoint grants. Verify state support with Lofty. Do not turn off state validation if the callback lacks it.
2. Configure Google identity, canonical origin and `PILOT_AUTH_SECRET` in Render; set `CRM_PILOT_ENABLED=1`. Deploy. The sample stays usable throughout.
3. Have each of two pilot agents sign in at `/pilot`. An unprovisioned account can see only its own account reference. Verify these people with the brokerage administrator, not by an unverified email sent to the app.
4. Obtain their exact Lofty `memberUserId` values and brokerage `teamId` from the authorized administrator/developer account. These are decimal strings, including when longer than 16 digits. Never guess IDs or match by names/emails.
5. In a private local file or the authenticated Render shell, prepare one membership file per agent, using actual values:

   ```json
   {
     "brokerageId": "pilot-epique-team",
     "brokerageName": "Authorized brokerage display name",
     "loftyTeamId": "123456",
     "subject": "google:actual-verified-subject",
     "label": "Authorized agent name",
     "loftyUserId": "123457",
     "role": "agent",
     "active": true
   }
   ```

   Run `npm run pilot:member -- /path/to/private-membership.json` against the intended Render database. The file contains identifiers, not credentials; do not commit it. Use `leader` only for the verified team leader. Use `active:false` to revoke membership immediately. Identity mappings cannot be reassigned by this command. Do not point local tests at production.

6. Add the Lofty client credentials and encryption key to Render. Register the exact callback URL in Lofty. Set the approval/state flags only after their conditions are met; set read capabilities. Redeploy once.
7. Agent A opens `/pilot`, clicks **Connect Lofty**, signs into the expected Lofty account, and authorizes. AgentDesk validates state/session/browser and checks `/v1.0/me` before saving the connection. An account/team mismatch fails closed. A failed or declined callback never becomes “Connected.”
8. Refresh assigned leads, continuing pages until complete. Select a lead and refresh context. Confirm IDs, ownership, a known note, task and appointment against Lofty. Record any envelope/permission differences; do not broaden parsing to accept unknown shapes without checking the contract.
9. Repeat for Agent B. Attempt Agent A's lead ID and action ID under Agent B. They must be denied. Confirm the team leader sees only brokerage connection health, with no cross-agent private content. Remove a record's access in Lofty, refresh, and confirm cached visibility is removed.
10. Test expiry/refresh and Lofty-side revoke. Confirm reconnect-required state, blocked writes, and no token leaks. Test local disconnect and verify the separate provider-side revocation in Lofty.
11. In the authorized test account only, enable `notes.create` with its read grants. Propose a harmless test note, approve, submit once, and separately confirm it. Repeat the same request and verify only one note exists. A transient 404 immediately after note creation should remain submitted, not trigger another create.
12. Repeat for task creation and task text/deadline updates; change the task in Lofty between proposal and submission and verify a conflict. Inspect unknown outcomes manually; never blindly retry a create. Avoid simultaneous provider edits during this limited pilot.
13. Enable `CRM_AI_ENABLED=1` only after the operator has approved CRM-to-OpenAI processing. Prepare a sourced draft, compare each claim to the snapshot, test a newer confirmed plan replacing a tentative one, and verify phone messages remain drafts. Expand beyond these two agents only after the checklist is documented as passed.

## Operations and retention

Use the connection audit and refresh history; never log raw provider tokens/responses. Backups contain CRM caches and draft content and must be access-controlled. Local disconnect removes tokens, projections, derived pilot facts, snapshots and draft bodies, and redacts write proposal bodies; minimal operation IDs/statuses and audit metadata remain. Provider-side revocation remains the agent's separate Lofty action. A database backup may retain prior content under the operator's backup policy.

Before broader customer onboarding, publish and approve an actual retention/deletion policy and implement its scheduled cleanup. The pilot does not silently invent a retention period. Provisioning is an administrator CLI workflow, not a self-service enterprise IAM system. No webhook endpoint is exposed and no MCP server is connected.

## Verification commands

`npm run typecheck`, `npm test`, `npm run build`, and `npm run test:production` cover the existing app plus pilot boundaries. Production smoke requires an explicitly disposable **localhost** PostgreSQL database whose name begins `agentdesk_test`; it cannot target Render. `tests/crm.test.ts` runs controlled provider fixtures against PGlite by default and a separate empty localhost PostgreSQL database when `CRM_TEST_DATABASE_URL` is set. CI runs both.

These tests prove local behavior against controlled contracts, not real Lofty approval, account permissions, live Google OAuth, or live Lofty/OAuth execution. Keep that distinction visible in demonstrations.
