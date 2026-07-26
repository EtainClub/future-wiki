import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { pageAllowedForLens } from "../wiki/local";
import { listRepositoryPages, readWikiIndex, readWikiPage, readWikiRaw } from "../wiki/repository";
import { answerPayloadSchema, lensSchema, type AnswerPayload, type Lens } from "../wiki/schema";

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
    model: process.env.ANTHROPIC_HAIKU_MODEL ?? "claude-3-5-haiku-latest",
    max_tokens: 400,
    system: "질문의 의미를 보존해 검색용 구조로 정규화하세요. UI에서 지정한 lens는 바꾸지 마세요. JSON만 반환: {\"normalized\":\"...\",\"entities\":[],\"topic\":[],\"timeScope\":null,\"lens\":\"all\"}",
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

export async function buildLocalAnswer(question: string, lens: Lens): Promise<AnswerPayload> {
  const pages = (await listRepositoryPages()).filter((page) => pageAllowedForLens(page, lens));
  const matchedIds = keywordGroups.find((group) => group.pattern.test(question))?.ids ?? ["civilizational-transition", "change-principle"];
  const selected = matchedIds.map((id) => pages.find((page) => page.frontmatter.id === id)).filter((page): page is NonNullable<typeof page> => Boolean(page)).slice(0, 3);
  const evidencePages = selected.length ? selected : pages.slice(0, 3);
  const focus = evidencePages.map((page) => page.frontmatter.title).join(" · ");
  return {
    id: randomUUID(),
    question,
    lens,
    prediction: `지금의 변화는 하나의 사건보다 오래된 질서가 새 균형을 찾는 전환기로 읽힙니다. ${focus ? `${focus}의 관점을 함께 보면` : "현재 자료를 종합하면"} 속도보다 방향을 분별하는 일이 중요합니다.`,
    evidence: evidencePages.map((page) => ({
      pageId: page.frontmatter.id,
      title: page.frontmatter.title,
      detail: page.frontmatter.description,
    })),
    assumptions: ["현재의 사회·기술 추세가 단기간에 완전히 단절되지 않는다고 가정했습니다.", "상징적 문헌을 사실 예측이 아닌 해석의 틀로 사용했습니다."],
    confidence: evidencePages.length >= 2 ? "medium" : "low",
    confidenceReason: evidencePages.length >= 2 ? "서로 다른 문헌 계열에서 공통된 변화의 구조를 확인했지만, 시점과 사건은 단정할 수 없습니다." : "선택한 렌즈에서 직접 연결되는 근거가 제한적입니다.",
    suggestedLenses: (["tanheo", "iching", "jeongyeok"] as Lens[]).filter((item) => item !== lens).slice(0, 2),
  };
}

async function systemRules(lens: Lens): Promise<string> {
  const agents = await fs.readFile(path.join(process.cwd(), "AGENTS.md"), "utf8");
  return `${agents}\n\n렌즈 제약: ${lens}. all이 아니면 해당 lens 태그 페이지 외에는 근거로 사용할 수 없다.\n모든 근거는 실제 read_page 결과에 있는 pageId만 사용한다. 추론은 assumptions에만 넣는다. 예언을 사실로 단정하지 않는다.\n최종 응답은 JSON만 반환한다: {prediction, evidence:[{pageId,title,detail}], assumptions, confidence, confidenceReason, suggestedLenses}.`;
}

export async function runAnswer(question: string, lens: Lens, normalized: NormalizedQuestion, report: ProgressReporter): Promise<AnswerPayload> {
  if (!process.env.ANTHROPIC_API_KEY) {
    await report("시드 위키에서 관련 문서를 찾는 중");
    return buildLocalAnswer(question, lens);
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const tools: Anthropic.Messages.Tool[] = [
    { name: "read_index", description: "Wiki 페이지 목록과 설명을 읽는다.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
    { name: "read_page", description: "pageId로 Wiki 페이지를 읽는다. 렌즈 접근 제한이 적용된다.", input_schema: { type: "object", properties: { pageId: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" } }, required: ["pageId"], additionalProperties: false } },
    { name: "read_raw", description: "근거 원문의 지정 줄을 최대 200줄까지 확인한다.", input_schema: { type: "object", properties: { path: { type: "string", pattern: "^raw/" }, startLine: { type: "integer", minimum: 1 }, endLine: { type: "integer", minimum: 1 } }, required: ["path", "startLine", "endLine"], additionalProperties: false } },
  ];
  const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: `원 질문: ${question}\n정규화 정보: ${JSON.stringify(normalized)}` }];
  const consultedPages = new Map<string, string>();
  const rules = await systemRules(lens);
  const readPageInput = z.object({ pageId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) });
  const readRawInput = z.object({ path: z.string().regex(/^raw\/(?!.*\.\.)[^\0]+$/), startLine: z.number().int().min(1), endLine: z.number().int().min(1) }).refine((value) => value.endLine >= value.startLine, "endLine must be after startLine");

  async function executeTool(toolUse: Anthropic.Messages.ToolUseBlock): Promise<Anthropic.Messages.ToolResultBlockParam> {
    const input = toolUse.input as Record<string, unknown>;
    try {
      if (toolUse.name === "read_index") {
        await report("위키 인덱스를 읽는 중");
        return { type: "tool_result", tool_use_id: toolUse.id, content: await readWikiIndex() };
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
        return { type: "tool_result", tool_use_id: toolUse.id, content: await readWikiRaw(rawPath, startLine, endLine) };
      }
      return { type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify({ error: "지원하지 않는 도구" }), is_error: true };
    } catch {
      return { type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify({ error: "도구 입력 또는 문서를 확인할 수 없음" }), is_error: true };
    }
  }

  for (let turn = 0; turn < 8; turn += 1) {
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_SONNET_MODEL ?? "claude-sonnet-4-20250514",
      max_tokens: 2400,
      system: rules,
      tools,
      messages,
    });
    const toolUses = response.content.filter((block): block is Anthropic.Messages.ToolUseBlock => block.type === "tool_use");
    if (!toolUses.length) {
      const parsed = answerSchema.parse(parseJson(plainText(response.content)));
      if (parsed.evidence.some((item) => !consultedPages.has(item.pageId))) {
        throw new Error("답변 근거가 실제로 읽은 Wiki 문서와 일치하지 않습니다.");
      }
      const evidence = parsed.evidence.map((item) => ({ ...item, title: consultedPages.get(item.pageId)! }));
      return { id: randomUUID(), question, lens, ...parsed, evidence };
    }

    messages.push({ role: "assistant", content: response.content });
    const results = await Promise.all(toolUses.map(executeTool));
    messages.push({ role: "user", content: results });
  }

  throw new Error("도구 호출 한도를 초과했습니다.");
}
