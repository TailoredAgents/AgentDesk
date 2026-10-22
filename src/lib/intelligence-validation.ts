import { z } from "zod";
import { groundedDueDate } from "./ai-quality";
import { intelligenceTopics, type Observation } from "./intelligence-types";
import { topicPatterns } from "./intelligence";
export const observationSchema = z.object({
  topic: z.enum(intelligenceTopics),
  value: z.string().trim().min(3).max(1000),
  sourceQuote: z.string().trim().min(3).max(2000),
  certainty: z.enum(["confirmed", "requested", "uncertain"]),
  effectiveDate: z.string().nullable(),
  intent: z.enum(["information", "replacement"]),
});
const normalize = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
export function validateObservations(
  observations: Observation[],
  transcript: string,
): Observation[] {
  return observations.map((raw) => {
    const o = observationSchema.parse(raw);
    if (
      !normalize(transcript).includes(normalize(o.sourceQuote)) ||
      !normalize(o.sourceQuote).includes(normalize(o.value))
    )
      throw new Error("Remembered information must quote the source directly.");
    if (!topicPatterns[o.topic].test(o.sourceQuote))
      throw new Error("The source does not support this intelligence topic.");
    if (
      /\b(anxious|depressed|mental health|religio\w*|ethnic\w*|race|pregnan\w*|sexual\w*|disabil\w*|diagnos\w*)\b/i.test(
        o.value,
      )
    )
      throw new Error(
        "Client intelligence is limited to practical real estate information.",
      );
    if (
      ["communication", "buyer_priority"].includes(o.topic) &&
      !/\b(prefer\w*|want\w*|need\w*|please|only|rather|priority|important)\b/i.test(
        o.sourceQuote,
      )
    )
      throw new Error("A preference must be explicitly stated.");
    const qualified =
      /\b(prefer\w*|request\w*|would|could|hop\w*|consider\w*|not confirmed|unconfirmed|need to confirm|still need|awaiting)\b/i.test(
        o.value,
      );
    if (
      o.certainty === "confirmed" &&
      qualified &&
      !["communication", "buyer_priority", "objective"].includes(o.topic)
    )
      o.certainty = "requested";
    if (
      o.certainty === "confirmed" &&
      ["cleaning", "photography", "staging", "listing_launch"].includes(
        o.topic,
      ) &&
      (!/\b(confirmed|booked|scheduled|agreed)\b/i.test(o.value) ||
        /\b(not|never|isn[’']t|wasn[’']t)\s+(?:yet\s+)?(?:confirmed|booked|scheduled|agreed)\b/i.test(
          o.value,
        ))
    )
      o.certainty = "uncertain";
    if (o.effectiveDate)
      o.effectiveDate = groundedDueDate(
        o.effectiveDate,
        o.sourceQuote,
        o.sourceQuote,
      );
    return o;
  });
}
