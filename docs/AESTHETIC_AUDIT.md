# AgentDesk aesthetic audit and improvement plan

AgentDesk has a coherent visual identity, but its newer workflows have outgrown the original layouts. The overall aesthetic score is **72 out of 100**, rounded from the equally weighted mean of 24 surface scores. Listings and exported documents are the strongest work. Team, document editing, client profiles, and Review need the most attention.

The direction is to preserve the warm off-white background, navy and cobalt palette, restrained serif headings, property photography, and calm tone. Improve legibility, information order, and action placement before adding decoration.

## Scope and scoring

Baseline: commit cacb3a5, audited October 22, 2026. This is an aesthetic and interaction review, not a certification of accessibility or functional correctness.

The inspection includes 36 saved browser screenshots, rendered page measurements, component and CSS inspection, and all three pages of an existing sample PDF. Desktop screenshots use 1440 × 1000; mobile screenshots use 390 × 844. Additional 768 × 1024 DOM measurements cover Today, Review, and Team.

A separate local fictional workspace supplied initial, pending, approved, and changed-plan examples. Production and the existing local workspace were not modified. Live AI generation and physical microphone recording were not exercised.

Scores marked * are provisional: login was inspected through its rendered DOM and styling, appointment briefings through source and their entry points, and uncommon system states primarily through source. Browser screenshot capture stopped responding late in the audit; remaining unpictured states must receive visual checks during implementation. Rejected, partial-review, recording, playback-error, network-error, and fully empty workspace variants require that follow-up coverage.

Scores use these priorities: hierarchy 20%, typography and contrast 20%, spacing 15%, consistency 15%, interaction clarity 15%, and responsive layout 15%. For PDFs, print layout replaces responsive layout. These are design judgments, not automated measurements. The overall mean is a convenient baseline, not a traffic-weighted usability metric.

- 90–100: polished across the inspected states and sizes.
- 80–89: strong visual execution with localized improvements.
- 70–79: coherent, with visible readability or workflow friction.
- 60–69: usable structure but substantial hierarchy or layout work.

## Scorecard

| Main page | Score | Principal issue | Target |
| --- | ---: | --- | ---: |
| Listings | 84 | Small metadata and weak filter states | 92 |
| Sign in* | 80 | Pale supporting text and generic identity treatment | 90 |
| Today | 70 | Oversized introduction and mobile overflow | 92 |
| Review | 67 | Long decision flow and weak change comparison | 92 |
| Team | 61 | Overflowing table and merged metric text | 90 |

| Feature or shared surface | Score | Principal issue | Target |
| --- | ---: | --- | ---: |
| Exported PDF | 83 | Uneven page balance and unhelpful footer reference | 92 |
| Workforce overview | 78 | Five entry points lead to the same unselected overview | 90 |
| Property detail | 76 | Large hero and flat hierarchy below it | 91 |
| Calendar scheduling and export | 76 | Repeated explanations and technical time-zone entry | 90 |
| Approved message and copy controls | 75 | Small action and low-priority status treatment | 90 |
| Shared shell and navigation | 74 | Tiny secondary controls and crowded mobile drawer | 91 |
| Written conversation capture | 74 | Setup content dominates the input and action | 91 |
| Connections | 73 | Availability language implies more than is available | 90 |
| Appointment briefings* | 73 | Context, export, and documents need a clearer order | 90 |
| Global search | 72 | Initial focus and no-results presentation | 91 |
| Audio capture | 71 | Recording controls appear too far down on mobile | 91 |
| Tasks and commitments | 70 | Dense rows and weak distinction between record types | 90 |
| Settings | 70 | Long ungrouped form with distant save action | 90 |
| Relationship and situation intelligence | 69 | Repetition and a correction form that opens out of view | 92 |
| Activity | 67 | Success icons used for events that are still pending | 90 |
| Client profile | 65 | Long modal hides current priorities among history | 92 |
| Follow-up recommendation | 65 | Repeated context pushes the draft and action down | 91 |
| Document editor and version review | 63 | Long form lacks preview and persistent actions | 92 |
| Empty, loading, error, and notification states* | 64 | Generic visuals fail to distinguish different outcomes | 90 |

Targets are acceptance goals for the next pass, not promised measured outcomes.

## Highest priority findings

