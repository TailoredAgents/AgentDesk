# AgentDesk presentation aesthetic review

Reviewed October 22, 2026 for the October 23 presentation, against commit `b06c99a`.

**Overall presentation judgment: 83/100.** AgentDesk has a coherent, professional visual identity. Listings and document previews make the strongest impression. Review, Settings, and the amount of introductory space on mobile are the most worthwhile refinements before the presentation. Preserve the warm backgrounds, navy, cobalt, sage accents, serif document headings, and property photography.

This is a review and prioritized improvement plan. No application changes or deployment were made during this audit.

## Scope and scoring

Twenty-seven fresh screenshots cover the four main workspace pages and key dialogs at 1440 × 1000 and 390 × 844. They are saved in [demo-audit](screenshots/demo-audit/). The local fictional workspace includes real-model outputs saved during the preceding Copilot acceptance tests. No new approvals, messages, recordings, or CRM writes were made for this review.

Scores are design judgments considering hierarchy, legibility, spacing, consistency, action clarity, and responsive presentation. The overall score is a holistic presentation assessment, not an automated test result or arithmetic average. A 90 means presentation-ready with small refinements; 80 means attractive with noticeable friction; 70 means useful but needing layout work. The stricter focus on first-screen presentation and newer Copilot states means these scores are not a direct regression measurement against the earlier 89-point implementation report.

An asterisk marks a provisional grade based on saved screenshots and existing implementation evidence rather than a fresh interactive inspection. Browser reconnection was blocked after an interruption, so those surfaces were not represented as newly verified. Live production sign-in, hardware recording, mobile software keyboards, 200% zoom, and every loading/error/empty variant are outside this review's verified coverage.

## Main pages

| Page | Grade | What works | What to improve |
| --- | ---: | --- | --- |
| Today | 85 | Strong navy briefing, welcoming heading, consistent sidebar and clear capture action. | Reduce the large situation notice for a single unresolved detail. Shorten the briefing paragraph. Bring the first useful work item higher. |
| Review | 77 | Clear selected client, distinct decision controls, evidence disclosures, persistent confirmation. | The draft starts near the bottom of a 1000 px desktop viewport and below the initial phone viewport. Combine repeated identity/instruction blocks and tighten the space before the first proposal. |
| Listings | 91 | Strong photography, consistent card proportions, clear prices, restrained status badges. | Increase small metadata and next-action text. Keep filter states obvious and long addresses readable. Mobile grade still needs a fresh Copilot-era check. |
| Team | 81 | Calm coach panel, labeled counts, fitting desktop table, mobile agent cards. | The actual people begin below the first mobile screen. Move named support needs above the broad coach commentary; make detailed counts secondary. |
| Sign in* | 90 | Clean brand, balanced form, distinctive serif heading, one clear primary action. | Slightly stronger secondary copy; preserve stable placement of error messages. |
| Private CRM pilot* | 70 | Consistent cards and clear approval intent. | Long operational forms, technical context, and approval history need a compact client-centered sequence. Grade is from fictional fixture screenshots, not a live Lofty session. |

## Features and shared surfaces

