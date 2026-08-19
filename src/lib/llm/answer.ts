import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { pageAllowedForLens } from "../wiki/local";
import { listRepositoryPages, readSourceGuide, readWikiIndex, readWikiPage, readWikiRaw, searchWikiPages, searchWikiRaw } from "../wiki/repository";
import { LENS_REGISTRY, lensDefinition, prophetLensIds } from "../wiki/lenses";
import { answerPayloadSchema, lensSchema, lensValues, type AnswerPayload, type Lens, type ProphetLens } from "../wiki/schema";

const normalizedSchema = z.object({ normalized: z.string().min(1), entities: z.array(z.string()).default([]), topic: z.array(z.string()).default([]), timeScope: z.string().nullable().default(null), lens: lensSchema });
const answerSchema = answerPayloadSchema.omit({ id: true, question: true, lens: true, cached: true });

export type ProgressReporter = (message: string) => void | Promise<void>;

function plainText(blocks: Anthropic.Messages.ContentBlock[]): string {
  return blocks.filter((block): block is Anthropic.Messages.TextBlock => block.type === "text").map((block) => block.text).join("\n");
}

function parseJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  return JSON.parse((fenced ?? text).trim());
}

export type NormalizedQuestion = z.infer<typeof normalizedSchema>;

export async function normalizeQuestion(question: string, lens: Lens): Promise<NormalizedQuestion> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { normalized: question.trim().replace(/\s+/g, " "), entities: [], topic: [], timeScope: null, lens };
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: process.env.ANTHROPIC_HAIKU_MODEL ?? "claude-haiku-4-5",
    max_tokens: 400,
    // 검색어 확장까지 여기서 끝낸다. 질문에 없는 상위 개념을 뽑아둬야
    // 얇은 코퍼스에서도 구조가 닮은 원문에 걸린다.
    system: "질문의 의미를 보존해 검색용 구조로 정규화하세요. entities에는 질문에 나온 고유명사를, topic에는 그 질문을 한 단계 추상화한 개념어(예: 특정 전쟁 → 강대국 개입, 소모전, 철수)를 3~6개 넣으세요. UI에서 지정한 lens는 바꾸지 마세요. JSON만 반환: {\"normalized\":\"...\",\"entities\":[],\"topic\":[],\"timeScope\":null,\"lens\":\"all\"}",
    messages: [{ role: "user", content: `UI 렌즈: ${lens}\n질문: ${question}` }],
  });
  const parsed = normalizedSchema.parse(parseJson(plainText(response.content)));
  return { ...parsed, lens };
}

const keywordGroups: Array<{ pattern: RegExp; ids: string[] }> = [
  { pattern: /기후|환경|해수면|날씨/, ids: ["climate-transition", "change-principle", "later-heaven"] },
  { pattern: /한국|한반도|동아시아|질서|전쟁|평화/, ids: ["korea-as-crossroads", "east-asia-transition", "later-heaven"] },
  { pattern: /인공지능|AI|기술|자동화/, ids: ["technology-and-agency", "change-principle", "civilizational-transition"] },
];

/**
 * API 키 없이 도는 시드 답변. 실제 유추는 못 하지만
 * 스키마·UI가 기대하는 모든 칸을 채워 화면이 비지 않게 한다.
 */