1. **Today overflows on mobile.** At a 390 px viewport, document width reached 398 px. The relationship section heading and nowrap “Refresh & prepare” control force the primary column wider than its container. Allow the heading/action row to wrap and ensure grid and flex children can shrink.
2. **Team requires horizontal scrolling even on desktop.** The table measured approximately 1214 px inside a 1107 px container. On mobile it was approximately 1151 px inside 335 px; at tablet width, 1143 px inside 693 px. The Work prepared cell also merges separate metric lines because the shared small-text/muted rule uses inline-flex. Give these metrics an explicit stacked layout and replace the mobile table with compact agent cards.
3. **Important text is too pale.** Several observed 10–12 px labels fall below the normal-text contrast target. Increasing font size alone will not fix their color contrast.
4. **Current information and history have equal visual weight.** A populated client dialog measured 4292 px of content in a 900 px viewport. The expanded mobile change review reached roughly 5400 px. Put current decisions first and move evidence and historical detail into clearly labeled disclosures.
5. **Correction is visually disconnected from the fact.** “Correct or retire” appends its editor after the complete fact list without focusing or revealing it. Open the editor next to the selected fact or move focus to a dedicated correction panel with that fact’s current wording.
6. **The document editor hides its key actions below a long form.** Keep Save and Review actions in a persistent footer, with enough content padding that the footer never covers fields.
7. **Search loses its intended initial focus.** The input requests autofocus, but the shared modal subsequently focuses the dialog container. Support a deliberate initial focus target while preserving focus trapping and return focus.

## Page and feature details

### Today

**Keep:** the welcoming headline, strong property image, clear New conversation action, and distinct review, task, and calendar areas.

**Improve:** shorten the hero, especially on mobile; retain its useful follow-up action while moving the operational queue above the large decorative photo. Reduce repeated explanations around sample data and approval. Show situation counts as compact meaningful labels rather than a sentence full of zeros. Format visible ISO dates consistently. Give urgency, due date, owner, and next action a stable order in task rows.

**Acceptance:** no sideways page movement at 390 px; headings and actions wrap cleanly; urgent work is visible without passing an entire introductory screen; all abbreviated task text can be opened or expanded.

### Review

**Keep:** source alongside proposed work on desktop, explicit per-action decisions, and the sticky confirmation area.

**Improve:** use a compact package summary showing outstanding decisions. Let package titles wrap or expose their full text. On mobile, collapse source material initially and provide clear access to Actions, Source, and Changes. Make each decision control and bulk action readable and distinct. Show **Before** and **Proposed** values together, including changed dates and certainty, instead of separating the old value from the editable replacement. Group downstream impacts by tasks, messages, commitments, and documents.

**Acceptance:** users can identify what changes, what remains uncertain, and what approval will apply without opening multiple distant sections. Pending, partial, rejected, approved, and saving states remain visually distinct. The confirmation footer never obscures the last action.

### Listings

**Keep:** photographic cards, clear prices and addresses, consistent image ratios, and restrained progress indicators.

**Improve:** increase secondary metadata contrast, strengthen selected filter styling, and make the mobile filter arrangement intentional. The current last chip wraps alone. Improve the search field’s desktop boundary and the next-step link target. Replace the green success check in no-results views with a search-specific visual and a Clear filters action.

**Acceptance:** card typography remains consistent with long addresses, every filter has an obvious selected state, and empty results explain how to recover.

### Team

**Keep:** agent identity, record-based counts, and links from bottlenecks to useful work.

**Improve:** replace the coach’s metric-heavy prose with a short summary and a few labeled counts. Stack Work prepared metrics deliberately. Remove unnecessary nowrap behavior and allocate column widths according to content. Use an expandable agent card on narrow screens, showing pending work and the next action before secondary counts. Give bottlenecks more prominence than routine activity.

**Acceptance:** the desktop table fits at 1440 px; no required metric is offscreen on mobile. Labels and values remain visually paired. Do not introduce invented productivity scores or imply that counts measure client contact.

### Sign in

**Keep:** the centered form, clear password visibility control, generous field height, and single primary action. Rendered geometry fits both tested widths; the mobile submit control is within the initial screen.

**Improve:** darken the welcome copy, caption, and footer; reduce reliance on tiny uppercase branding. Bring heading treatment into closer alignment with the workspace. Reserve stable space for an error so the action does not jump unnecessarily.

**Acceptance:** check the actual rendered desktop and mobile appearance, password visibility, error, and submitting states during implementation. Preserve authentication behavior.

### Shared shell and navigation

**Keep:** recognizable brand mark, light sidebar, navy briefing panels, consistent icons, and visible active navigation.