| Feature | Grade | Specific refinement |
| --- | ---: | --- |
| Shared desktop shell | 88 | Good active states and alignment. Reduce competition between five assistant links, the page action, and Copilot. |
| Mobile navigation and toolbar | 79 | Drawer is readable. The toolbar squeezes page name, full Ask AgentDesk button, sample label, search, and avatar into one row. Use a simpler mobile arrangement. |
| Copilot conversation | 83 | Sage accents and saved-work cards fit the brand. Increase answer and card typography; simplify repeated card descriptions and make newest activity easy to reach. |
| Copilot artifact handoff | 80 | Cards open the actual document or review. Historical cards can still say Ready for your review after the document is approved. Distinguish the original result from the current artifact status. |
| Client overview | 82 | Useful counts, clear tabs, strong client identity. Current photography/cleaning situation appears below stable relationship facts. Put current situation and next action first. |
| Relationship facts and correction | 85 | Certainty badges and inline focused correction are clear. Reduce large vertical gaps between facts and avoid repeating the same uncertainty in multiple panels. |
| Client work and commitments | 82 | Logical sections and readable commitment card. Reduce the large appointment preparation block and prioritize due work. Fix singular/plural labels such as “1 open commitments.” |
| Tasks | 84 | Consistent titles, due states and expandable evidence/calendar. Keep urgency, client, and action in a predictable order and improve small supporting text. |
| Follow-up recommendation | 86 | Draft and review action are accessible, evidence is collapsed. Give the primary Review action more emphasis and make the draft panel visually distinct from the reason-for-attention panel. |
| Approved message and copy* | 86 | Copy and completion are separate, with useful feedback. Shorten the explanatory toast and make the saved approval status easy to scan. |
| Document preview | 89 | Elegant serif headings, readable sections, version controls, clear primary approval. Compress duplicated document identity and metadata before content. |
| Document editing | 83 | Clear fields, section navigation, persistent actions. Mobile setup consumes most of the screen; the footer uses two rows even when Save is disabled. Reduce this overhead while keeping rejection deliberate. |
| Approved document | 82 | Locked state and version identity are clear. On mobile, PDF access is far below the introduction; bring Open PDF beside the approved status. Remove a leading separator when no client is linked. |
| Exported PDF* | 89 | Strong navy brand header, clear checklist typography, useful footer, no overlap in the three inspected saved pages. Tighten repeated qualifiers and balance generous blank areas without compressing readable text. |
| Appointment briefing | 86 | Clear time, confirmation, location and saved briefing. Reduce empty space between context, calendar export, and document actions; use friendly dates in generated content. |
| Calendar reminder* | 83 | Orderly form with an explicit confirmation checkbox. Use a human-readable time-zone label and consolidate repeated export explanations. |
| Written conversation capture | 86 | Notes now precede consent; primary action is visible. Compact client/property setup on mobile and make the notes field the visual focus. |
| Audio capture | 82 | Recorder and upload are distinct; consent is explicit. On mobile the recording control starts low. Compact setup and keep recording/preview status near its action. Active recording and failure variants are not freshly graded. |
| Global search | 88 | Focus correctly enters the search field; results are grouped and matched text is highlighted. Reduce empty-state browsing length and increase result-name contrast. |
| Settings | 78 | Coherent form, clear identity, persistent Save. Preferred tone visibly clips; use short selected labels with full descriptions below. Separate immediate Workstyle actions from form-level Save. |
| Workstyle suggestions | 83 | Good cards, explicit proposed preference, recognizable actions. Shorten evidence explanations and reduce repeated sections before the actionable choice. |
| AI workforce overview* | 85 | Distinct role icons and useful work links. Use shorter descriptions and make the selected specialist/action more prominent. |
| Activity history* | 82 | Date groups and type-specific icons aid scanning. Large rows and internal event names make the feed feel administrative; lead with outcome, person, and an exact artifact link. |
| Connections* | 85 | Clean provider cards and honest availability states. Clarify the next setup step without making an unavailable button the main focal point. |
| Empty and no-results states* | 85 | Appropriate search illustration and clear recovery action. Keep the wording specific to no matches versus no records. |
| Loading, failures, notifications* | 80 | Existing guidance and recovery states provide a foundation. Use shorter, contextual messages and reserve status space to prevent layout jumps. This is a provisional family score, not coverage of every error. |

## Highest impact changes before the presentation

### 1 Make Review show the work immediately

Combine the client summary and conversation/evidence access into one compact row. Keep one concise approval instruction. Reduce the gap before Communications and the first editable message. Retain exact approval effects and the final confirmation control.

Acceptance: at 1440 × 900, the first message and its decision control appear without scrolling. At 390 × 844, the first proposal begins above the fixed footer. Evidence and approval behavior remain intact.

### 2 Make Copilot easy to read during screen sharing

