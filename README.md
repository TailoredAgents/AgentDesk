# AgentDesk

**Your Real Estate AI Workforce — by Tailored Agents.**

AgentDesk turns a client conversation into coordinated work for an agent to review: a factual summary, an internal CRM note, a personal follow-up draft, listing tasks, and proposed property notes. The Today, Review, Listings, and Team views share one relational data layer. Approvals and task completion persist across refreshes.

The Listing Coordinator also produces editable seller preparation packages with retained sources and version history. Explicit approval creates a downloadable PDF stored in PostgreSQL. Appointment briefings use the same work-product workflow on demand. Calendar files help agents use confirmed schedules in their existing tools; no separate messaging number or connected external account is required.

The initial product runs one protected, fictional **Sample Workspace**, The Willow Collective, with six agents. It is a working foundation for a paid pilot, with a deliberately limited access model. Names, addresses, prices, schedules, and conversations are sample data. Its demonstration timeline is anchored to Friday, October 23, 2026, with appointment times displayed in Eastern time. Recommendations use that explicit sample date. Photography illustrates the fictional properties; see [ATTRIBUTIONS.md](ATTRIBUTIONS.md).

## Run locally

Use Node.js 22 or newer and npm. No Docker, database server, or API key is needed to explore and review the sample workspace.

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

On macOS/Linux, use `cp .env.example .env` for the copy step. Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The development server binds to loopback. Both access credentials may be blank for localhost development; configuring either requires configuring both.

On first access, the app applies its PostgreSQL migrations and creates the sample workspace in `.agentdesk/postgres` using PGlite, an embedded PostgreSQL runtime. This directory is local development state and must not be committed. Data survives application restarts. Do not run two dev servers or database CLI commands against the same PGlite directory at the same time; stop the dev server before using migration or seed commands locally.

To use a normal PostgreSQL server locally, put its connection string in `DATABASE_URL`, then run:

```powershell
npm run db:migrate
npm run db:seed
npm run dev
```

The CLI reads `.env`. If you choose `.env.local` instead, Next.js reads it but the database CLI will need the same variables exported into the shell. Use `.env` for the straightforward shared setup.

## Demonstrate the central workflow

Start with the [Friday presentation guide](docs/DEMO_GUIDE.md). It covers proactive follow-ups, microphone capture, explicit approvals, connected records, and the saved-output fallback. [AI evaluation](docs/AI_EVALUATION.md) explains how to verify actual provider access and quality.

1. Start on **Today**. The briefing, priorities, appointments, and listing activity all use the sample workspace's records.
2. Open **Review** and select Sarah Mitchell's seller conversation for **1420 Willow Lane**. Read the original source and the distinction between confirmed cleaning and requested photography.
3. Inspect the proposed summary, internal CRM note, follow-up draft, tasks, and property update. Edit the text and explicitly approve or reject individual items. Undecided actions remain pending; the effects summary lists only the changes being confirmed.
4. Apply the review. Approved internal notes and tasks are persisted together; rejected items do not create changes. A message becomes an **approved draft**, ready for a human to use. It is never sent by AgentDesk.
5. Open the property in **Listings**, revisit **Today**, and inspect activity/client context to see the same updates. Refresh to verify persistence.
6. With a server-side OpenAI key configured, add a new written conversation, record a voice note, or upload authorized audio and prepare a new package. Without a key, use the clearly labeled saved sample package; AgentDesk does not manufacture a fresh AI response.

Sample note for a live run:

> I spoke with Sarah Mitchell about 1420 Willow Lane. Cleaning is booked for Monday. Sarah would like photography on Tuesday afternoon, but the photographer has not confirmed. I need to prepare the listing preparation checklist and follow up with Sarah once I hear back from the photographer. She asked us to keep the process simple and let her know what she needs to do before the shoot.

Relative weekday dates stay in the proposal text. New AI-generated tasks receive a due date only when the original note contains an explicit `YYYY-MM-DD` date; ambiguous timing is flagged for clarification. The model is instructed not to invent dates, confirmed appointments, prices, attachments, or completed work.

