import { z } from "zod";
import { protectedRoute, readJson } from "@/lib/auth";
import { reviewPackage } from "@/lib/repository";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T12:00:00Z`);
    return (
      !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
    );
  }, "Choose a valid calendar date");

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return protectedRoute(
    request,
    async () => {
      const { id } = await context.params;
      const input = await readJson(
        request,
        z
          .object({
            decisions: z
              .array(
                z
                  .object({
                    id: z.string().min(1).max(120),
                    status: z.enum(["approved", "rejected"]),
                    body: z.string().trim().min(1).max(8000),
                    title: z.string().trim().min(1).max(160).optional(),
                    dueDate: dateSchema.nullable().optional(),
                  })
                  .strict(),
              )
              .min(1)
              .max(24),
          })
          .strict(),
      );
      return reviewPackage(id, input);
    },
    true,
  );
}
