# Validation record

## Relationship & Situation Intelligence — October 22, 2026

The new migration is `0006_relationship_intelligence.sql`. It adds one scoped fact table and metadata on existing review actions; changes, corrections, and decisions reuse the existing package and audit architecture. Production readiness requires both work-product and intelligence migration markers.

Verified during implementation:

- Production build and TypeScript checks pass.
- Default automated suite: **105 passed, 2 PostgreSQL-only checks skipped**. The separate PostgreSQL 17 domain suite passed **34/34** in a disposable database. These cover extraction evidence, explicit preferences, event dates, confirmed versus requested changes, no-op comparisons, conflict handling, duplicate proposals, current context, scoped impacts, correction/retirement, task updates, source history, and immutable PDF refreshes.
- Compiled production HTTP checks pass for authenticated saved-change loading, durable retries, explicit fact/task approval, human corrections, and creating a refreshed draft without an AI key. Existing authentication, origin, PDF, calendar, rollback, and sample-reset checks remain enabled.
- In an isolated production browser workspace, the original seller PDF and conversation actions were approved. The second saved conversation showed before/after facts and connected impacts. Approval changed current facts and the existing task, preserving the patio question. Version two was generated, approved, and downloaded; version one remained accessible and unchanged. A human preference correction was prepared and approved through Review. Team displayed record-based counts.
- All three pages of the downloaded version-two PDF were rendered and visually inspected. The new dates and requested certainty are readable, and the unchanged guidance and questions remain intact.
- Desktop and 390 px mobile profiles were visually inspected; the final browser session had no console warnings or errors. Updated approved PDFs clear active operational warnings while their older versions retain history warnings. Screenshots: [Current schedule](screenshots/intelligence-profile-desktop.png), [Mobile profile](screenshots/intelligence-profile-mobile.png).
- **Live OpenAI extraction/generation is unverified:** no `OPENAI_API_KEY` is configured in this local environment. Tests of saved examples, deterministic logic, provider failure behavior, and structured output validation are not live model evaluations.

The change rules support a bounded set of practical topics. Ambiguous changes are retained as requests or disputed information for human resolution. Appointment/commitment warnings require a human check; this release does not independently change bookings or send messages. Historical notes and PDFs are preserved with warnings, and retired memory is filtered from future provider context. Shared sample access remains a preview, not per-agent authorization.

## Administrative work products — October 21, 2026

| Check | Result |
| --- | --- |
| `npm test` | 96 passed; 2 PostgreSQL-only checks skipped in the default PGlite run |
| PostgreSQL 17 domain suite | 31/31 passed in isolated disposable databases |
| `npm run typecheck` | Passed |
| `npm run build` | Passed with document, PDF, and calendar routes included |
| `npm run test:production` | Passed against compiled Next.js and disposable PostgreSQL; local health response 16 ms |
| PDF rendering | Three-page sample and six-page long-content fixture rendered and every page visually inspected; no clipping or overlapping text |
| Browser | Desktop and 390 px mobile document editor inspected; no console warnings/errors in the test tab |
| `npm run test:ai:live -- --allow-live` | **SKIPPED**: no local `OPENAI_API_KEY`; live seller/briefing generation, rewriting, and transcription remain unverified |
| Fresh dependency audit | Registry audit endpoint timed out; no fresh audit result claimed |

The automated checks cover scoped source snapshots, facts versus general guidance, fabricated citations/dates/prices/confirmations, pending edits, stale revisions, explicit approval, real PDF rendering, rollback on missing/invalid PDF bytes, concurrent approval, durable retrieval after reopening storage, immutable approved versions, provider-free copied versions, retained evidence after source records change, and history ordering independent of sample timestamps. PostgreSQL readiness now checks migration 0005 without acquiring a migration lock.

Production HTTP tests parse the downloaded PDF, check metadata/page structure/SHA256, verify inline and attachment responses and unauthorized denial, and confirm that edits or copies cannot mutate approved bytes. They also cover duplicate request replay, missing-provider responses without database writes, question/task execution and resolution, explicit calendar confirmation, invalid and daylight-saving-ambiguous times, UTC `.ics` exports for tasks and confirmed appointments, tentative-event rejection, stale scheduling conflicts, idempotent scheduling retries, and sample reset removing generated artifacts.

Browser checks used a separate disposable production workspace. A seller checklist item was edited and saved, approved, and downloaded as a real PDF. A second editable version retained the first approved version. The same work appeared under Today, Review, the property, the client, and Team. Nested document dialogs closed correctly with Escape. Explicit task times produced a downloadable calendar file with the expected UTC interval; after a production restart, editing the saved schedule correctly prefilled its time zone and times and required confirmation again. Approving a message, task, and unanswered question saved three distinct records; copying the message did not mark contact complete. Task completion updated Today and property progress, and explicitly resolving the question changed its status while preserving history.

Screenshots: [Approved PDF controls](screenshots/work-product-approved.png), [Mobile document review](screenshots/work-product-mobile.png). Generate the fictional standalone sample with `npx tsx scripts/render-sample-work-product.ts`; its output is intentionally untracked under `output/pdf/`.

All permanent document bytes are stored in the database, not Render's filesystem. No external messages, CRM writes, or calendar bookings were performed. Existing shared-password access remains a protected sample/pilot, not production multi-user authorization. Hosted deployment status is checked separately after pushing; local checks alone do not establish a successful Render deployment.

## Friday workflow improvements — October 21, 2026

