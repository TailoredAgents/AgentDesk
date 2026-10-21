# Validation record

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