Increase answer text and important card titles. Current CSS includes 8–10 px secondary labels and 12 px card titles, which are too small for a projected demo. Prioritize newly prepared work, then collapse supporting record cards behind a clear disclosure. Keep historical status distinguishable from current status. On reopening or resizing, provide a reliable path to the latest message without interrupting a user reading earlier messages.

Acceptance: readable text at normal laptop scale; obvious saved result and next action; opening an approved artifact does not visually contradict an apparently current pending badge.

### 3 Compact mobile headers and document controls

Simplify the crowded top bar. Combine document status, version and recipient metadata. Avoid a full-width one-option Preview selector on approved documents. Place PDF access near the approved status. Keep primary actions visible without letting a two-row footer dominate the editor.

Acceptance: useful document content appears in the initial phone viewport, no sideways page overflow, and controls never cover the final editable content.

### 4 Put actionable work ahead of general explanation

Make a collapsed one-detail situation notice a compact row. Move Team's named support needs ahead of the long coaching panel. Show current client situation before stable relationship facts. Keep explanations and evidence available through disclosures.

Acceptance: Today shows the first work item sooner; Team exposes a named person or support need on the initial mobile screen; client overview answers what needs attention immediately.

### 5 Finish the small details

Shorten tone-option labels; correct count grammar; remove orphaned separators; use consistent capitalization for statuses; strengthen small secondary text; standardize primary/secondary button emphasis; shorten repetitive notices without removing material consent or approval information.

Acceptance: no clipped selected values, orphaned punctuation, inconsistent count labels, or unnecessarily repeated explanations in the rehearsed path.

## Presentation sequence

Start on Today, then open Ask AgentDesk with a specific request about Sarah. Open the resulting saved review, show the source evidence, and demonstrate a wording change. Open the seller document preview and an already approved PDF. Finish with Listings and a brief Team overview. Keep the private pilot setup out of the main demonstration unless individual access and the real connection have been rehearsed.

Use desktop for the main presentation. Demonstrate mobile as a secondary capability after the compact-layout improvements. Keep fictional sample labels visible. Confirm the deployed app is signed in and rehearse the exact prompt and saved-work handoff before presenting; this aesthetic audit does not replace the outstanding authenticated production conversation check.

## Evidence

Fresh key captures: [Today](screenshots/demo-audit/01-today-desktop.png), [Review desktop](screenshots/demo-audit/02-review-desktop.png), [Listings](screenshots/demo-audit/03-listings-desktop.png), [Team](screenshots/demo-audit/04-team-desktop.png), [Settings](screenshots/demo-audit/05-settings-desktop.png), [client](screenshots/demo-audit/08-client-desktop.png), [document](screenshots/demo-audit/11-document-desktop.png), [mobile editor](screenshots/demo-audit/13-document-edit-mobile.png), [mobile capture](screenshots/demo-audit/18-capture-mobile.png), [Copilot](screenshots/demo-audit/24-copilot-latest-desktop.png), [mobile approved document](screenshots/demo-audit/26-approved-document-mobile.png), and [Review mobile](screenshots/demo-audit/27-review-mobile.png).

Provisional evidence: [login](screenshots/ux-audit/50-login-desktop.jpg), [property](screenshots/ux-audit/12-property-desktop.jpg), [activity](screenshots/ux-audit/20-activity-desktop.jpg), [connections](screenshots/ux-audit/26-connections-desktop.jpg), [workforce](screenshots/ux-audit/25-workforce-desktop.jpg), [calendar](screenshots/ux-audit/19-calendar-reminder-desktop.jpg), [pilot fixture](screenshots/ux-audit/29-pilot-connected-fixture-desktop.jpg), [approved follow-up](screenshots/ux-fixes/03-followup-copy-and-completion.jpg), and [PDF pages](screenshots/aesthetic-pass/).

Property detail receives a provisional **87/100** from the saved desktop evidence: attractive photography and a clear next-step block, with room to shorten the hero and raise documents/tasks. It should receive a fresh mobile check before claiming full coverage.