## What is connected

| Capability                                                                   | Current behavior                                                                          |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Workspace, properties, clients, conversations, appointments, tasks, activity | Persisted in the application's PostgreSQL data layer                                      |
| Saved sample review packages                                                 | Editable and approvable without an AI key; explicitly labeled as saved sample work        |
| New conversation processing                                                  | Live OpenAI Responses API with structured output, when configured                         |
| Shorter / More natural / More professional                                   | Live OpenAI rewrite of the current message draft, when configured                         |
| Authorized audio capture/upload                                                      | Browser recording with playback and upload alternatives; live transcription feeds processing. Requires an AI key and consent. |
| Communication profiles                                                       | Saved tone, length, directness, greeting, sign-off, preferred/avoided wording, and approved examples inform new drafts and rewriting |
| Daily and team summaries                                                     | Derived from current application records; no claim of continuous background AI monitoring |
| Client messages                                                              | Prepared or approved drafts only; never externally sent                                   |
| Lofty, Google, Microsoft, email, SMS, calendars                              | Unconnected; explicit integration capability boundaries are in `src/lib/integrations.ts`  |
| Team leader presentation toggle                                              | Agent preview switches the selected human agent’s work and style; the leader toggle changes its display label. Neither grants permissions. |

Record-based follow-up recommendations use open commitments, unresolved questions, and relevant tasks, with appointments and listing context as supporting evidence. Refresh & prepare generates missing proposals when live AI is configured. Existing proposals are reused, and a saved/approved message does not complete the underlying follow-up. Sarah, Michael, and Emily have linked fictional source records and saved example packages.

## Completed administrative work

- **Seller documents:** Open the linked work product in Review, the client record, or a listing. Edit its title, introduction, section headings, and checklist text. Recorded facts, requested work, open questions, and general suggestions remain distinct. Save pending edits or explicitly approve/reject the version. Approval renders and persists the PDF with its content and source snapshot; download it to share using normal tools.
- **Versions and history:** Approved and rejected versions are immutable. New draft version copies a saved version without an AI call. Regenerate with AI creates a separate version from current authorized records. Original content, saved edits, decisions, and source snapshots remain accessible. A saved sample Sarah/Willow Lane document supports the full edit → approve → PDF demonstration without an API key.
- **Calendar-ready actions:** Task reminders require a confirmed date, start time, end time, and time zone. A due date alone does not establish a schedule; start/end fields are initially blank. Confirmed appointments and confirmed task schedules export `.ics` files. The user must import/save the file in their calendar; no invitation is sent, external save claimed, or task automatically completed.
- **Appointment preparation:** Prepare briefing is on demand from an appointment's actual client, property, conversation, task, and commitment records. It uses the same editable work-product and approval flow; nothing runs in the background.
- **Approved communications:** Copy the approved message into the agent's existing phone or CRM. A selectable-text fallback is available when clipboard access is denied. Copying and downloading do not count as delivery or completed follow-up. Twilio and other messaging integrations remain unconnected.

Today surfaces document versions awaiting review. Client and property records retain linked work products, and Team reports saved approved PDF versions and pending document versions. These are counts of administrative output, not proof of client delivery. PDFs are stored with their approved versions in PostgreSQL rather than Render's ephemeral filesystem.

## Relationship & Situation Intelligence

Client records now hold reviewed, source-linked facts with certainty, event dates, timestamps, and superseded history. New conversation processing proposes practical observations in the same AI call, then deterministic comparison prepares changes in the existing Review flow. A request cannot silently replace a confirmed arrangement. Human corrections and retirement also require an explicit decision.

Scoped impact checks identify connected tasks, appointment briefings, commitments, approved message drafts, and specific document sections that still refer to the earlier plan. Approval can update an existing task without duplicating it. **Update draft from approved facts** refreshes affected document items without an AI call and keeps earlier approved PDFs immutable. Reviewed facts and filtered recent records supply shared context to the five existing roles.