export async function buildLocalAnswer(question: string, lens: Lens): Promise<AnswerPayload> {
  const pages = (await listRepositoryPages()).filter((page) => pageAllowedForLens(page, lens));
  const matchedIds = keywordGroups.find((group) => group.pattern.test(question))?.ids ?? ["civilizational-transition", "change-principle"];
  const selected = matchedIds.map((id) => pages.find((page) => page.frontmatter.id === id)).filter((page): page is NonNullable<typeof page> => Boolean(page)).slice(0, 3);
  const evidencePages = selected.length ? selected : pages.slice(0, 3);
  const focus = evidencePages.map((page) => page.frontmatter.title).join(" · ");
  const lead = evidencePages[0];
  return {
    id: randomUUID(),
    question,
    lens,
    headline: "지금의 변화는 하나의 사건이라기보다 오래된 질서가 새 균형을 찾는 전환기로 읽힙니다.",
    prediction: [
      "## 지금 어디에 서 있는가",
      "",
      `지금의 변화는 하나의 사건보다 오래된 질서가 새 균형을 찾는 전환기로 읽힙니다. ${focus ? `**${focus}**의 관점을 겹쳐 보면` : "현재 자료를 종합하면"} 속도보다 방향을 분별하는 일이 중요합니다.`,
      "",
      "## 무엇을 지켜볼 것인가",
      "",
      "- 사건 자체보다 사건을 만드는 관계의 배치가 어떻게 바뀌는지",
      "- 전환의 비용을 누가 먼저, 얼마나 감당하게 되는지",
    ].join("\n"),
    evidence: evidencePages.map((page) => ({
      kind: "page" as const,
      pageId: page.frontmatter.id,
      title: page.frontmatter.title,
      detail: page.frontmatter.description,
      anchor: page.frontmatter.sources[0] ?? null,
    })),
    reasoning: lead ? [{
      observation: `${lead.frontmatter.title} 문서는 ${lead.frontmatter.description}는 관점을 정리합니다.`,
      pattern: "질서가 바뀔 때는 사건의 종류보다 관계의 배치와 때의 이동이 먼저 달라진다는 구조입니다.",
      projection: "이 구조를 질문의 상황에 대입하면, 결과를 특정하기보다 관계가 어느 방향으로 재배열되는지를 먼저 읽는 편이 낫습니다.",
      basis: [lead.frontmatter.id],
      leap: "과거 사례의 구조가 오늘의 상황에도 같은 방식으로 작동한다는 전제가 필요합니다.",
    }] : [],
    scenarios: [
      { title: "점진적 재배열", likelihood: "plausible" as const, horizon: null, summary: "충돌보다 조정이 앞서며 질서가 서서히 옮겨 갑니다.", signals: ["기존 합의가 파기되지 않고 조건만 다시 쓰이는 흐름"] },
      { title: "단절적 전환", likelihood: "unlikely" as const, horizon: null, summary: "한 번의 충격으로 기존 균형이 빠르게 무너집니다.", signals: ["조정 기구가 작동을 멈추는 신호"] },
    ],
    assumptions: ["현재의 사회·기술 추세가 단기간에 완전히 단절되지 않는다고 가정했습니다.", "상징적 문헌을 사실 예측이 아닌 해석의 틀로 사용했습니다.", "과거 사례와 오늘의 상황을 구조적으로 대응시킨 부분은 원문에 없는 AI의 유추입니다."],
    confidence: evidencePages.length >= 2 ? "medium" : "low",
    confidenceReason: evidencePages.length >= 2 ? "서로 다른 문헌 계열에서 공통된 변화의 구조를 확인했지만, 시점과 사건은 단정할 수 없습니다." : "선택한 렌즈에서 직접 연결되는 근거가 제한적입니다.",
    suggestedLenses: (prophetLensIds as readonly Lens[]).filter((item) => item !== lens).slice(0, 2),
  };
}

/** 렌즈가 어떤 방식의 예언인지 알려 준다. 유추의 성격이 렌즈마다 다르기 때문이다. */
function lensBriefing(lens: Lens): string {
  const entries = lens === "all" ? LENS_REGISTRY : [lensDefinition(lens as ProphetLens)];
  return entries.map((item) => `- ${item.label}(${item.id}): ${item.short} · 방식 ${item.method} · 기록 신뢰도 ${item.recordReliability}`).join("\n");
}

