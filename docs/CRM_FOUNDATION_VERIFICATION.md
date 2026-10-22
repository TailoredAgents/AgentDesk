# CRM foundation verification — October 22, 2026

This is an integration-ready, isolated pilot foundation, **not a verified live Lofty deployment**. No customer credentials were used, no developer application was submitted, and no live Lofty connection or CRM mutation was performed. The sample remains independent.

## Implemented and checked locally

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` | 137 tests: 135 passed, 2 PostgreSQL-only tests skipped in the default PGlite run |
| CRM suite against disposable PostgreSQL | 30 passed; controlled provider responses, no real Lofty calls |
| Existing domain suite against disposable PostgreSQL | 34 passed, including the two PostgreSQL-only checks |
| `npm run build` | Passed; existing routes and new isolated pilot routes compile |
| `npm run test:production` | Passed against a disposable localhost PostgreSQL database; health responded in 14 ms |
| Dependency audit | No reported vulnerabilities at implementation time |
| Desktop/mobile visual review | Connections panel, disabled pilot landing, and synthetic authenticated pilot layout reviewed; mobile width 390 px |

The CRM suite covers lossless 64-bit IDs, documented REST request shapes, token encryption and ownership binding, single-use/expired/wrong-user OAuth state, authorization denial and account mismatch, per-agent/per-brokerage isolation, bounded reconciliation, duplicate import prevention, out-of-order revisions, conflicts, stale context, missing/inaccessible records, partial permission errors, token refresh serialization and revocation, rate limiting, approved/rejected writes, idempotent submission, uncertain outcomes, task preflight conflicts, asynchronous note confirmation, disconnect cleanup, sourced shared AI context, explicit intelligence supersession, and context changes during generation.

Production HTTP verification covers shared-demo/individual identity separation, unprovisioned identities, immediate membership deactivation, Origin checks, disabled Lofty connection when approval is missing, and sample reset preserving isolated CRM records and membership. It also exercises the existing saved examples, concurrent/partial reviews, tasks, calendar export, intelligence corrections and situation changes, document revisions, parsed PDF downloads, and guarded sample restoration.

The tests use synthetic signed Auth.js sessions only to exercise HTTP authorization boundaries. They do **not** establish successful Google OAuth. UI fixtures were confined to a temporary local test database; none are shipped as a live connection or seeded into production. The retained screenshots show the actual unconfigured Connections panel:

- [Desktop Connections](screenshots/crm/connections.png)
- [Mobile Connections](screenshots/crm/connections-mobile.png)

## Implemented but awaiting authorized credentials

Individual Google sign-in; Lofty OAuth exchange and refresh; identity/permission checks; assigned-lead and related-context retrieval; note creation; task creation and narrow updates; and read-after-write confirmation all require a controlled real-account verification. Optional CRM AI drafting uses the configured OpenAI API but was tested here with controlled generation output, not customer data or a live model run.

## External approval and contract gates

- Lofty vendor/application approval or explicitly authorized development mode and endpoint grants.
- Provider confirmation and a controlled test of OAuth state round-trip behavior. The public OAuth guide does not document it; the app never disables state validation to work around that gap.
- Google identity application configuration and explicit two-agent membership provisioning.
- Actual operator website/privacy/support information and approval of any CRM-to-AI processing.

See [the official capability investigation](LOFTY_CAPABILITIES.md) for verified versus advertised operations, and [the setup guide](LOFTY_SETUP.md) for application wording, exact callback URLs, permissions, Render variables and the two-agent acceptance checklist.

## Deliberate limits

The real-data workflow is `/pilot`, not a conversion of all sample pages. It uses on-demand, bounded refresh rather than scheduled polling or unverified webhooks. Team leaders see their brokerage's connection health, not other agents' private CRM content. The pilot prepares five-employee work packages and copyable message/note drafts; seller PDF workflows remain in the sample. Full listing inventory, independent calendars, outbound communication, task completion, broad CRM edits and MCP are not enabled.

Provider idempotency/atomic conditional updates are not documented for the selected write contracts. The durable local execution claim prevents automatic duplicate submission; uncertain results require manual inspection in Lofty. Human review remains necessary for the meaning and accuracy of AI claims even when a source quote is valid. Retention policy, scheduled cleanup, broader identity administration and a controlled live acceptance pass remain prerequisites before wider customer rollout.
