# Lofty capability investigation — 22 October 2026

Written before connector implementation. These are documented contracts, **not a successful live integration test**. No developer approval, client credentials, or customer authorization were available.

## Integration decision

Use OAuth-authenticated REST behind a provider adapter. Lofty's [MCP page](https://lofty.com/lofty-mcp) advertises 123 operations and API-equivalent permissions, but does not publish a transport URL, executable tool catalog, or onboarding contract. A second MCP connection would add no verified capability to this pilot.

The [REST reference](https://api.lofty.com/docs/reference) and [V2 reference](https://api.lofty.com/docs/reference-v2) contain OpenAPI specifications in the official documentation's client bundle (`main.cd2c48eb.js`, inspected on this date). Direct server rendering of their routes currently returns the introduction; the actual specifications were extracted as data, without executing the bundle. Endpoint and response details below come from those specifications.

## Capability matrix

Every operation additionally requires the vendor's endpoint grant and the authorizing user's record permissions. Documentation is not evidence of a particular account's access.

| Capability | Documented contract | Foundation decision / limitations |
| --- | --- | --- |
| Account identity | `GET /v1.0/me`: `memberUserId`, `teamId`, role and timezone | Verify both IDs against the provisioned agent and brokerage before retaining tokens |
| Leads / contacts | `GET /v1.0/leads`, `GET /v1.0/leads/{leadId}` | Assigned-agent filter; canonical lead ID; bounded paginated reconciliation. No documented modified-since filter selected |
| Notes | `GET /v1.0/notes?leadId=…`, `GET /v1.0/notes/{noteId}`, `POST /v1.0/notes` | Read and human-approved creation. 2,000-character limit; create returns an ID before asynchronous persistence is necessarily readable |
| Tasks / appointments | `GET/POST /v2.0/tasks`, `GET/PUT /v2.0/tasks/{taskId}` | Read tasks and appointments; approve regular task creation and text/deadline updates. Completion uses separate endpoints and is excluded |
| Activity history | `GET /v2.0/leads/{leadId}/activities` | Authorized CRM activity only; bounded history; not evidence of off-platform phone activity |
| Transactions | `GET /v1.0/leads/{leadId}/transactions`, `GET /v2.0/transactions` | Documented read capability; request only lead-scoped information needed for context |
| Listings | `GET /v1.0/listing`, `GET /v1.0/getPublishedListings` | Listing search/publication contracts are not equivalent to an agent's complete listing inventory; no listing mutation in this pilot |
| Communications | V1 call/email/text endpoints; V2 agent communication and individual detail endpoints | Documented, permission-dependent. Coverage is Lofty-captured communications, not personal-device history. No sending or phone migration |
| Calendar | `GET /v2.0/calendar`, individual calendar reads; tasks include appointments | Calendar scopes and task scopes are distinct; appointment context can start from the task read contract |
| Team / assignment | `/v1.0/me`, `/v1.0/members`, `/v1.0/org`, lead `assignedUserId`/`teamId` | AgentDesk membership is explicit, not inferred from names/emails or the demo's view switch. No assignment writes |
| Webhooks | `/v1.0/webhook`, `/v1.0/webhooks`; lead, note, transaction and communication events documented | Delivery is asynchronous and permission-dependent. Public payload documentation does not establish a signature-validation contract. Do not expose an unauthenticated webhook receiver; use on-demand reconciliation |
| Idempotency / conditional writes | No idempotency-key or conditional-update contract found for selected writes | Local execution ledger prevents repeat submissions. Uncertain network outcomes require reconciliation; never blindly retry creates. Preflight reads reduce but cannot eliminate provider-side races |

## OAuth and security gates

The [OAuth reference](https://help.lofty.com/hc/en-us/articles/47801571926811-Lofty-OAuth-2-0-API-Reference) documents vendor authorization using `clientId`, a registered callback receiving `code`, and `POST https://crm.lofty.com/api/user-web/oauth/token` with Basic client authentication and form-encoded authorization-code or refresh grants. The returned scope is `openApi`; endpoint grants are managed separately. The guide's curl example omits an explicit POST despite the endpoint heading; verify the form contract during authorized testing.

The public guide does **not** document state echo or PKCE. Live Connect must remain disabled until Lofty confirms state round-trip support for this application. Never silently omit callback state checks to accommodate an undocumented flow. No programmatic revocation endpoint was found; local disconnect must erase tokens and cached CRM content and explain the separate Lofty-side revocation step.

[Getting started](https://api.lofty.com/docs/) documents permission error `200100`. [JavaScript integration](https://api.lofty.com/docs/javascript-integration) requires lossless 64-bit ID parsing and permits string IDs in request bodies. [Pagination](https://api.lofty.com/docs/pagination) documents `_metadata`; the generated lead-list schema instead names `get_metadata`, so accept these two explicit variants and fail closed on malformed envelopes. [Rate limiting](https://api.lofty.com/docs/rate-limiting) documents 429 and rate headers, but describes reset units inconsistently. Stop a bounded run on exhaustion and use a conservative persisted cooldown, honoring valid Retry-After where available.

## Approval prerequisites

The [developer onboarding guide](https://help.lofty.com/hc/en-us/articles/4405826620571-Getting-Started-with-the-Lofty-Developer-Platform) requires developer registration and application review; later scope additions can require reauthorization. Obtain an authorized test account and explicit endpoint grants, verify security ambiguities, then conduct the two-agent isolation pilot. Do not advertise live availability until that test succeeds. [Lofty's authorization management guide](https://help.lofty.com/hc/en-us/articles/50319304837915-Managing-Authorization-by-Third-Party-Apps-Services) covers user-controlled disconnection.
