# Agent Workstyle

Agent Workstyle adds explicit personal preferences and conservative, reversible suggestions to the existing settings. It does not train a model, silently change preferences, send messages, or execute CRM actions. See the [fictional demonstration](WORKSTYLE_DEMO.md).

## What works

| Preference | Applies to | How it is chosen |
| --- | --- | --- |
| Follow-up length | New proactive follow-up drafts and their rewrites | Configure, or accept repeated shortening evidence |
| Follow-up greeting | The same follow-up workflow | Configure, or accept repeated greeting-removal evidence |
| CRM note organization | New conversation notes | Configure bullet points or paragraphs |
| Briefing detail | New appointment briefings; Daily Coordinator preparation in the pilot | Configure concise or standard detail |
| Seller photography checklist | New seller preparation; relevant pilot listing guidance | Configure, or accept repeated additions of the supported guidance |
| Appointment preparation shortcut | Next assigned appointment on the sample Today page | Configure, or accept repeated briefing requests; unavailable in the separate CRM pilot UI |

Existing communication settings remain the baseline. Workstyle stores each selected value with its source (`configured` or `accepted_suggestion`), update time, and suggestion reference where applicable. Removing a choice restores the baseline. Changes affect future generation, not previously approved work or PDFs. The saved comparison in Jordan's settings is explicitly illustrative and does not call OpenAI.

Approved follow-up choices are supplied to the existing generation and rewrite requests. They do not alter ordinary conversation communication or formal document style. Notes and briefing settings are scoped separately. Seller guidance is inserted as general advice, never as a client fact or a confirmed photography appointment. Only the approved settings and applicable standards enter AI context; behavioral examples are not added to model requests.

## Recorded evidence and thresholds

Observation happens inside successful server-owned review/preparation transactions. There is no public endpoint for submitting claimed evidence.

- **Follow-up approval:** Compare the retained original draft with the final approved text. A shortening signal requires an original of at least 25 words, an approved result of at least six words, and a reduction of at least 30%. Greeting removal is considered only when the original has a recognized greeting. A rejected message is not treated as a stable preference. The shared sample observes only identified follow-up packages, not every conversation message.
- **Seller package approval:** Compare original and approved general-guidance sections. Initially the only reusable item is: “Before photography, review a room-by-room preparation checklist with the seller.” Exact normalized matching keeps arbitrary client details out of personal templates. Other repeated text is not automatically generalized.
- **Briefing preparation:** Record a successful explicit request for an appointment briefing, once per appointment. Copying a saved version does not count as a new request.

A pattern requires at least **four supporting examples**, at least **80% of the latest 12 eligible examples**, and at least **two distinct contexts**. These are detection thresholds, not displayed confidence claims. Opposing evidence can withdraw a pending suggestion. The interface shows counts, before/after examples, proposed values, and the effect of accepting. Source keys prevent retries and repeated versions of the same work from inflating counts.

The service retains at most 100 behavioral records per profile. Each before/after excerpt is limited to 700 characters; the deterministic signal is calculated from the full authorized review before truncation. Source reviews retain their normal application history separately.

## Controls and ownership

Suggestions offer **Use this preference**, **Customize**, and **Not now · dismiss**. Customization is limited to the proposed supported settings. Acceptance checks both the current profile revision and the exact reviewed set of setting keys. It cannot silently accept an additional setting inferred after the screen loaded.

Dismissed, accepted, and undone rules do not repeatedly resurface. Users can set or remove the corresponding preference manually. Recent changes show source and time; Undo restores the prior values when no later edit or mandatory standard conflicts. Concurrent stale edits produce a conflict rather than overwriting another decision.

Turning suggestions off stops new behavioral collection and hides pending suggestions. Already approved preferences still apply. **Clear stored examples** removes the behavioral excerpts while preserving approved preferences and dismissal decisions; it does not delete the underlying source documents or review audit.