**Improve:** reduce secondary taglines and sidebar crowding. Ensure profile and settings are easy to reach on shorter screens. The narrow mobile drawer wraps assistant names unnecessarily; use a wider drawer with a stable utility area. Show Ctrl K on Windows and Command K on macOS. Standardize icon sizes, button heights, border radii, divider colors, and section spacing.

**Acceptance:** navigation is usable at 390, 768, and 1440 px and on a short laptop viewport. Keyboard focus remains visible. Nested dialogs clearly communicate their relationship and return focus correctly.

### Property detail

**Keep:** the property photo, address, price, and linked client context.

**Improve:** reduce the hero’s mobile height, raise the current next step, and make completed versus upcoming milestones visually different. Group tasks, documents, commitments, and history into clear sections with a compact section navigator where useful. Keep current situation warnings close to affected actions.

**Acceptance:** users see property identity and current priority immediately; document and task actions are not lost beneath repeated contextual paragraphs.

### Client profile

**Keep:** the breadth of context, recorded commitments, source traceability, and direct links into work.

**Improve:** introduce a compact identity header with owner, current situation, and next action. Organize the body into Overview, Work, and History, preserving deep links or section navigation. Prioritize current facts and open commitments; collapse historical notes and source transcripts. Remove repeated statements of the same photography request from adjacent sections.

**Acceptance:** the initial viewport answers who this is, what is happening, and what needs attention. History remains accessible without dominating the default view.

### Relationship and situation intelligence

**Keep:** confirmed/requested/uncertain distinctions, explicit human review, property scope, and evidence history.

**Improve:** separate stable preferences from current property plans. Give certainty badges a consistent visual vocabulary. Make correction and retirement readable actions with appropriately different treatment. Place the correction editor beside its fact, retain the current wording as context, and make the downstream effect preview scannable. Use shorter reviewer metadata with fuller provenance on expansion.

**Acceptance:** every displayed fact has understandable scope and certainty; opening correction produces an immediate visible change and sensible focus. Superseded information cannot resemble the current plan.

### Follow-up recommendation

**Keep:** evidence-grounded reasoning, uncertainty, and the link to prepared work.

**Improve:** lead with the reason for attention, proposed draft, and next action. Consolidate repeated claims across Why, Evidence, Context, and fact rows. Give “Still to confirm” the same spacing and typography as other sections. Place detailed evidence in a disclosure and keep stale-draft warnings next to the draft.

**Acceptance:** the draft and review action appear before extended history. A user can distinguish an open question, a prepared response, and completed follow-up at a glance.

### Tasks and commitments

**Keep:** direct completion/reopen controls, dates, source quotations, and explicit commitment status.

**Improve:** use a consistent row anatomy: title, client/property, due state, and action. Move secondary calendar preparation into an accessible action area so every row does not repeat a tiny line. Differentiate questions, promises, dependencies, and ordinary tasks with labels and icons. Collapse quotations when they obscure the current task. Improve completed-state contrast without making completed rows disappear.

**Acceptance:** completion, resolution, and calendar preparation remain distinct actions. Long titles and missing dates fit without clipping.

### Written conversation capture

**Keep:** explicit client/property selection, clearly labeled notes, consent, and visible preparation status.

**Improve:** shorten the large AI-availability explanation to a compact status with details. Keep necessary consent readable and close to the action. Increase the notes area’s prominence, make the saved-example control secondary, and place a concise reason beside a disabled Prepare button.

**Acceptance:** the form’s next step is obvious with AI available or unavailable; typed notes survive errors; progress text describes the current operation without implying completion.

### Audio capture

**Keep:** record, stop, preview, rerecord, discard, and upload as explicit stages.

**Improve:** bring the recorder into the initial mobile flow. Separate recording controls from upload alternatives, use a clear timer and recording indicator, and keep consent visible. Make playback and transcription failures visually distinct and actionable. Ensure long filenames wrap and native audio controls fit the modal.

**Acceptance:** visually inspect requesting permission, recording, stopping, playback, unsupported browser, failure, and processing with a controlled fixture. Do not hide consent or automatically submit audio as part of this visual work.

### Document editor and version review

**Keep:** versions, retained evidence, explicit approval, and durable approved PDFs.

**Improve:** provide Preview and Edit modes, with a section outline for long documents. Use a wider desktop workspace; stack deliberately on mobile. Separate document status, origin, version, and recipient in the header. Consolidate repetitive general-guidance labels at section level while preserving meaningful per-item certainty. Grow textareas with content or provide a focused edit experience. Keep Save and Approve in a persistent action area; move Reject and New version to deliberate secondary positions.