The Sarah / Willow Lane client record has **Connected example · Sarah’s second conversation** for a provider-free rehearsal. Follow [the evolving-relationship demo](docs/DEMO_GUIDE.md). Saved fictional output is labeled; live extraction and writing quality require separate authenticated OpenAI verification. Memory is limited to practical supported topics, not speculative personal profiling. Retiring information removes it from future context while preserving audit history; the guarded sample reset removes sample memory and its history.

## Configuration

Copy [`.env.example`](.env.example) to `.env`. Never commit credentials or expose them through `NEXT_PUBLIC_` variables.

| Variable                   | Requirement and purpose                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`             | Required in production. PostgreSQL connection string. If absent in development, local PGlite is used.                                                  |
| `PGLITE_DATA_DIR`          | Optional local storage override. Defaults to `.agentdesk/postgres`; `:memory:` is useful for isolated tests.                                           |
| `OPENAI_API_KEY`           | Optional. Enables new generation, rewriting, and transcription. Missing keys produce a clear unavailable state while saved sample work remains usable. |
| `OPENAI_MODEL`             | Text/structured output model; default `gpt-6.1-sol`, using low reasoning for interactive latency. Use a compatible model available to your project.     |
| `OPENAI_TRANSCRIBE_MODEL`  | Audio transcription model; default `gpt-transcribe`.                                                                                                   |
| `OPENAI_REWRITE_MODEL`     | Optional rewrite-specific model. If blank, uses `OPENAI_MODEL`. Sol uses low reasoning; other models retain their own defaults.                         |
| `DEMO_PASSWORD`            | Required in production, at least 12 characters. Shared password for the pilot workspace.                                                               |
| `SESSION_SECRET`           | Required in production, at least 32 characters. Use a cryptographically random value.                                                                  |
| `APP_URL`                  | Optional canonical origin for mutation Origin checks, such as `https://agentdesk.example.com`. If set, access the app using that exact origin.         |
| `PORT`                     | Hosting port. Render supplies this automatically; Next.js honors it.                                                                                   |
| `AGENTDESK_SKIP_AUTO_SEED` | Set to `1` to suppress local first-access seeding. Migration/seed CLI scripts manage this internally.                                                  |

Generate a session secret with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Restart the development server after changing environment variables. Configure model names and an API key on the server; there is no browser-side key storage.

## Architecture

The app uses Next.js App Router, React, TypeScript, Tailwind CSS, locally served Inter typography, and Lucide icons. PostgreSQL tables are modeled with Drizzle ORM. Managed PostgreSQL and the local PGlite fallback execute the same versioned SQL migrations.

