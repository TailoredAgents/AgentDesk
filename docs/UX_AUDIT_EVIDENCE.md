# UX audit evidence and coverage

Companion to [UX_PRODUCT_AUDIT.md](UX_PRODUCT_AUDIT.md). Baseline: `2b5f34ee04e4e19bf3544830e0f3d829804329d5`. Audit date: October 22, 2026.

## Environment and evidence integrity

- The real sample app used isolated PGlite storage, `.agentdesk/ux-audit-2026-10-22`, on localhost:3003. Original saved data and production data were not mutated.
- The pilot preview on localhost:3004 imported the existing `src/components/crm/pilot-workspace.tsx`, its child components and the existing app CSS. Its temporary local server supplied in-memory fictional API responses. It bypassed the authentication flow **only within a separate preview harness**, not within the application. No authentication configuration, application route, database or deployment was changed.
- Pilot fixtures included two fictional leads, a saved work package, six team connection states, partial refresh, a submitted note and an unknown task outcome. Buttons changed fixture state only. The fixture warning/banner is not part of AgentDesk. The shared JSON fixture does not model every server response or validation; do not infer service behavior from it.
- Desktop used 1280×720; the approved PDF viewer used its own browser layout. Mobile app and fixture inspection used 390×844; viewport values were checked in the rendered page. No physical-device, soft-keyboard, screen-reader or hardware-audio validation was performed.
- Actual sample actions included message edit/approval/copy, a partial administrative approval, document edit/approval/PDF creation/versioning, saved situation-change approval, calendar schedule save, task completion, and workstyle accept/Undo/dismiss. These changed only disposable fictional audit data.
- The approved PDF opened as a real three-page document. Page 1 was visually inspected in this pass. This is not a new full pagination/print-quality certification of all pages or arbitrary long documents.
- Browser tabs and both audit servers were closed after inspection. Browser viewport overrides were reset. The generated `next-env.d.ts` development-path change was restored. Only report/evidence files belong to the audit change.
- Some screenshots show transient success toasts or a particular scroll position. The report does not treat animation timing or fixture-only status inconsistencies as application defects.

## Coverage ledger

R = actual running sample; F = actual pilot component with mocked local responses; S = source inspection; U = unavailable or deliberately not executed.