**Acceptance:** the user can inspect the client-facing result before approving. Unsaved edits are visible, version switching cannot silently discard work, and approved/stale/current versions are unmistakable.

### Exported PDF

**Keep:** strong navy cover, serif section titles, readable body copy, checklist treatment, and agent contact block. The three inspected pages have no obvious clipping or overlapping content.

**Improve:** balance the large empty areas on pages one and two without cramming the document. Remove the redundant double rule under continuation headers. Replace the footer’s truncated internal ID; the sample currently shows “product-”, which provides little useful identification. Use a meaningful short document reference, version, and prepared date. Normalize sentence capitalization and make small certainty labels easier to read in print.

**Acceptance:** rerender the normal and long-text fixtures; headings stay with content, page numbers remain correct, and all pages read comfortably at actual print size.

### Calendar scheduling and export

**Keep:** explicit date/time confirmation, clear export, and separation from external calendar synchronization.

**Improve:** replace the raw time-zone text field with a friendly searchable selector that retains the correct identifier. Show a concise natural-language schedule preview. Consolidate repeated export explanations. Keep the confirmation checkbox and Save action adjacent; reserve inline space for field errors.

**Acceptance:** tentative and confirmed schedules look different, validation is attached to the relevant field, and mobile users can reach the action without navigating several repeated notices.

### Appointment briefings

**Keep:** appointment status, time range, location, and direct client context.

**Improve:** order the surface as appointment identity, talking points, unresolved questions, prepared briefing, then calendar export. Label saved workspace information concisely. Make document preparation and calendar download visually separate actions.

**Acceptance:** visually inspect both client appointments and a team huddle, with and without a prepared document. Date, time zone, location, and confirmation status remain legible on mobile.

### Approved messages and copy controls

**Keep:** explicit “Approved · not sent” status and a manual-copy fallback.

**Improve:** treat the approved text as a readable message preview with a clear Copy action and concise status beside it. Give the fallback textarea the same visual weight and spacing as the normal preview. Use confirmation feedback that fits in a short notification.

**Acceptance:** copying cannot look like sending or resolving a task; clipboard failure remains recoverable without losing the draft.

### Settings

**Keep:** existing labels, agent selection, voice controls, and explicit sample-reset confirmation.

**Improve:** divide the long form into Agent, Communication style, and Advanced preferences. Show a compact style summary and persistent Save action. Allow a full readable preferred-tone value. Warn about unsaved edits when changing agent. Move sample reset into a clearly separated maintenance area and align its disclosure icon, title, and explanation.

**Acceptance:** users can tell which agent they are editing, which fields changed, and whether saving succeeded. Reset retains its existing confirmation requirements.

### Global search

**Keep:** grouping by properties, people, and prepared work.

**Improve:** resolve the modal focus conflict; make the shortcut platform-correct. Show a compact initial set rather than dumping every record for an empty query. Add result counts and matching-text emphasis where useful. Replace the generic empty message with “No results for…” and useful recovery guidance.

**Acceptance:** opening search permits immediate typing; results can be reached predictably by keyboard; long names wrap and empty results have an appropriate icon.

### Workforce overview

**Keep:** the five role identities, color families, and clear capability descriptions.

**Improve:** clicking a specific assistant should highlight or open that role within the overview. Provide direct routes to its existing work. Reduce repeated explanatory copy and make current availability clear.

**Acceptance:** role entry points produce an understandable selected state. AI-assisted and record-based functions remain accurately labeled; this pass does not add capabilities.

### Connections

**Keep:** straightforward provider rows and visible connection status.

**Improve:** change the headline to reflect actual availability. Planned integrations should say Planned, with a concise explanation, rather than look like broken disconnected services. Replace placeholder monograms with consistent provider marks or neutral category icons, and align status labels.

**Acceptance:** users can distinguish available actions from future integrations without searching for a missing Connect button.

### Activity

**Keep:** chronological records and compact event summaries.

**Improve:** use event-specific icons for prepared, approved, corrected, exported, and resolved states. Group entries by date and link to the affected record. Collapse long detail text and provide simple filters when activity grows. Preserve the sample timeline’s date context.

**Acceptance:** an unresolved question or draft awaiting review never gets the same success treatment as completed work.

### Empty and transient states

**Keep:** recovery actions, retained form inputs, status announcements, and existing reduced-motion support.

**Improve:** give no results, no records, all caught up, unavailable feature, and error distinct visuals. The shared Empty component currently uses a green check for all cases, and the toast uses a success icon for every notification. Add semantic variants. Make loading fit the surrounding layout, shorten notification text, and keep important failures available until acknowledged. Give 404 and fatal-error screens recognizable branding and direct recovery.