async function systemRules(lens: Lens): Promise<string> {
  const agents = await fs.readFile(path.join(process.cwd(), "AGENTS.md"), "utf8");
  return `${agents}

너는 미래위키의 답변 엔진이다. 이 위키의 목적은 "원문에 답이 적혀 있는가"를 확인하는 것이 아니라, 원문이 담은 논리와 구조로 아직 오지 않은 일을 유추해 보이는 것이다.

## 쓸 수 있는 렌즈
${lensBriefing(lens)}
렌즈 제약: ${lens}. all이 아니면 해당 lens 태그가 붙은 위키 페이지만 근거로 쓴다. raw 원문은 해당 렌즈의 출처 디렉터리를 우선 본다.

## 코퍼스의 언어 — 가장 중요한 제약
raw 원문은 대부분 한문(周易·推背圖·燒餅歌)과 중세 프랑스어(Nostradamus)다. 한국어로 search_raw를 호출하면 거의 언제나 0건이 나온다. 0건은 "근거가 없다"는 뜻이 아니라 "검색어의 언어가 틀렸다"는 뜻이다.
- 질문의 개념을 원문의 언어로 옮겨 검색한다. 전쟁·군사 → 師, 兵, 戎, 伐, 征 / 변혁 → 革, 鼎, 變 / 대립·다툼 → 訟, 睽, 爭 / 막힘 → 否, 蹇, 困 / 물러남 → 遯, 退 / 넘침과 반전 → 亢, 極, 復.
- 한자는 한 글자만 넣어도 검색된다. 여러 후보를 한 번에 넣어도 된다(예: "師 兵 伐").
- Nostradamus는 원문 철자로 찾는다(guerre, sang, roy, Perse, Mesopotamie 등).
- list_sources로 괘·象의 줄 번호를 확인하면 검색 없이 read_raw로 바로 갈 수 있다.

## 작업 순서
1. 항해 — list_sources로 어떤 원전이 있고 어디를 펴야 하는지 먼저 파악한다.
2. 탐색 — search_wiki는 한국어로, search_raw는 원문의 언어로 호출한다. 첫 검색이 비면 다른 글자·다른 개념으로 최소 두 번 더 시도한다.
3. 확인 — 걸린 페이지는 read_page로, 원문 줄은 read_raw로 실제로 읽는다. 읽지 않은 것은 인용하지 않는다.
4. 구조 추출 — 읽은 원문에서 반복되는 구조(관계의 배치, 때의 이동, 순환의 국면, 과잉과 반전)를 뽑는다. 표현이 아니라 구조를 뽑아야 한다.
5. 유추 — 그 구조를 질문의 상황에 대입한다. 원문이 다룬 과거 사례와 질문의 대상이 어느 지점에서 대응하는지, 어긋나는지 밝힌다.
6. 분기 — 유추의 결과를 하나로 단정하지 말고 2~3개의 갈래와 각 갈래를 가리키는 관찰 가능한 신호로 정리한다.

## 반드시 지킬 것
- "근거가 없다", "관련 문서를 찾지 못했다"로 답을 끝내는 것은 실패다. 직접 언급이 없는 것이 정상이며, 그때 하는 일이 유추다.
- 대신 구조가 가장 가까운 원문을 찾아 유추의 사슬을 세우고, 확신도를 low로 낮추고, confidenceReason에 어디가 약한 고리인지 적는다.
- 원문이 말한 것(observation)과 AI가 대입한 것(projection)을 절대 섞지 않는다. 투사는 언제나 reasoning의 projection과 assumptions에만 둔다.
- 예언을 사실이나 보장으로 단정하지 않는다. "~할 것이다" 대신 "~로 읽힌다", "~할 여지가 크다"로 쓴다.
- 서로 다른 전통이 비슷해 보인다는 사실을 같은 기원이나 같은 결론의 증거로 쓰지 않는다.

## 출력 형식
최종 응답은 다른 문장 없이 JSON 하나만 반환한다.
{
  "headline": "한 문장 요약. 마크다운 기호를 쓰지 않는다.",
  "prediction": "마크다운 본문. 아래 형식 규칙을 따른다.",
  "evidence": [{"kind":"page"|"raw","pageId":"위키 id 또는 raw 파일 경로","title":"표시할 제목","detail":"이 근거가 무엇을 말하는지 한 문장","anchor":"raw/...#L10-L12 또는 null"}],
  "reasoning": [{"observation":"원문이 실제로 말한 것","pattern":"거기서 뽑은 구조","projection":"질문의 상황에 대입한 추론","basis":["pageId 또는 raw 앵커"],"leap":"이 대응이 성립하려면 참이어야 하는 조건"}],
  "scenarios": [{"title":"갈래 이름","likelihood":"likely"|"plausible"|"unlikely","horizon":"대략의 시간대 또는 null","summary":"두세 문장","signals":["관찰 가능한 신호"]}],
  "assumptions": ["원문에 없는데 AI가 보탠 전제"],
  "confidence": "high"|"medium"|"low",
  "confidenceReason": "왜 그 확신도인지. 약한 고리를 지목한다.",
  "suggestedLenses": ${JSON.stringify(lensValues)} 중의 값들
}

prediction 마크다운 규칙:
- 250~600자. \`##\` 소제목 2~3개로 나눈다. 첫 소제목은 질문에 대한 직답이다.
- 문단은 2~4문장으로 짧게 끊는다. 한 문단이 화면을 넘기지 않게 한다.
- 핵심 개념은 \`**굵게**\`, 나열은 \`-\` 목록으로 쓴다. 표는 비교가 필요할 때만 쓴다.
- 표제 아래 빈 줄을 반드시 넣는다. 제목에 번호를 붙이지 않는다.

evidence는 실제로 read_page 또는 read_raw로 읽은 것만 최소 1건 넣는다. reasoning은 최소 1단계, scenarios는 최소 2갈래를 채운다.
confidence는 "high" | "medium" | "low" 중 하나여야 한다. 다른 값이나 서술형 표현은 금지한다.
suggestedLenses는 렌즈 id 배열이며 렌즈 이름 외의 문구를 넣지 마라.`;
}