| Area                                 | Responsibility                                                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app`                            | App Router entry points, protected sign-in, and server route handlers                                                                  |
| `src/components/agentdesk.tsx`       | Workspace shell, navigation, shared data state, and dialog orchestration                                                               |
| `src/components/workspace`           | Separate Today, Review, Listings, Team, details, capture, settings, and search modules; shared task/progress UI and browser API helper |
| `src/components/ui.tsx`              | Shared visual primitives, assistant identities, formatting, and accessible modal behavior                                              |
| `src/lib/types.ts`                   | Shared records and workflow contracts                                                                                                  |
| `src/lib/db/schema.ts`               | Relational database schema, workspace ownership, and relationships                                                                     |
| `src/lib/db/index.ts`                | PostgreSQL/PGlite initialization and migration execution                                                                               |
| `src/lib/db/seed.ts`                 | Coherent, repeatable fictional workspace                                                                                               |
| `src/lib/ai.ts`                      | Server-only OpenAI calls, role orchestration, structured validation, evidence checks, and voice rewriting                              |
| `src/lib/auth.ts` and `src/proxy.ts` | Protected workspace, signed sessions, Origin checks, bounded input, and pilot rate limits                                              |
| `src/lib/integrations.ts`            | Honest capability contracts for future external providers                                                                              |
| `migrations` and `scripts`           | Versioned schema changes and migration/seed CLI                                                                                        |

The five assistant identities are coordinated responsibilities in one contextual generation request. They do not run as five independent agents. For generation, the server sends the selected agent's name and communication preferences, the client's name/relationship, selected property address, a small set of approved writing examples, scoped notes/tasks/appointments/history, and the submitted conversation or follow-up evidence snapshot. Structured contact email/phone fields are omitted. Rewriting also includes the current message draft and extracted facts. Generated facts and actions carry source quotations and certainty. Structural and evidence checks reject unsupported output before persistence, but the agent must still review meaning and factual accuracy.

Generation and transcription run as bounded request/response operations with a timeout and no automatic provider retry. There is no durable background queue in this pilot. Add a job table/worker with idempotent completion before introducing long recordings, automatic ingestion, or scheduled work. Approved internal work uses transactional database updates and retains the original conversation, original proposal, final edits, and decision audit. Repeated request IDs and source-aware recommendation keys prevent duplicate persisted work. Legacy decisions made before audit history existed are identified honestly; their lost originals are not reconstructed.

## Database operations

```powershell
npm run db:migrate
npm run db:seed
```

Migrations are applied in filename order and recorded with checksums. Applied migration files must not be edited; add the next numbered migration. PostgreSQL migration execution uses an advisory lock. Production migrations run explicitly through `npm run db:migrate`, before the service starts; HTTP requests never run production migrations. Local development still migrates automatically. The seed is versioned and repeatable: sample upgrades add required fictional records and align the presentation calendar while preserving saved review decisions, task state, and edited notes. Running it again does not reset a demo.

Settings provides an explicit **Restore fictional workspace** action guarded by the exact phrase `RESTORE FICTIONAL WORKSPACE`. It deletes added records only inside the designated sample workspace and reseeds it transactionally; non-sample workspaces are refused. This shared demo must not hold real customer data.

To begin a fresh local demonstration without deleting prior work, stop the server, set `PGLITE_DATA_DIR=.agentdesk/fresh-demo` in `.env`, and restart. Use a unique directory for each isolated demo. For hosted PostgreSQL, use a separate database for a clean environment. Back up persistent data before schema or environment changes.

## Render deployment

The checked-in [render.yaml](render.yaml) describes a Node web service and a private Render PostgreSQL database in the same region. Its shape was validated against [Render's official Blueprint schema](https://render.com/schema/render.yaml.json); runtime/build behavior follows [Render's Next.js deployment guide](https://render.com/docs/deploy-nextjs-app). Creating resources incurs the hosting charges shown by Render; nothing is deployed by running the local application.

1. Put this repository in your Git provider and create a Render Blueprint from it.
2. Review the web/database plans and region in `render.yaml`. The blueprint is deliberately configured for a single application instance and durable PostgreSQL.
3. Supply a unique `DEMO_PASSWORD` of at least 12 characters when Render prompts. The blueprint generates `SESSION_SECRET`, wires `DATABASE_URL` to the database's private connection string, and sets `APP_URL` from the service's `RENDER_EXTERNAL_URL`.
4. Optionally add `OPENAI_API_KEY`, `OPENAI_MODEL`, and `OPENAI_TRANSCRIBE_MODEL` in the service's Environment settings. A key is not required to review saved sample results. When attaching a custom domain, replace the blueprint's `APP_URL` self-reference with that exact public HTTPS origin and apply it to the service.
5. Render builds with `npm ci --include=dev && npm run build`. Before deployment it runs `npm run config:check`, applies migrations, and runs the idempotent seed. `npm run start` repeats the configuration check before starting the service, which binds to `0.0.0.0` and uses Render's `PORT`.
6. Confirm `/api/health` is healthy, the sign-in screen protects the workspace, and an approved sample task persists after a restart. Keep the sample designation visible during the pilot.

The production app refuses local database fallback and fails closed when access protection is not configured. Uploaded audio is never written to the service filesystem. The PostgreSQL resource's empty public IP allow list disables external database access; the web service uses Render's private network. Adjust that allow list deliberately if you later need administrative access from outside Render. See the [Blueprint reference](https://render.com/docs/blueprint-spec) for hosting settings.

`npm run build` compiles the production application; `npm run start` runs in production mode and therefore requires PostgreSQL and access credentials even when launched locally. Continue using `npm run dev` for the zero-configuration embedded-database experience.

Configuration errors now stop deployment immediately with a message naming the setting to correct, without printing secret values. For example, a short `DEMO_PASSWORD` fails the configuration check instead of leaving a running process that silently fails health checks. `/api/health` uses a bounded, read-only database probe that verifies the seeded workspace and does not acquire migration locks. If it fails, the server logs distinguish configuration problems from database readiness failures. A successful build alone does not mean Render has routed traffic to the new service.

## Access and client-data boundaries

Sessions are HMAC signed, expire after 12 hours, and use HttpOnly, SameSite=Strict cookies (Secure in production). Mutating routes validate the request Origin. Inputs are validated and bounded, database operations use the ORM's parameterized queries, and logs avoid transcripts, client details, audio bytes, credentials, and provider response bodies.

The note entry form accepts up to 24,000 characters; the server permits transcripts up to 40,000 characters. Audio uploads accept MP3, MP4, MPEG, MPGA, M4A, WAV, WebM, Ogg, or FLAC, up to 20 MB. Explicit authorization is required before processing a note or recording with OpenAI. Audio exists only in request memory and is discarded after transcription; a transcript becomes part of the selected conversation when the subsequent work package is saved. Text generation uses `store: false`; provider retention and processing are still governed by the configured OpenAI project's policies. This app does not claim to provide provider-side zero retention.

The access model is a **single shared workspace password**, not per-user identity or production RBAC. Workspace identifiers and tested database ownership checks provide a foundation for future tenancy. Before onboarding real independent teams, implement individual authentication, server-enforced roles and memberships, broader tenancy isolation tests, consent/retention/deletion policy, and audited integration credentials. No billing, subscriptions, inbound webhooks, outbound communications, or CRM synchronization are enabled.

Pilot request limits are in-process: 20 AI operations per 10 minutes across the workspace, plus login throttling. Use a shared limiter and durable job coordination before running multiple application instances. A model's structured output and grounding checks reduce obvious errors; they do not replace the agent's final review.

## Validation and development

See the [validation record and screenshots](docs/VALIDATION.md) for the initial verified results and remaining provider/deployment checks.

```powershell
npm run typecheck
npm test
npm run build
```

`npm test` ignores your normal `DATABASE_URL` and tests domain behavior in a temporary PGlite database. To run the same approval, rollback, persistence, and tenant-isolation tests against PostgreSQL, create an empty disposable local database whose name starts with `agentdesk_test_`, then run:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://USER:PASSWORD@127.0.0.1:5432/agentdesk_test_domain'
npx tsx --test tests/domain.test.ts
Remove-Item Env:TEST_DATABASE_URL
```

The PostgreSQL test target must use a loopback hostname and have no workspace records. The suite creates its own sample data and leaves it in that disposable database; remove the test database or its dedicated container afterward. Never point this setting at a development or production workspace.

[GitHub Actions](.github/workflows/ci.yml) installs locked dependencies, starts PostgreSQL 17, migrates and seeds it, then runs type checking, PGlite tests, the domain suite against a separate fresh PostgreSQL database, and the production build. It then starts the compiled application and tests health response time, protected access, sign-in, and an authenticated workspace read using `npm run test:production`. This smoke test only accepts a local disposable database named `agentdesk_test` or `agentdesk_test_*`. CI uses no OpenAI key and never sends real messages. Browser inspection remains part of the release process: check desktop/mobile Today, edit/approve/reject Review actions, complete a listing task, change communication preferences, inspect Team totals, and verify protected access when credentials are enabled.

Health checks expose only service readiness. Application errors return concise messages; server logs include error categories without client content. Treat database backups, monitoring, alerting, and provider spending limits as deployment responsibilities before expanding a pilot.