**Acceptance:** every core flow has an intentional empty, busy, success, and failure presentation. Avoid blanket claims that unsaved work is safe after a fatal error. Verify reduced motion and keyboard focus with the final styles.

## Shared design requirements

### Typography and contrast

Use a compact, deliberate scale: 14–15 px for operational body text, 13–14 px for controls, 12–13 px for supporting metadata, and 18–24 px for section headings. Retain expressive larger headings only where they help orientation. Use 16 px form text on mobile where practical. These are starting design values; validate them against real content.

Measured text colors on white illustrate the problem:

| Observed use | Color | Size | Contrast |
| --- | --- | ---: | ---: |
| Client subtitle | RGB 154,165,177 | 12 px | 2.50:1 |
| Property location metadata | RGB 151,161,171 | 10 px | 2.62:1 |
| Fact review metadata | RGB 125,139,157 | 11 px | 3.47:1 |
| Correct or retire action | RGB 120,132,145 | 10 px | 3.81:1 |
| Evidence disclosure | RGB 88,123,166 | 12 px | 4.38:1 |
| Fact body | RGB 83,101,123 | 13 px | 5.97:1 |

Adopt at least 4.5:1 for normal text and 3:1 for qualifying large text. Disabled controls have different requirements; distinguish disabled explanations from the disabled control itself. These thresholds come from [WCAG contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

### Controls and spacing

Use a shared 4/8 px spacing scale, consistent section gaps, and a small set of button sizes. Give primary mobile actions a comfortable 44 px target as a product design goal. Check all controls against the WCAG 2.2 minimum target rule of 24 × 24 CSS px or its applicable spacing exceptions. The observed 15–18 px correction/disclosure heights need attention, but height alone does not establish a conformance failure. See [WCAG target size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

Use semantic colors consistently: blue for proposed/actionable work, amber for unresolved or changed information, green for confirmed/completed outcomes, and red for destructive actions or failures. Always include text or an icon so color is not the sole signal.

### Information and interaction

Show the current state before source history. Use one obvious primary action per local decision. Keep provenance available through progressive disclosure. Explain effects once near the relevant approval action, with additional detail available on demand.

Use consistent human-readable dates, label time zones where timing matters, and preserve exact dates in evidence. Keep current, proposed, approved, delivered, and resolved states separate. Visual simplification must not remove consent, source evidence, uncertainty, or human approval.

## Implementation plan

### Phase 1  Shared foundations and layout defects

- [ ] Add semantic text, surface, border, and status tokens in [globals.css](../src/app/globals.css); consolidate touched override blocks.
- [ ] Standardize buttons, badges, form fields, disclosure rows, and focus appearance in [ui.tsx](../src/components/ui.tsx).
- [ ] Fix Today heading overflow and Team metric stacking immediately.
- [ ] Add deliberate initial modal focus, predictable section navigation, and reusable action footers.
- [ ] Correct platform shortcuts, mobile drawer sizing, empty-state icons, and notification variants.

**Exit:** no accidental page overflow at 390, 768, and 1440 px; sampled normal text reaches contrast targets; primary controls are comfortably usable; focus behavior remains intact.

### Phase 2  Review and relationship workflows

- [ ] Restructure [review.tsx](../src/components/workspace/review.tsx) around pending decisions, before/proposed comparisons, and grouped impacts.
- [ ] Reorganize [client-detail.tsx](../src/components/workspace/client-detail.tsx), [intelligence.tsx](../src/components/workspace/intelligence.tsx), and [follow-up.tsx](../src/components/workspace/follow-up.tsx) around current state and next action.
- [ ] Make fact correction visible immediately and keep historical evidence accessible.
- [ ] Align task, commitment, approved-message, and stale-information presentation.

**Exit:** a user can review changed plans, understand downstream effects, correct a fact, and find the approved message without scanning repeated history. Existing review semantics remain unchanged.

### Phase 3  Documents and capture

- [ ] Add preview/edit organization, section navigation, and persistent actions in [work-products.tsx](../src/components/workspace/work-products.tsx).
- [ ] Refine PDF pagination, continuation headers, and footer references in [work-product-pdf.ts](../src/lib/work-product-pdf.ts).
- [ ] Tighten notes/audio composition in [capture.tsx](../src/components/workspace/capture.tsx).
- [ ] Simplify calendar confirmation and export presentation in [calendar-actions.tsx](../src/components/workspace/calendar-actions.tsx).

**Exit:** mobile document review and capture have visible next steps; version states remain clear; normal and long PDFs render cleanly.

### Phase 4  Main pages and remaining features

- [ ] Compact and prioritize [today.tsx](../src/components/workspace/today.tsx).
- [ ] Rebuild Team’s narrow-screen presentation in [team.tsx](../src/components/workspace/team.tsx).
- [ ] Polish [listings.tsx](../src/components/workspace/listings.tsx) and [property-detail.tsx](../src/components/workspace/property-detail.tsx).
- [ ] Group [settings.tsx](../src/components/workspace/settings.tsx), refine [search-panel.tsx](../src/components/workspace/search-panel.tsx), and improve workforce, connections, and activity in [agentdesk.tsx](../src/components/agentdesk.tsx).
- [ ] Finish sign-in, appointment briefings, and system-state visual checks.

**Exit:** every scorecard surface has its listed changes addressed and a new screenshot at each relevant size.

### Phase 5  Verification and rescoring

- [ ] Compare before/after screenshots at 390 × 844, 768 × 1024, and 1440 × 1000, plus a shorter desktop viewport and 200% zoom.
- [ ] Check long names, long addresses, extensive facts, many versions, no records, no results, pending/partial/rejected/approved decisions, and stale content.
- [ ] Exercise keyboard navigation, Escape, focus return, correction focus, search typing, and nested dialogs.
- [ ] Visually inspect recording/playback/error states with controlled fixtures and AI availability variants.
- [ ] Verify sticky controls do not hide content or collide with notifications and mobile keyboards.
- [ ] Run typecheck, the existing relevant tests, and a production build after implementation. Use targeted interaction tests for changed focus, draft preservation, and approval behavior.
- [ ] Rerender PDF fixtures and check every page.
- [ ] Rescore using the same rubric; record remaining issues explicitly.

Complete each phase before expanding to the next. Avoid a wholesale CSS rewrite: shared styles affect many already-working states. No implementation checklist item is complete merely because a screenshot looks better.

## Visual evidence

The [screenshot directory](screenshots/aesthetic-audit/) contains the 36 browser captures and three PDF page images.

Representative comparisons:

- [Today desktop](screenshots/aesthetic-audit/today-desktop.png) and [mobile](screenshots/aesthetic-audit/today-mobile.png).
- [Review desktop](screenshots/aesthetic-audit/review-desktop.png), [changed plans](screenshots/aesthetic-audit/change-review-desktop.png), and [mobile change review](screenshots/aesthetic-audit/change-review-mobile.png).
- [Listings desktop](screenshots/aesthetic-audit/listings-desktop.png) and [mobile empty results](screenshots/aesthetic-audit/listings-empty-mobile.png).
- [Team desktop](screenshots/aesthetic-audit/team-desktop.png) and [mobile introduction](screenshots/aesthetic-audit/team-mobile.png).
- [Client profile](screenshots/aesthetic-audit/client-desktop.png), [correction form](screenshots/aesthetic-audit/fact-correction-desktop.png), and [follow-up](screenshots/aesthetic-audit/follow-up-desktop.png).
- [Document editor](screenshots/aesthetic-audit/document-editor-desktop.png), [mobile editor](screenshots/aesthetic-audit/document-editor-mobile.png), and [approved document](screenshots/aesthetic-audit/document-approved-desktop.png).
- [PDF page one](screenshots/aesthetic-audit/pdf-page-1.png), [page two](screenshots/aesthetic-audit/pdf-page-2.png), and [page three](screenshots/aesthetic-audit/pdf-page-3.png).
- [Audio capture desktop](screenshots/aesthetic-audit/capture-audio-desktop.png) and [mobile](screenshots/aesthetic-audit/capture-audio-mobile.png).
- [Settings](screenshots/aesthetic-audit/settings-desktop.png), [calendar](screenshots/aesthetic-audit/calendar-desktop.png), [search](screenshots/aesthetic-audit/search-desktop.png), [connections](screenshots/aesthetic-audit/connections-desktop.png), [workforce](screenshots/aesthetic-audit/workforce-desktop.png), and [activity](screenshots/aesthetic-audit/activity-desktop.png).

**Baseline status:** this audit was completed before implementation. The approved improvements and revised scores are recorded in [AESTHETIC_PASS.md](AESTHETIC_PASS.md). The checklist above preserves the original acceptance plan; coverage and remaining limits are tracked in that implementation report.