export async function runAnswer(question: string, lens: Lens, normalized: NormalizedQuestion, report: ProgressReporter): Promise<AnswerPayload> {
  if (!process.env.ANTHROPIC_API_KEY) {
    await report("시드 위키에서 관련 문서를 찾는 중");
    return buildLocalAnswer(question, lens);
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const tools: Anthropic.Messages.Tool[] = [
    { name: "read_index", description: "Wiki 페이지 목록과 설명을 읽는다.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
    { name: "search_wiki", description: "질문어로 Wiki 페이지 본문까지 검색해 pageId 후보를 찾는다. 렌즈 제한이 적용된다.", input_schema: { type: "object", properties: { query: { type: "string", minLength: 2 } }, required: ["query"], additionalProperties: false } },
    { name: "search_raw", description: "raw 원문 전체를 줄 단위로 검색해 경로와 줄 번호를 찾는다. 원문의 언어(한문·중세 프랑스어·라틴어)로 검색해야 걸린다.", input_schema: { type: "object", properties: { query: { type: "string", minLength: 1 } }, required: ["query"], additionalProperties: false } },
    { name: "list_sources", description: "원전 출처 목록과 각 파일의 판본·줄 색인을 읽는다. 괘 번호나 象 번호가 몇 번째 줄인지 여기서 확인한다.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
    { name: "read_page", description: "pageId로 Wiki 페이지를 읽는다. 렌즈 접근 제한이 적용된다.", input_schema: { type: "object", properties: { pageId: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" } }, required: ["pageId"], additionalProperties: false } },
    { name: "read_raw", description: "근거 원문의 지정 줄을 최대 200줄까지 확인한다.", input_schema: { type: "object", properties: { path: { type: "string", pattern: "^raw/" }, startLine: { type: "integer", minimum: 1 }, endLine: { type: "integer", minimum: 1 } }, required: ["path", "startLine", "endLine"], additionalProperties: false } },
  ];
  const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: `원 질문: ${question}\n정규화 정보: ${JSON.stringify(normalized)}\n오늘 날짜: ${new Date().toISOString().slice(0, 10)}` }];
  const consultedPages = new Map<string, string>();
  const consultedRaw = new Map<string, string>();
  const rules = await systemRules(lens);
  const searchInput = z.object({ query: z.string().min(1).max(200) });
  const readPageInput = z.object({ pageId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) });
  const readRawInput = z.object({ path: z.string().regex(/^raw\/(?!.*\.\.)[^\0]+$/), startLine: z.number().int().min(1), endLine: z.number().int().min(1) }).refine((value) => value.endLine >= value.startLine, "endLine must be after startLine");

  async function executeTool(toolUse: Anthropic.Messages.ToolUseBlock): Promise<Anthropic.Messages.ToolResultBlockParam> {
    const input = toolUse.input as Record<string, unknown>;
    try {
      if (toolUse.name === "read_index") {
        await report("위키 인덱스를 읽는 중");
        return { type: "tool_result", tool_use_id: toolUse.id, content: await readWikiIndex() };
      }
      if (toolUse.name === "search_wiki") {
        const { query } = searchInput.parse(input);
        await report(`위키에서 "${query}"를 찾는 중`);
        return { type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(await searchWikiPages(query, lens)) };
      }
      if (toolUse.name === "list_sources") {
        await report("원전 목록과 줄 색인을 살피는 중");
        return { type: "tool_result", tool_use_id: toolUse.id, content: await readSourceGuide() };
      }
      if (toolUse.name === "search_raw") {
        const { query } = searchInput.parse(input);
        await report(`원문에서 "${query}"를 찾는 중`);
        return { type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(await searchWikiRaw(query)) };
      }
      if (toolUse.name === "read_page") {
        const { pageId } = readPageInput.parse(input);
        await report(`${pageId} 문서를 읽는 중`);
        const page = await readWikiPage(pageId, lens);
        if (page && "frontmatter" in page) consultedPages.set(page.frontmatter.id, page.frontmatter.title);
        return { type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(page ?? { error: "페이지 없음" }) };
      }
      if (toolUse.name === "read_raw") {
        const { path: rawPath, startLine, endLine } = readRawInput.parse(input);
        await report(`${rawPath} 원문을 확인하는 중`);
        const excerpt = await readWikiRaw(rawPath, startLine, endLine);
        consultedRaw.set(rawPath, excerpt.split("\n").find((line) => line.trim().length > 1)?.trim().slice(0, 120) ?? rawPath);
        return { type: "tool_result", tool_use_id: toolUse.id, content: excerpt };
      }
      return { type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify({ error: "지원하지 않는 도구" }), is_error: true };
    } catch {
      return { type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify({ error: "도구 입력 또는 문서를 확인할 수 없음" }), is_error: true };
    }
  }

  /**
   * 인용을 실제로 읽은 것만 남긴다.
   *
   * 예전에는 어긋나면 예외를 던져 답변 전체를 버렸는데, 그러면 한 건의 잘못된 인용이
   * 답을 통째로 없애 버린다. 지금은 검증되지 않은 항목만 떨어뜨리고,
   * 남는 게 없으면 실제 열람 기록으로 근거를 다시 세운다.
   */
  function verifyEvidence(parsed: z.infer<typeof answerSchema>): AnswerPayload["evidence"] {
    const kept = parsed.evidence.filter((item) => (item.kind === "raw" ? consultedRaw.has(item.pageId) : consultedPages.has(item.pageId)))
      .map((item) => (item.kind === "raw" ? item : { ...item, title: consultedPages.get(item.pageId)! }));
    if (kept.length) return kept;
    const fallbackPages = [...consultedPages].map(([pageId, title]) => ({ kind: "page" as const, pageId, title, detail: "답변의 유추가 기대는 문서입니다.", anchor: null }));
    const fallbackRaw = [...consultedRaw].map(([rawPath, excerpt]) => ({ kind: "raw" as const, pageId: rawPath, title: rawPath, detail: excerpt, anchor: null }));
    return [...fallbackPages, ...fallbackRaw].slice(0, 4);
  }

  /** reasoning의 basis도 실제 열람 기록에 걸리는 것만 남긴다. 지어낸 앵커가 근거처럼 보이면 안 된다. */
  function verifyBasis(basis: string[]): string[] {
    return basis.filter((item) => consultedPages.has(item) || [...consultedRaw.keys()].some((rawPath) => item.startsWith(rawPath)));
  }

  for (let turn = 0; turn < 10; turn += 1) {
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_SONNET_MODEL ?? "claude-sonnet-5",
      // Sonnet 5는 thinking 생략 시 adaptive가 켜지고 max_tokens를 thinking과 나눠 쓴다.
      max_tokens: 12000,
      output_config: { effort: "medium" },
      system: rules,
      tools,
      messages,
    });
    const toolUses = response.content.filter((block): block is Anthropic.Messages.ToolUseBlock => block.type === "tool_use");
    if (!toolUses.length) {
      const parsed = answerSchema.parse(parseJson(plainText(response.content)));
      const evidence = verifyEvidence(parsed);
      if (!evidence.length) throw new Error("답변이 실제로 읽은 문서를 남기지 못했습니다.");
      const reasoning = parsed.reasoning.map((step) => ({ ...step, basis: verifyBasis(step.basis) }));
      return { id: randomUUID(), question, lens, ...parsed, headline: parsed.headline || parsed.prediction.replace(/[#*`>-]/g, "").split("\n").find((line) => line.trim())?.trim().slice(0, 160) || question, evidence, reasoning };
    }

    messages.push({ role: "assistant", content: response.content });
    const results = await Promise.all(toolUses.map(executeTool));
    messages.push({ role: "user", content: results });
  }

  throw new Error("도구 호출 한도를 초과했습니다.");
}