| Check | Result |
| --- | --- |
| `npm test` | 69 passed; one PostgreSQL-only check skipped in the default PGlite run |
| PostgreSQL 17 domain suite | 20/20 passed in an isolated disposable database |
| `npm run typecheck` | Passed |
| `npm run build` | Passed; new follow-up, commitment, and sample-reset routes included |
| `npm run test:production` | Passed against compiled Next.js and disposable PostgreSQL; health returned in 15 ms locally |
| `npm run test:ai:live -- --allow-live` | **SKIPPED**: no `OPENAI_API_KEY` in this workspace |
| Browser | Desktop 1440 px and mobile 390 px inspected; no console warnings/errors in the final test session |

The automated suites cover evidence-based follow-up signals and urgency, no recommendations from silence alone, source ownership, new work after a previous follow-up completes, concurrent submission/approval deduplication, atomic partial approval, rejected and pending actions, original/edit audit, monotonic snapshots, stale AI results after changes or reset, sample-only restore and tenant isolation, seed upgrades preserving edits, expanded style context, grounding and date ambiguity, audio signatures, and recording lifecycle errors. Real PostgreSQL also verifies readiness independent of migration locks.

Production HTTP checks exercise sign-in, secure cookies, cross-origin denial, unauthorized access, two simultaneous partial approvals producing one audit, retained pending actions, persisted edits, follow-up refresh, missing-key failure without fake output, exact reset confirmation, and restored sample data. Additional HTTP probes rejected missing consent, malformed submission IDs, and an Ogg container falsely labeled WebM without creating records.

Actual browser checks used a separate disposable production workspace. Switching human agents changed Today and communication settings. Sarah's recommendation opened sourced commitments and a clearly labeled saved draft. A manually edited message and CRM note were approved, a listing update rejected, and three proposals left pending. The choices and original/edit history survived refresh. Client notes, approved drafts, listing tasks, and Team reflected the same saved records. Task completion appeared in the linked client record. Audio upload, playback, discard, consent gating, and the unavailable-AI state were verified with a synthetic fictional WAV fixture.

Physical microphone capture, actual provider transcription/generation/rewriting, project-specific model availability, and live writing quality remain **unverified**. Recording lifecycle success, permission denial, unsupported formats, cleanup, canceled permission requests, and failures were tested with simulated browser devices; those tests do not establish physical-device behavior. Run the [live evaluation](AI_EVALUATION.md) and rehearse in the presentation browser before promising a live AI demo.

The Render Blueprint and fail-closed startup checks remain in place. Local production success does not establish that the hosted deployment has completed or that its environment credentials are valid. No external CRM, email, SMS, or calendar integration was activated, and no external messages were sent.

Current screenshots: [Today desktop](screenshots/friday-today-desktop.jpg), [Today mobile](screenshots/friday-today-mobile.jpg). See the [presentation walkthrough](DEMO_GUIDE.md).

## Initial implementation — historical results

Checked October 21, 2026. The following records describe the initial implementation before the Friday workflow improvements.

| Check | Result |
| --- | --- |
| `npm test` | 26/26 tests passed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed cleanly, without warnings, after the Drizzle 0.45.4 update |
| PostgreSQL integration | 10/10 domain tests passed against real PostgreSQL 17.11 with Drizzle 0.45.4 |
| Production dependency audit | `npm audit --omit=dev`: zero reported vulnerabilities |
| Render Blueprint | Passed validation against Render's official JSON schema |

The PostgreSQL run covered migrations, repeatable seeding, approvals, concurrent duplicate approval, transaction rollback, workspace ownership checks, and persistence. It used an isolated disposable database; the container and volume were removed afterward. Normal tests use a temporary PGlite directory and ignore the application's `DATABASE_URL`.

Browser inspection covered desktop at 1,440 pixels, tablet at 768 pixels, and mobile at 390 pixels. The Today, Review, Listings, and Team views were inspected, including responsive navigation and property/client dialogs. An edited Emily Carter follow-up was approved with its CRM note excluded; the outcome persisted across application restarts. Sarah Mitchell's package remains pending in the local sample workspace for the main demonstration.

Task completion and reopening updated Today and listing progress, communication preferences saved successfully, and workspace search returned the matching client and work package. The final browser session reported no console warnings or errors.

Screenshots:

- [Today — desktop](screenshots/today-desktop.jpg)
- [Review — desktop](screenshots/review-desktop.jpg)
- [Listings — desktop](screenshots/listings-desktop.jpg)
- [Team — desktop](screenshots/team-desktop.jpg)
- [Today — mobile](screenshots/today-mobile.jpg)

No OpenAI API key was available. Live generation, transcription, and message rewriting therefore remain untested against the provider; automated checks of their validation and safety boundaries do not establish live model behavior. No Render deployment or external CRM, email, calendar, or communications connection was performed. Message approval saved internal drafts and sent nothing externally.

## Production startup checks added October 21

Following a hosted deployment readiness delay, production requests were changed to avoid migration locks, readiness was bounded to 2.7 seconds, and configuration validation was added before deployment and startup. Invalid configuration fails with fixed messages naming the setting; secret values are never logged.

- Default test suite: 34 passed, with the PostgreSQL-only migration-lock regression skipped locally.
- Real PostgreSQL 17 domain suite: all 12 passed, including readiness while another connection holds the migration lock and a simulated stalled PostgreSQL handshake.
- Production build and TypeScript: passed.
- Compiled application HTTP smoke test against disposable PostgreSQL: passed. Health completed in 19 ms; unauthenticated access, sign-in, secure cookie attributes, cross-origin login denial, and authenticated workspace retrieval were verified.
- These HTTP checks now run in GitHub Actions after the production build. Local timing does not establish hosted Render timing.