| Area / implemented surface | Inspected interactions and states | Coverage boundary |
|---|---|---|
| Shell / Today | Desktop and mobile; main navigation; mobile drawer; hero next action; recommendations; changed-situation summary; documents; task To do/Done; listing preview; calendar; workforce footer. | R D/M. No large-dataset or live refresh latency benchmark. |
| Workspace / profile entry points | Same Settings destination identified for workspace switch, profile, Workspace settings and Team preferences. Team preferences actually opened. | R for Settings/Team preferences; S for equivalent callback mappings. No claim of an independent workspace-switcher feature. |
| Five AI Employee entries | Workforce dialog, role descriptions, record-based/AI-assisted distinctions, selected role and destination actions; mobile Daily Coordinator. | R D/M + S destination map. These are explanatory entry points, not five separately authenticated chats. |
| Follow-up | Michael reason, due date, evidence disclosure, saved draft, review handoff, approved draft state. | R D/M. Actual new AI preparation/rewrite U. |
| Review | Pending/Reviewed; package selection/fallback; editable message; per-action select; approve-all; final confirm; partial persistence; source/history disclosures; saved document entry. | R D/M. Partial approval and complete one-message approval executed. Bulk rejection and every conflict/error response not executed. |
| Review history / rejection / rewrite | Retained decision history and disabled refinement controls inspected. Rejection options exist. | R UI + S rules; no live rewrite. No claim every decision permutation passed. |
| Written Capture | Client/property selectors; default selection; note entry; note/audio switching; consent wording; saved example filler; unavailable AI banner; close/reopen recovery. | R D/M. New generation unavailable. The saved review journey is separate from the entered note. |
| Audio Capture | Consent gate, record/upload controls, formats/size copy, local-preview explanation and disabled preparation state. | R D/M UI. Hardware permission, recording, upload, playback, retry and transcription U. Controller/source inventory does not replace these checks. |
| Listings | All four sample properties; stage filters; text search; no-match message; Clear filters; card progress and next action. | R D/M. No real CRM inventory or large pagination tested. |
| Property detail | Client link, Documents/Tasks & commitments/History anchors, imagery, next step, affected facts, work products, tasks/commitments, history disclosure. | R D/M. Evidence is mainly Willow Lane; not every property has identical data. |
| Client record | Sarah Overview, Work & messages, History; Michael's sparse factual overview and available work; property link; plain contact fields. | R D/M. No real messages sent. |
| Intelligence facts | Current confirmed/requested facts, source/history, earlier information, changed fact effect, correction form. | R D/M. Manual correction and retirement submission not executed; reviewed saved change was executed. |
| Change review / impacts | Sarah saved second conversation; before/proposed context; affected work; approve-all and confirmation; current facts afterward; document and appointment consequences. | R. Same source facts verified in mobile client view. New AI extraction U. |
| Seller document preview | Saved example; factual versus general advice; section navigation; provenance/history; pending/approved; outdated-information warning. | R D/M. |
| Document editing / version controls | Title edit/save; approve with PDF; approved v1; pending v2; current-facts refresh to v3; editing guard; Keep editing; old versions retained. | R D/M. Reject/regenerate controls inspected, not executed; new AI generation U. |
| PDF | Actual approved PDF opened in its own browser tab with correct edited title and three-page count; first page viewed. | R desktop. Client delivery, print and all-page visual revalidation U. |
| Appointment | Today selected seller appointment; title/time/location/status; saved briefing; client link; calendar link; Prepare briefing unavailable; no saved appointment-specific document in this scenario. | R D/M. New AI briefing U. Stale-context defect reproduced. |
| Calendar | Date, time, timezone and consent controls; confirmed schedule saved; download invoked; mobile form. | R D/M. External import, invitation and calendar sync U. |
| Tasks / commitments | Complete one task; Today count/property progress changed; Done exposes Reopen; commitment source and Mark resolved UI inspected. | R D/M. No actual commitment-resolution or reopen mutation in this pass; controls/source inspected. |
| Activity | Desktop icon, mobile drawer entry; All/Prepared/Completed/Updates filters; dated events; details; client links. | R D/M. No agent/date filters implemented; no long-running retention audit. |
| Team | Six people, desktop table, mobile cards, coaching, listing support, counts, follow-up drilldown and Team preferences. | R D/M. Sample leadership display is not production authorization. |
| Settings / communication style | Agent preview; tone/length; advanced voice fields/examples; leader presentation; save semantics; Access & sign in. | R D/M + S unsaved guard. Changing every baseline preference was not necessary to evaluate the surface. |
| Workstyle | Evidence; accept; current value/source; Recent changes; Undo; seller customization controls; dismiss; saved comparison; empty-suggestion state. | R D/M. The saved comparison is not generated AI. All preference-value permutations and live effect on generation U. |
| Sample reset | Warning, scope, exact phrase and disabled action inspected. | R desktop + S. Destructive reset not executed during this audit. |
| Global Search | Sarah query, grouped results, Escape/focus return; document-title query produces no results. | R D/M + S index scope. Keyboard checks were limited; not a full accessibility audit. |
| Sample Connections | Lofty private-pilot explanation, disabled sample Connect, actual pilot setup link; planned Google/Microsoft and personal-phone explanation. | R D/M. No provider connected. |
| Sample login | Rendered password field, reveal control, primary action and responsive composition; source error branch. | R D/M UI. Successful login, wrong-password/rate-limit/expiry/logout responses U in this pass. No production password was entered or guessed. |
| Pilot entry | Real /pilot route awaiting setup; sample-return path and explanation. | R D/M. Configured Google sign-in and pending-member branches S; actual authentication/membership U. |
| Pilot connection | Connected and disconnected fixtures; identity/sync metrics; grant disclosure; setup diagnostics; Disconnect warning; Keep connected cancel. | F D/M. Authorization, refresh, token storage/removal, reconnect and real disconnect U. |
| Pilot lead selection | Named lead buttons; search and no-match result; open-by-ID control; context refresh control. | F D/M. Large lead sets, continuation, direct-ID access enforcement and actual refresh U. |
| Pilot source context | Note/task/activity/contact projections; freshness; expanded raw fields; reviewed intelligence. | F D/M. Provider shape, identity mapping and timestamps were fixture values. |
| Pilot work outputs | Role accordions; message edit/approval/copy controls; note proposal; observation/replacement controls; AI-disabled state. | F D/M. Saved fixture work only; actual AI/observation persistence U. |
| Pilot CRM writes | Simulated note propose→approve→submit; submitted and unknown outcome display; update-task selection and stale form text; rejection and read-back controls inspected. | F D/M. No real write, conflict check, rejection, duplicate prevention or read-back confirmed by this audit. |
| Pilot team / logs | Six connection-health states, refresh-history/partial status and audit disclosure. | F D/M. Real role scope and multi-user isolation U. |
| Loading / errors / recovery | 404 actually rendered; source inventory of main workspace loading/retry, route error boundary, API error messages and clipboard fallback. | 404 R desktop; other uncommon states S. No fault injection, network outage, clipboard-denial or error-boundary browser test in this pass. Existing older screenshots are not counted as current evidence. |