There are two separate ownership domains:

- **Fictional sample:** Workspace plus fictional agent. The existing shared login and presentation switcher expose sample information only. Restoration removes accumulated sample profiles, suggestions, choices, evidence, and changes, then recreates the documented fictional baseline. Jordan starts with eight labeled fixture examples and two suggestions; the other five agents do not inherit his settings.
- **Individual pilot:** Authenticated active member plus brokerage, derived server-side. Personal suggestions start **off** and require opt-in. Neither a sample cookie nor another member's identifier grants access. Brokerage leaders' connection summaries do not expose employee workstyle evidence. Workstyle can be configured before Lofty is connected.

The pilot also supports editing a prepared message and explicitly approving it for copying. That review can supply the user's own before/after evidence when suggestions are enabled. It saves an approved draft locally; it never sends a message or writes a provider record. Review verifies that the connection, lead, and source context are still current. Connection loss or lead-access removal clears associated behavioral excerpts and saved message reviews; approved personal formatting remains. No external CRM activity is mined for behavioral inference.

## Brokerage standards and client facts

Mandatory values and workflow requirements live in a separate workspace/brokerage standards table. Resolution applies mandatory values after personal preferences. Profile mutations cannot override a locked value or modify standards. Human review is always required.

This release provides persistence, precedence, display, and enforcement for standards, **not a brokerage policy editor**. The sample role switcher cannot grant standards-management authority. An authorized administrative provisioning workflow is future work.

Client situations, source facts, and client-specific communication requests remain in their existing records and generation context. Workstyle is a bounded catalog of formatting/workflow choices, not a new freeform factual memory. Preferences never establish client plans or promote an individual's behavior into team policy.

## Workflow conditions

- **Seller guidance:** Trigger: explicitly prepare a new seller package. Condition: the resolved personal/mandatory checklist setting is `include`. Output: optional room-by-room preparation guidance in a clearly labeled general-guidance section. Review: the existing draft, approval, and PDF workflow. No scheduled execution or delivery.
- **Briefing shortcut:** Trigger: open Today with the shortcut enabled and an assigned upcoming appointment available. Output: a link into that appointment's preparation flow. Draft generation still requires the existing preparation action, followed by normal review. No background work or calendar mutation.

## Storage and deployment

`0009_workstyle.sql` adds profiles, standards, bounded evidence, suggestions, and change history. `0010_pilot_message_review.sql` adds final pilot message reviews. Both are additive PostgreSQL migrations and run through the existing migration command. No new external connection, model, service, environment secret, or dependency is required. Existing Render build, pre-deploy migrations/seeding, and startup remain compatible.

Sample seed version 7 adds the fictional examples. Normal seed upgrades do not reset existing sample edits or overwrite an existing workstyle profile. The explicit sample restoration recreates the demonstration baseline. Private pilot profiles are outside sample reset.

## Verification and limits

Automated coverage includes weak/opposing signals, distinct contexts, retries and concurrency, accepted prompt payloads, workflow scope, seller guidance grounding, customize/dismiss/undo/disable/clear, unseen changes during acceptance, agent/brokerage isolation, membership revocation, mandatory standards, transactional observation, sample restoration, CRM context changes, and private message review without provider writes. The same migration/service tests run against PGlite and PostgreSQL. CI additionally exercises production startup and protected HTTP routes.

Desktop and 390-pixel mobile browser checks cover evidence, acceptance, saved comparison, current preferences, undo, customization controls, and dismissal. No live OpenAI generation or live Lofty connection was used to validate this change. Provider requests and deterministic effects are tested; output quality for newly selected preferences still needs a separate authorized live evaluation.

Semantic tone analysis, arbitrary reusable checklist extraction, learning from rejected task categories, ingestion of external behavioral history, background automation, and a brokerage standards editor require additional development. Straightforward rules currently make **zero extra model calls** and do not fine-tune or train a model.
