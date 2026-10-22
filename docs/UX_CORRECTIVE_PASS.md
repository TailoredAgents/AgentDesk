# AgentDesk corrective UX pass

October 22, 2026. Implements the priorities approved after the [product audit](UX_PRODUCT_AUDIT.md), starting from `23f830eda37bd53a5cf4ca95b754f31846f1be65`.

## Corrected behavior

| Audit issue | Result | Verification |
| --- | --- | --- |
| UX-01 | Appointment view warns when its briefing uses an earlier plan, shows the current reviewed facts and their certainty, links to client context, and retains the old briefing in a disclosure. Confirmed appointment time is untouched. | Sarah's Wednesday cleaning and requested Thursday photography appeared inside the appointment on desktop and mobile. October 23, 11:00–11:20 AM remained booked. Selector regression plus existing domain/production situation tests passed. |
| UX-02 | New Conversation offers Keep editing, Keep draft & close, and explicit discard. Notes, client/property, mode and selected audio file remain in memory per workspace/agent across ordinary app navigation. Reload/close warns about retained drafts; reopening requires consent again. | Desktop: type, close, keep, navigate to Listings, reopen with identical text, explicitly discard and reopen empty. Mobile: keep/reopen identical text. Sample reset cleared a retained draft. Hardware recording was not exercised. |
| UX-03 | The selected review determines its tab; the visible client, selected record and URL stay synchronized across partial/full saves and agent switches. Save feedback names the client. | Reviewed Michael, switched to Sarah, approved one action: Sarah and `package-sarah` remained selected with six pending. Full review included a rejection and stayed with Sarah. Mobile approval passed. Switching to Olivia cleared the old package URL, returning to Jordan selected his own work. Automated selection regression passed. |
| UX-04 | AI-off Capture opens an existing matching fictional review directly, without treating typed notes as generated work. | Michael and Sarah paths worked; Prepare remained disabled with AI off. Scoped fallback regression rejects other agents/properties, live outputs and non-sample workspaces. |
| UX-06 | Earlier proposals now carry a package-level warning and individual outdated-wording labels, with direct access to the current client situation. Quick copying is unavailable for an outdated approved message. History remains intact. | Approved Sarah's new situation first, then opened her older pending work: summary, message, note, listing update and photography task were marked; unrelated checklist/question remained unmarked. Desktop/mobile rendering and changed-fact regression passed. This is a visible warning, not a new server approval-blocking policy. |
| UX-07 | Today leads with one named follow-up. Other follow-ups are a compact disclosure; review work is grouped, and tasks already represented by reviews/follow-ups are omitted from Other tasks. All tasks restores the complete list. | Michael appeared once in the main follow-up queue. Other follow-ups opened Sarah; All tasks exposed all five original open tasks, including the linked review reminder and Michael's task. Existing prioritization rules are unchanged. |
| UX-08 | Review groups Communications, Client & listing records and Next steps. Conversation evidence is available on demand on desktop as well as mobile. The confirmation area names the client, decisions, remaining work and no-send behavior, and links to exact effects. | Individual approval, rejection, partial save, source/history disclosures and mobile confirmation were exercised. Regression verifies every action and saved status is retained exactly once in the groups. Existing approval transaction tests passed. |
| UX-09 | Follow-up offers Copy approved draft when the selected approved wording is current. Record follow-up completed exposes only the associated tasks/commitments, using existing explicit completion operations. | Copy showed the no-send/no-completion notice and left Michael's task and Team count open. Explicit completion then removed his recommendation and reduced Jordan's count from two to one. Desktop and mobile paths passed. |
| UX-11 | Workspace search finds documents and tasks by title/work text, client or address. A document result opens its newest version; other versions remain available in its editor. | Disclosure task search opened that task directly. Seller preparation search opened the saved editor/version. Unit tests cover client/title/address queries, empty results and exact IDs. This does not claim full-text search across every historical document version. |
| UX-12 | Situation warnings open the affected appointment, task, commitment, document version or message review. The existing editor/controls handle the work; closing returns to the underlying context. | Direct appointment warning and exact affected version opened on mobile. Task search and completion controls were checked. Proposed-impact disclosures also expose direct links. Target mapping regressions passed. |
| UX-18 | Team follow-up counts open the complete list for that agent, with direct follow-up actions; closing a follow-up returns to that list. | Jordan's desktop “2 open” and mobile “2 follow-ups” both opened Michael and Sarah. Completing Michael's linked task left Sarah and count one. Broader Team review-queue/support redesign remains deferred. |
| UX-25 | Written conversation input precedes consent text; consent still gates submission and stays ahead of microphone controls. Mobile headers/spacing and Review's sticky summary are smaller, with usable decision controls and a direct exact-effects link. | Responsive 390×844 capture, retained notes, pending Review, exact-effects confirmation, appointment warning, document versions and Team list checked. No horizontal page overflow observed. Document-editor footer redesign and physical keyboard/microphone testing remain outstanding. |

Visible labels now use Client message, Client note, Client situation, Update task and Needs confirmation in Review; Team refers to reviews rather than internal work packages. Source history and technical evidence remain available. All five roles, the six sample agents, Workstyle, seller documents, approval transactions and the separate pilot are preserved. No Copilot, SMS or new provider integration is introduced.

Sample recovery also clears transient selections, including a completed follow-up that would otherwise reopen when reset restored its recommendation.

## Validation