### Source checkpoints

These support the browser findings, not independent visual ratings:

- [review.tsx](../src/components/workspace/review.tsx): visible fallback package, selected package, tab effect and save behavior (around lines 71–103, 189–199).
- [capture.tsx](../src/components/workspace/capture.tsx): transient draft state and direct close when not busy (around lines 35–48, 162–167).
- [today.tsx](../src/components/workspace/today.tsx): appointment dialog displays saved briefing without the adjacent impact treatment (around lines 498–548).
- [team.tsx](../src/components/workspace/team.tsx): count drilldowns use the first follow-up client (around lines 185 and 297).
- [search-panel.tsx](../src/components/workspace/search-panel.tsx): query covers property address/city, client name and package title only (around lines 21–30).
- [activity-feed.tsx](../src/components/workspace/activity-feed.tsx): filter categories and generic client/property destinations.
- [settings.tsx](../src/components/workspace/settings.tsx) and [workstyle.tsx](../src/components/workspace/workstyle.tsx): separate save mechanisms, baseline/override presentation, dismissal empty state.
- [pilot-workspace.tsx](../src/components/crm/pilot-workspace.tsx): filtered empty-state copy (around 452–464); operation/task selectors retain content (around 862–925); global execution history uses lead/member IDs (around 970–1000).
- [pilot/page.tsx](../src/app/pilot/page.tsx): unavailable, signed-out and membership-pending branches.
- [repository.ts](../src/lib/repository.ts): existing stale-intelligence conflict check (around 591–608). This is why the report does not infer that all stale proposals can be silently applied.
- [message-actions.tsx](../src/components/workspace/message-actions.tsx): explicit copy-not-send and clipboard fallback.
- [work-products.tsx](../src/components/workspace/work-products.tsx): versioning, exact output approval, current-fact refresh and dirty-state protection.

## Screenshot index

Images show fictional records only. “Fixture” means UI rendering with mocked responses, not a real connected service. Links use repository-relative paths so they work in GitHub.

