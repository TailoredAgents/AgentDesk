# Live AI verification

Generation, rewriting, and transcription run on the server through the official OpenAI SDK. The API key must never be stored in a browser setting or a `NEXT_PUBLIC_` variable. No API key was available during this development session; deterministic safety tests do not establish live model quality or project access.

## Run an actual provider evaluation

Configure `OPENAI_API_KEY`, `OPENAI_MODEL`, and `OPENAI_TRANSCRIBE_MODEL` in `.env`, `.env.local`, or the process environment, using the same project and model settings intended for Render. Optionally set `OPENAI_REWRITE_MODEL` to compare a separate model for rewriting; otherwise it uses the analysis model. Then run:

```powershell
npm run test:ai:live -- --allow-live
```

This command makes paid API calls only with the explicit `--allow-live` flag. It uses fictional seller/buyer conversations and a synthetic fictional speech fixture. It checks configured model access, structured generation, ambiguity and conflicting dates, distinct communication profiles, factual rewriting, proactive drafting, and transcription. The report is saved to `test-results/ai-live-eval.json` (gitignored). Missing credentials produce **SKIPPED** and exit code 2; that is not a passing provider test.

To evaluate a different authorized fictional recording:

```powershell
npm run test:ai:live -- --allow-live --audio C:\path\to\fictional-recording.wav
```

Review the generated messages yourself. Passing automatic checks is necessary but insufficient for judging natural writing, usefulness, or subtle factual errors. Compare the same cases across accessible compatible models, recording latency, token usage, quality, and current provider pricing. The application does not assume the default model is the cheapest or best for a particular project.

## Presentation gate

Use live processing during the meeting only after the evaluation passes with the deployed configuration and the microphone flow works in the actual presentation browser. Rehearse consent, permission denial/recovery, recording, stopping, playback, submission, and rewriting. The browser uses its supported WebM, MP4, or Ogg recording format; unsupported browsers can upload audio or use a written note.

If the provider is unavailable, the source remains available for retry. Continue with a package labeled **Saved sample output** and manual editing. No fabricated fallback should appear as newly generated work.

## Boundaries

- Source quotations and certainty accompany proposed facts and actions. Unsupported dates, prices, confirmations, or attachment claims are rejected when detected. Human review remains necessary.
- New generation and rewrite context is scoped to the selected human agent, client, and property, including communication preferences and relevant saved history. Emails and phone numbers are omitted from the structured provider context.
- Repeated submission IDs and recommendation provenance prevent duplicate database work. A new request should use a new UUID; retry the same attempt with its original UUID.
- Approval stores internal drafts and proposed changes. No Lofty, email, SMS, or external calendar delivery is connected.
- Provider calls run within web requests; there is no durable background queue or automatic ingestion service.

See [validation results](VALIDATION.md) for the checks actually performed and [the presentation guide](DEMO_GUIDE.md) for the live/fallback walkthrough.
