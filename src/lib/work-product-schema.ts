import { z } from "zod";

/** Shared structural shape; server-only evidence checks live in work-product-content. */
export const workProductContentSchema = z.object({
  title: z.string().trim().min(3).max(160),
  introduction: z.string().trim().min(10).max(1200),
  sections: z.array(z.object({
    title: z.string().trim().min(3).max(120),
    kind: z.enum(["recorded_facts", "general_guidance", "open_questions", "next_steps"]),
    items: z.array(z.object({
      text: z.string().trim().min(3).max(1000),
      sourceId: z.string().min(1).max(200).nullable(),
      sourceQuote: z.string().min(3).max(4000).nullable(),
      certainty: z.enum(["confirmed", "requested", "uncertain", "general"]),
    }).strict()).min(1).max(10),
  }).strict()).min(2).max(8),
}).strict();
