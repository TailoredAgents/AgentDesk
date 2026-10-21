# Validation record

Checked October 21, 2026. This records the initial local implementation; rerun checks after later changes.

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