- `npm run typecheck`: passed.
- `npm test`: 158 tests, 156 passed, two PostgreSQL-only checks skipped under the local PGlite run, zero failures. Five new workflow regression tests cover selection, saved examples, appointment/stale-action context, review grouping and search/target mapping.
- Disposable PostgreSQL 17: `tests/domain.test.ts`, `tests/crm.test.ts`, `tests/workstyle.test.ts`: **80 passed**, zero skips/failures. This includes the PostgreSQL readiness checks omitted by the PGlite run.
- `npm run build`: passed with Next.js 16.4.2.
- Fresh PostgreSQL migrations and sample seed: passed.
- `npm run test:production`: passed. Covers startup/readiness, sample auth, individual pilot isolation/deprovisioning, missing-provider failures, partial/concurrent approvals, parsed immutable PDFs, document copying/refresh, confirmed calendar export, coordinated situation changes, human correction and sample-only reset.
- Actual rendered browser rehearsal: desktop 1280×720 and mobile 390×844. No captured browser console errors. Notes were fictional. Test storage was `.agentdesk/ux-fixes-2026-10-22`, served on localhost:3003, separate from the user's saved workspace and Render data.

The PDF rehearsal approved version 1, accepted the changed Sarah situation, refreshed a new draft from approved facts, approved version 2, downloaded both, and downloaded version 1 again. Version 1's SHA-256 before/after was identical: `b73a6c562a40b019fbf7adcce6d27436d6f82e5c013e88c7a51c6dda49cc10b4`. Version 2 was distinct: `ddffcee84002d0d663c78e5089041ba84743a268952db25305e906148c391f6b`. Version 1 retained Monday/Tuesday; version 2 showed Wednesday/Thursday with photography still requested. Sample reset subsequently restored the original document, review queues, tasks, commitments and Workstyle suggestions.

## Browser regression checklist and evidence

These are actual rendered screenshots, not mockups. They show successive rehearsal states; counts and saved versions therefore differ. Earlier captures can precede the final spacing/copy adjustments. The numbered checks above can be repeated against a fresh fictional workspace without OpenAI credentials.

| Evidence | Observed state |
| --- | --- |
| [01](screenshots/ux-fixes/01-retained-conversation.jpg) | Written note retained after navigating to Listings and reopening Capture. |
| [02](screenshots/ux-fixes/02-sarah-partial-save.jpg) | Sarah partial save and client-specific success feedback. |
| [03](screenshots/ux-fixes/03-followup-copy-and-completion.jpg) | Approved copy, open task, explicit completion control. |
| [04](screenshots/ux-fixes/04-team-followup-list.jpg) | Both Jordan follow-ups on desktop. |
| [05](screenshots/ux-fixes/05-search-task-direct.jpg) | Search opens the exact disclosure task. |
| [06](screenshots/ux-fixes/06-stale-appointment-desktop.jpg), [07](screenshots/ux-fixes/07-stale-appointment-mobile.jpg) | Current facts inside the appointment; unchanged booked time. |
| [08](screenshots/ux-fixes/08-mobile-capture.jpg) | Mobile notes, consent and Keep draft & close. |
| [09](screenshots/ux-fixes/09-mobile-review.jpg) | Reviewed Sarah identity and source disclosure (before final header compaction). |
| [10](screenshots/ux-fixes/10-refreshed-pdf-version-mobile.jpg) | Approved document version 2 on mobile; version 1 remains selectable. |
| [11](screenshots/ux-fixes/11-sample-restored.jpg) | Successful reset returns to Today without reopening old dialogs. |
| [12](screenshots/ux-fixes/12-mobile-pending-review.jpg), [13](screenshots/ux-fixes/13-mobile-review-confirmation.jpg) | Compact mobile review and exact approval effects. |
| [14](screenshots/ux-fixes/14-mobile-team-followups.jpg) | Both Jordan follow-ups on mobile. |
| [15](screenshots/ux-fixes/15-today-desktop.jpg) | One named next action on Today. |
| [16](screenshots/ux-fixes/16-older-review-warning.jpg), [17](screenshots/ux-fixes/17-older-review-warning-mobile.jpg) | Older pending Sarah work visibly marked on desktop/mobile. |

## Limits and next controlled pass

Draft retention is **in this tab's memory**, not durable cross-session storage. A browser/OS crash can still lose it. Audio-file retention is implemented but hardware recording, playback and transcription were not exercised in this pass. Live generation/rewrite, real Google sign-in, actual Lofty refresh/write/read-back and external delivery remain unverified without provider credentials; saved examples and missing-provider tests are not live-provider evidence.

Keep pilot UX-05 and UX-20–24 for a controlled pass with authenticated test accounts and approved provider fixtures: operation/task-scoped drafts; role-aware onboarding; a compact exact-content approval/submission/read-back sequence; readable source context; named client-filtered execution history; and correct no-results recovery. UX-32's pilot entry/recovery also remains. This pass changes no pilot authorization, CRM execution, provisioning or provider behavior.

Other audit work remains, including broader client browsing, preference hierarchy, Team support prioritization, document editor compaction and the other unselected P1/P2 findings. UX-06's wider server-side stale-proposal policy is not claimed fixed by the new warning. No post-fix 0–100 scores or user-study result is asserted; validate with the six intended agents after the presentation. Copilot can later invoke the same stabilized workflows.

## Release verification

Local validation is complete. Git push, CI and Render observations are recorded in the delivery message after publishing this change. A public `/api/health` response confirms application/database readiness, but does not independently identify the deployed Git revision.
