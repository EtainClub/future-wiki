import { z } from "zod";

export const lensValues = ["all", "tanheo", "iching", "jeongyeok", "nostradamus"] as const;
export const pageTypes = ["prophet", "principle", "prediction", "entity", "topic", "synthesis"] as const;
const pageLensValues = ["tanheo", "iching", "jeongyeok", "nostradamus"] as const;

export const lensSchema = z.enum(lensValues);
export type Lens = z.infer<typeof lensSchema>;

export const wikiFrontmatterSchema = z.object({
  type: z.enum(pageTypes),
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1),
  description: z.string().min(1),
  lens: z.array(z.enum(pageLensValues)).min(1),
  sources: z.array(z.string().regex(/^raw\/.+#L\d+(?:-L\d+)?$/)).min(1),
  confidence: z.enum(["high", "medium", "low"]),
  updated: z.coerce.date(),
});

export type WikiFrontmatter = z.infer<typeof wikiFrontmatterSchema>;

export type WikiPage = {
  slug: string;
  body: string;
  frontmatter: WikiFrontmatter;
};

export const answerPayloadSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  lens: lensSchema,
  prediction: z.string().min(1),
  evidence: z.array(z.object({ pageId: z.string().min(1), title: z.string().min(1), detail: z.string().min(1) })).min(1),
  assumptions: z.array(z.string().min(1)),
  confidence: z.enum(["high", "medium", "low"]),
  confidenceReason: z.string().min(1),
  suggestedLenses: z.array(lensSchema),
  cached: z.boolean().optional(),
});

export type AnswerPayload = z.infer<typeof answerPayloadSchema>;
