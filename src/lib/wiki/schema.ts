import { z } from "zod";
import {
  lensIds,
  prophetLensIds,
  PROPHECY_METHODS,
  RECORD_RELIABILITIES,
  type Lens as LensId,
} from "./lenses";

export { LENS_REGISTRY, PROPHECY_METHODS, RECORD_RELIABILITIES, lensDefinition } from "./lenses";
export type { LensDefinition, ProphecyMethod, ProphetLens, RecordReliability } from "./lenses";

/** 렌즈 값은 lenses.ts의 LENS_REGISTRY에서 파생된다. 예언가 추가는 그 파일만 고친다. */
export const lensValues = lensIds;
export const pageTypes = ["prophet", "principle", "prediction", "entity", "topic", "synthesis"] as const;

export const lensSchema = z.enum(lensValues);
export type Lens = LensId;

/**
 * 예언 기록 단위의 검증 필드. type: "prediction" 페이지에서 사용한다.
 *
 * 기존 페이지 호환을 위해 optional이며, 누락은 validate-wiki가 경고로 보고한다.
 * 여기의 verdict는 "예언이 맞았는가", frontmatter의 confidence는 "해석을 얼마나 확신하는가",
 * _meta.yaml의 recordReliability는 "사건 전에 실제로 기록됐는가" — 세 축은 서로 독립이다.
 */
export const prophecySchema = z.object({
  /** 예언이 기록·출판된 시점. 위키 편집일(updated)과 다르다. */
  recorded: z.string().min(1),
  /** 예언이 가리키는 시기. 특정할 수 없으면 null. */
  targetPeriod: z.string().nullable().default(null),
  /** 대응한다고 거론되는 실제 사건. 없으면 null. */
  actualEvent: z.string().nullable().default(null),
  /** 사건 발생 이전에 이 해석이 존재했는가. */
  interpretedBefore: z.boolean().default(false),
  /** 사건 발생 이후에 붙은 해석인가. */
  interpretedAfter: z.boolean().default(false),
  verdict: z.enum(["hit", "partial", "miss", "unresolved"]).default("unresolved"),
});
export type Prophecy = z.infer<typeof prophecySchema>;

export const wikiFrontmatterSchema = z.object({
  type: z.enum(pageTypes),
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1),
  description: z.string().min(1),
  lens: z.array(z.enum(prophetLensIds)).min(1),
  sources: z.array(z.string().regex(/^raw\/.+#L\d+(?:-L\d+)?$/)).min(1),
  confidence: z.enum(["high", "medium", "low"]),
  updated: z.coerce.date(),
  prophecy: prophecySchema.optional(),
});

export type WikiFrontmatter = z.infer<typeof wikiFrontmatterSchema>;

/**
 * raw/<source>/_meta.yaml 스키마. 출처 단위 메타데이터.
 * 신규 필드는 기존 시드 호환을 위해 optional이며 validate-wiki가 누락을 경고한다.
 */
export const rawMetaSchema = z.object({
  source_id: z.string().min(1),
  title: z.string().min(1),
  copyright: z.enum(["public-domain", "full", "excerpt", "restricted"]),
  collected_at: z.coerce.date().optional(),
  review_status: z.string().optional(),
  notice: z.string().optional(),
  /** LENS_REGISTRY의 렌즈 id. 어느 관점의 원문인지 연결한다. */
  lens: z.enum(prophetLensIds).optional(),
  method: z.enum(PROPHECY_METHODS).optional(),
  record_reliability: z.enum(RECORD_RELIABILITIES).optional(),
  /** 정본으로 삼은 판본. 판본이 다르면 줄 앵커가 달라지므로 반드시 기록한다. */
  canonical_edition: z.string().optional(),
  /** 본인 생전 기록인지, 후대 귀속인지. record_reliability의 근거. */
  attribution_note: z.string().optional(),
});

export type RawMeta = z.infer<typeof rawMetaSchema>;

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