| # | Evidence | What it establishes |
|---:|---|---|
| 01 | [01-today-desktop.jpg](screenshots/ux-audit/01-today-desktop.jpg) | Initial Today desktop hierarchy and competing content groups. |
| 02 | [02-followup-desktop.jpg](screenshots/ux-audit/02-followup-desktop.jpg) | Michael follow-up explanation before approval. |
| 03 | [03-review-desktop.jpg](screenshots/ux-audit/03-review-desktop.jpg) | Review layout and per-action decisions on desktop. |
| 04 | [04-capture-desktop.jpg](screenshots/ux-audit/04-capture-desktop.jpg) | Written conversation setup. |
| 05 | [05-capture-audio-desktop.jpg](screenshots/ux-audit/05-capture-audio-desktop.jpg) | Audio capture setup; no microphone or provider call. |
| 06 | [06-capture-unsaved-before.jpg](screenshots/ux-audit/06-capture-unsaved-before.jpg) | Typed fictional note before closing Capture. |
| 07 | [07-capture-unsaved-after.jpg](screenshots/ux-audit/07-capture-unsaved-after.jpg) | Reopened Capture with the note lost and default client restored. |
| 08 | [08-capture-fallback-dead-end.jpg](screenshots/ux-audit/08-capture-fallback-dead-end.jpg) | AI-unavailable saved-text example cannot proceed. |
| 09 | [09-review-partial-desktop.jpg](screenshots/ux-audit/09-review-partial-desktop.jpg) | Unexpected Michael view after saving Sarah's partial review; not evidence of a wrong-client write. |
| 10 | [10-document-preview-desktop.jpg](screenshots/ux-audit/10-document-preview-desktop.jpg) | Saved seller document preview with sources and guidance separated. |
| 11 | [11-listings-desktop.jpg](screenshots/ux-audit/11-listings-desktop.jpg) | Listing cards; captured at a scroll position rather than a full-page overview. |
| 12 | [12-property-desktop.jpg](screenshots/ux-audit/12-property-desktop.jpg) | Willow Lane property detail. |
| 13 | [13-document-approved-desktop.jpg](screenshots/ux-audit/13-document-approved-desktop.jpg) | Approved document version with PDF access. |
| 14 | [14-client-desktop.jpg](screenshots/ux-audit/14-client-desktop.jpg) | Sarah's client context. |
| 15 | [15-correction-desktop.jpg](screenshots/ux-audit/15-correction-desktop.jpg) | Correction/retirement form inspected; no correction submitted here. |
| 16 | [16-situation-change-desktop.jpg](screenshots/ux-audit/16-situation-change-desktop.jpg) | Saved second-conversation change review. |
| 17 | [17-situation-impacts-desktop.jpg](screenshots/ux-audit/17-situation-impacts-desktop.jpg) | Today after change approval; top of impact summary. |
| 18 | [18-stale-appointment-briefing-desktop.jpg](screenshots/ux-audit/18-stale-appointment-briefing-desktop.jpg) | Old appointment briefing after accepted changes; decisive UX-01 evidence. |
| 19 | [19-calendar-reminder-desktop.jpg](screenshots/ux-audit/19-calendar-reminder-desktop.jpg) | Task calendar preparation desktop. |
| 20 | [20-activity-desktop.jpg](screenshots/ux-audit/20-activity-desktop.jpg) | Workspace activity desktop. |
| 21 | [21-team-desktop.jpg](screenshots/ux-audit/21-team-desktop.jpg) | Six-agent Team desktop. |
| 22 | [22-settings-desktop.jpg](screenshots/ux-audit/22-settings-desktop.jpg) | Personal Settings desktop. |
| 23 | [23-workstyle-evidence-desktop.jpg](screenshots/ux-audit/23-workstyle-evidence-desktop.jpg) | Workstyle recorded evidence. |
| 24 | [24-workstyle-preferences-desktop.jpg](screenshots/ux-audit/24-workstyle-preferences-desktop.jpg) | Workstyle preference surface after interaction. |
| 25 | [25-workforce-desktop.jpg](screenshots/ux-audit/25-workforce-desktop.jpg) | Five-role workforce explanation desktop. |
| 26 | [26-connections-desktop.jpg](screenshots/ux-audit/26-connections-desktop.jpg) | Sample Connections desktop. |
| 27 | [27-pilot-entry-desktop.jpg](screenshots/ux-audit/27-pilot-entry-desktop.jpg) | Actual pilot entry with sign-in awaiting configuration. |
| 28 | [28-approved-pdf-browser.jpg](screenshots/ux-audit/28-approved-pdf-browser.jpg) | Actual approved PDF in browser viewer, page 1; viewer reports three pages. |
| 29 | [29-pilot-connected-fixture-desktop.jpg](screenshots/ux-audit/29-pilot-connected-fixture-desktop.jpg) | Rendered connected pilot fixture desktop. |
| 30 | [30-pilot-context-fixture-desktop.jpg](screenshots/ux-audit/30-pilot-context-fixture-desktop.jpg) | Rendered pilot source context with expanded technical fields. |
| 31 | [31-pilot-note-proposal-fixture.jpg](screenshots/ux-audit/31-pilot-note-proposal-fixture.jpg) | Pilot fixture note proposal form. |
| 32 | [32-pilot-approval-fixture.jpg](screenshots/ux-audit/32-pilot-approval-fixture.jpg) | Pilot fixture exact approval and execution history. |
| 33 | [33-pilot-search-empty-fixture.jpg](screenshots/ux-audit/33-pilot-search-empty-fixture.jpg) | Pilot fixture no-match search giving incorrect refresh advice. |
| 34 | [34-search-desktop.jpg](screenshots/ux-audit/34-search-desktop.jpg) | Actual global search for Sarah. |
| 35 | [35-today-mobile.jpg](screenshots/ux-audit/35-today-mobile.jpg) | Verified mobile Today viewport; overwrites an earlier unresponsive-size capture. |
| 36 | [36-navigation-mobile.jpg](screenshots/ux-audit/36-navigation-mobile.jpg) | Mobile navigation drawer. |
| 37 | [37-review-mobile.jpg](screenshots/ux-audit/37-review-mobile.jpg) | Mobile Review initial viewport and old original-package context. |
| 38 | [38-review-controls-mobile.jpg](screenshots/ux-audit/38-review-controls-mobile.jpg) | Mobile Review decisions after scrolling. |
| 39 | [39-capture-mobile.jpg](screenshots/ux-audit/39-capture-mobile.jpg) | Mobile written Capture with note input low in the layout. |
| 40 | [40-listings-mobile.jpg](screenshots/ux-audit/40-listings-mobile.jpg) | Mobile Listings overview. |
| 41 | [41-property-mobile.jpg](screenshots/ux-audit/41-property-mobile.jpg) | Mobile property detail; Tasks & commitments wrapping. |
| 42 | [42-client-mobile.jpg](screenshots/ux-audit/42-client-mobile.jpg) | Mobile Sarah profile with reviewed intelligence. |
| 43 | [43-client-history-mobile.jpg](screenshots/ux-audit/43-client-history-mobile.jpg) | Mobile client history with packages and source history. |
| 44 | [44-team-mobile.jpg](screenshots/ux-audit/44-team-mobile.jpg) | Mobile Team introduction, warnings and coaching. |
| 45 | [45-team-cards-mobile.jpg](screenshots/ux-audit/45-team-cards-mobile.jpg) | Mobile Team member cards and count links. |
| 46 | [46-settings-mobile.jpg](screenshots/ux-audit/46-settings-mobile.jpg) | Mobile personal Settings with clipped tone option. |
| 47 | [47-workstyle-customize-mobile.jpg](screenshots/ux-audit/47-workstyle-customize-mobile.jpg) | Mobile workstyle customization controls. |
| 48 | [48-workstyle-comparison-mobile.jpg](screenshots/ux-audit/48-workstyle-comparison-mobile.jpg) | Mobile saved comparison after dismissing a suggestion; no live AI. |
| 49 | [49-login-mobile.jpg](screenshots/ux-audit/49-login-mobile.jpg) | Mobile sample login screen; successful authentication not exercised. |
| 50 | [50-login-desktop.jpg](screenshots/ux-audit/50-login-desktop.jpg) | Desktop sample login screen. |
| 51 | [51-connections-mobile.jpg](screenshots/ux-audit/51-connections-mobile.jpg) | Mobile sample Connections. |
| 52 | [52-pilot-entry-mobile.jpg](screenshots/ux-audit/52-pilot-entry-mobile.jpg) | Actual mobile pilot entry awaiting setup. |
| 53 | [53-pilot-access-mobile-fixture.jpg](screenshots/ux-audit/53-pilot-access-mobile-fixture.jpg) | Pilot fixture mobile permission disclosure. |
| 54 | [54-pilot-disconnect-mobile-fixture.jpg](screenshots/ux-audit/54-pilot-disconnect-mobile-fixture.jpg) | Pilot fixture disconnect confirmation; canceled with Keep connected. |
| 55 | [55-pilot-disconnected-mobile-fixture.jpg](screenshots/ux-audit/55-pilot-disconnected-mobile-fixture.jpg) | Disconnected pilot fixture mobile; fixture-only team-array inconsistency excluded. |
| 56 | [56-pilot-proposal-mobile-fixture.jpg](screenshots/ux-audit/56-pilot-proposal-mobile-fixture.jpg) | Pilot fixture mobile note proposal and history transition. |
| 57 | [57-pilot-task-update-mobile-fixture.jpg](screenshots/ux-audit/57-pilot-task-update-mobile-fixture.jpg) | Pilot fixture task update retains note content after task selection. |
| 58 | [58-document-mobile.jpg](screenshots/ux-audit/58-document-mobile.jpg) | Mobile outdated document warning and refresh action. |
| 59 | [59-document-refreshed-mobile.jpg](screenshots/ux-audit/59-document-refreshed-mobile.jpg) | New v3 draft after refresh from approved facts. |
| 60 | [60-document-edit-mobile.jpg](screenshots/ux-audit/60-document-edit-mobile.jpg) | Mobile document title edit and sticky actions. |
| 61 | [61-document-unsaved-guard-mobile.jpg](screenshots/ux-audit/61-document-unsaved-guard-mobile.jpg) | Working document unsaved-edit guard. |
| 62 | [62-briefing-mobile.jpg](screenshots/ux-audit/62-briefing-mobile.jpg) | Mobile appointment reproducing stale briefing without local warning. |
| 63 | [63-calendar-mobile.jpg](screenshots/ux-audit/63-calendar-mobile.jpg) | Mobile calendar confirmation form. |
| 64 | [64-activity-mobile.jpg](screenshots/ux-audit/64-activity-mobile.jpg) | Stable mobile activity dialog; replaced a screenshot taken during animation. |
| 65 | [65-search-missed-document-mobile.jpg](screenshots/ux-audit/65-search-missed-document-mobile.jpg) | Mobile search misses saved preparation checklist. |
| 66 | [66-not-found-desktop.jpg](screenshots/ux-audit/66-not-found-desktop.jpg) | Actual missing-page screen on desktop. |
| 67 | [67-followup-mobile.jpg](screenshots/ux-audit/67-followup-mobile.jpg) | Mobile follow-up shows approved message but only View review history. |
| 68 | [68-audio-mobile.jpg](screenshots/ux-audit/68-audio-mobile.jpg) | Mobile audio capture/consent interface; recording not performed. |
| 69 | [69-workforce-mobile.jpg](screenshots/ux-audit/69-workforce-mobile.jpg) | Mobile workforce explainer. |

## Verification of the audit deliverable

The report's 35 weighted totals and strongest-to-weakest order are checked arithmetically. Relative document/image links and all 69 JPEG files are checked for existence; JPEG dimensions distinguish desktop/mobile captures. This is a documentation-only change, so application build/test results from earlier development are not represented as new UX validation. The current audit relies on the actual interactions recorded above and explicitly bounded source/fixture evidence.

The remaining validation work is in the main report's next-release and six-agent study plan. Credentials, a physical phone/microphone and actual users are needed to close those gaps; screenshots cannot substitute for them.
