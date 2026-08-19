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
  /**
   * 저자가 예언을 기록한 시점. 위키 편집일(updated)이나 판본 연도와 다르다.
   * 후대 교정본으로 인제스트하면 자동으로는 알 수 없으므로 null을 허용하고 사람이 채운다.
   */
  recorded: z.string().min(1).nullable().default(null),
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

/**
 * 답변이 인용한 근거 하나.
 *
 * kind가 "page"면 pageId는 위키 문서 id이고, "raw"면 pageId는 raw 파일 경로다.
 * 위키가 아직 얇아 원문만 있고 문서가 없는 주제가 많으므로 두 경로를 모두 허용한다.
 */
export const evidenceSchema = z.object({
  kind: z.enum(["page", "raw"]).default("page"),
  pageId: z.string().min(1),
  title: z.string().min(1),
  detail: z.string().min(1),
  /** raw/<source>/<file>#L10-L12 형태의 줄 앵커. 확인하지 못했으면 null. */
  anchor: z.string().nullable().default(null),
});
export type Evidence = z.infer<typeof evidenceSchema>;

/**
 * 미래 유추의 한 단계. 원문에서 읽은 것 → 뽑아낸 구조 → 오늘에 대응시킨 추론으로 나눈다.
 *
 * 세 칸을 분리하는 이유는 어디까지가 기록이고 어디부터가 AI의 대입인지
 * 독자가 문장 단위로 구분할 수 있게 하기 위함이다. projection은 언제나 추론이다.
 */
export const inferenceStepSchema = z.object({
  /** 원문·과거 사례가 실제로 말한 내용. */
  observation: z.string().min(1),
  /** 그 사례에서 뽑아낸 반복 구조나 원리. */
  pattern: z.string().min(1),
  /** 그 구조를 질문의 상황에 대입했을 때 나오는 추론. */
  projection: z.string().min(1),
  /** 이 단계가 기대는 pageId 또는 raw 앵커 목록. */
  basis: z.array(z.string().min(1)).default([]),
  /** 유비가 성립하려면 참이어야 하는 조건. 깨지면 이 단계는 무너진다. */
  leap: z.string().nullable().default(null),
});
export type InferenceStep = z.infer<typeof inferenceStepSchema>;

/** 갈라지는 미래 하나. 확률이 아니라 상대적 무게로 읽는다. */
export const scenarioSchema = z.object({
  title: z.string().min(1),
  likelihood: z.enum(["likely", "plausible", "unlikely"]),
  /** "2030년대 초반"처럼 대략의 시간대. 특정할 수 없으면 null. */
  horizon: z.string().nullable().default(null),
  summary: z.string().min(1),
  /** 이 갈래로 가고 있음을 알려주는 관찰 가능한 신호. */
  signals: z.array(z.string().min(1)).default([]),
});
export type Scenario = z.infer<typeof scenarioSchema>;

export const answerPayloadSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  lens: lensSchema,
  /** 한 문장 요약. 목록·기록에 쓰이므로 마크다운 없이 쓴다. */
  headline: z.string().default(""),
  /** 본문. 마크다운으로 렌더링된다. */
  prediction: z.string().min(1),
  evidence: z.array(evidenceSchema).min(1),
  /** 근거에서 미래 추론으로 건너가는 사슬. 신규 필드라 과거 캐시 호환을 위해 기본값을 둔다. */
  reasoning: z.array(inferenceStepSchema).default([]),
  scenarios: z.array(scenarioSchema).default([]),
  assumptions: z.array(z.string().min(1)),
  confidence: z.enum(["high", "medium", "low"]),
  confidenceReason: z.string().min(1),
  suggestedLenses: z.array(lensSchema),
  cached: z.boolean().optional(),
});

export type AnswerPayload = z.infer<typeof answerPayloadSchema>;
