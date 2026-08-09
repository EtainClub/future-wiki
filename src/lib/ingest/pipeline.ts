import "server-only";

import { createHash, randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { FieldValue } from "firebase-admin/firestore";
import matter from "gray-matter";
import { extractText } from "unpdf";
import { z } from "zod";
import { getAdminServices } from "../firebase/admin";
import { getInstallationOctokit, githubRepository } from "../github/client";
import { readWikiIndex } from "../wiki/repository";
import { prophetLensIds } from "../wiki/lenses";
import { pageTypes, wikiFrontmatterSchema } from "../wiki/schema";

/**
 * 초안에 담을 예언 기록 필드.
 *
 * recorded / targetPeriod 만 모델이 채운다. actualEvent·verdict·interpreted* 는
 * 원문이 아니라 후대 해석사에 관한 주장이라 raw/ 에 앵커할 근거가 없다.
 * 모델이 기억으로 채우면 이 프로젝트가 폭로하려는 "사후 귀속"을 도구가 저지르는 셈이므로
 * 사람이 검토 단계에서 채우도록 비워 둔다.
 */
const draftProphecySchema = z.object({
  // 저자가 예언을 기록한 시점. 업로드 파일이 근대 교정본이면 인제스트는 이를 알 수 없으므로
  // null을 허용하고 사람이 채운다. 판본 연도를 여기에 넣으면 기록 시점이 왜곡된다.
  recorded: z.string().nullable().default(null),
  targetPeriod: z.string().nullable().default(null),
});

const draftSchema = z.object({
  pages: z.array(z.object({
    type: z.enum(pageTypes),
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string(),
    description: z.string(),
    lens: z.array(z.enum(prophetLensIds)).min(1),
    confidence: z.enum(["high", "medium", "low"]),
    body: z.string(),
    // 모델이 prediction이 아닌 페이지에 null을 넣는 경우가 있어 null도 받는다.
    prophecy: draftProphecySchema.nullish(),
  })).min(1).max(8),
  summary: z.string(),
});

type SourceInput = {
  file: File;
  title: string;
  sourceId: string;
  copyright: "full" | "excerpt";
  createdBy: string;
};

function safeName(name: string): string {
  const extension = name.toLowerCase().match(/\.(md|txt|pdf)$/)?.[1] ?? "txt";
  const sourceStem = name.replace(/\.[^.]+$/, "").normalize("NFKD").toLowerCase();
  const stem = sourceStem.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "source";
  const fingerprint = createHash("sha256").update(name).digest("hex").slice(0, 8);
  return `${stem}-${fingerprint}.${extension}`;
}

async function sourceText(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const result = await extractText(buffer, { mergePages: true });
    return String(result.text);
  }
  return new TextDecoder().decode(buffer);
}

type DraftPage = z.infer<typeof draftSchema>["pages"][number];

type SourceChunk = { text: string; startLine: number; endLine: number };

function sourceChunks(text: string, maxCharacters = 40_000): SourceChunk[] {
  const lines = text.split("\n");
  const chunks: SourceChunk[] = [];
  let current: string[] = [];
  let currentCharacters = 0;
  let startLine = 1;
  for (const [index, line] of lines.entries()) {
    if (current.length && currentCharacters + line.length + 1 > maxCharacters) {
      chunks.push({ text: current.join("\n"), startLine, endLine: index });
      current = [];
      currentCharacters = 0;
      startLine = index + 1;
    }
    current.push(line);
    currentCharacters += line.length + (current.length > 1 ? 1 : 0);
  }
  if (current.length) chunks.push({ text: current.join("\n"), startLine, endLine: lines.length });
  return chunks;
}

/**
 * 파일 상단의 `#` 주석 블록은 우리가 붙인 메타데이터이지 원문이 아니다.
 * 여기를 인용하면 판본 정보나 파일 포맷 설명이 예언 원문처럼 인용된다.
 */
function metadataLineCount(text: string): number {
  let count = 0;
  for (const line of text.split("\n")) {
    if (line.startsWith("#") || line.trim() === "") count += 1;
    else break;
  }
  return count;
}

function validateChunkAnchors(draft: z.infer<typeof draftSchema>, rawPath: string, chunk: SourceChunk, metadataLines: number): void {
  const escapedPath = rawPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const anchorPattern = new RegExp(`\\[src: ${escapedPath}#L(\\d+)(?:-L(\\d+))?\\]`, "g");
  for (const page of draft.pages) {
    const anchors = [...page.body.matchAll(anchorPattern)];
    // 어느 페이지가 문제인지 알아야 검토자가 고칠 수 있다.
    if (!anchors.length) throw new Error(`DRAFT_MISSING_SOURCE_ANCHOR: ${page.type}/${page.id}`);
    const outOfRange = anchors.find((match) => Number(match[1]) < chunk.startLine || Number(match[2] ?? match[1]) > chunk.endLine);
    if (outOfRange) {
      throw new Error(`DRAFT_SOURCE_ANCHOR_OUT_OF_RANGE: ${page.type}/${page.id} -> ${outOfRange[0]} (허용 ${chunk.startLine}-${chunk.endLine})`);
    }
    // 앵커 범위가 통째로 메타데이터 안에 있으면 원문을 인용한 것이 아니다.
    const citesMetadata = anchors.find((match) => Number(match[2] ?? match[1]) <= metadataLines);
    if (citesMetadata) {
      throw new Error(`DRAFT_ANCHOR_CITES_METADATA: ${page.type}/${page.id} -> ${citesMetadata[0]} (1-${metadataLines}행은 메타데이터)`);
    }
  }
}

function mergeDrafts(results: Array<z.infer<typeof draftSchema>>): z.infer<typeof draftSchema> {
  const pages = new Map<string, DraftPage>();
  const confidenceRank = { low: 0, medium: 1, high: 2 } as const;
  for (const result of results) {
    for (const page of result.pages) {
      const current = pages.get(page.id);
      if (!current) {
        pages.set(page.id, page);
        continue;
      }
      pages.set(page.id, {
        ...current,
        lens: [...new Set([...current.lens, ...page.lens])],
        confidence: confidenceRank[page.confidence] > confidenceRank[current.confidence] ? page.confidence : current.confidence,
        body: `${current.body.trim()}\n\n${page.body.trim()}`,
        prophecy: current.prophecy ?? page.prophecy,
      });
    }
  }
  return draftSchema.parse({
    summary: results.map((result) => result.summary).join(" "),
    pages: [...pages.values()].slice(0, 8),
  });
}

async function draftPages(text: string, input: SourceInput, rawPath: string) {
  const lineCount = text.split("\n").length;
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      summary: "로컬 검토용 초안 1건을 만들었습니다.",
      pages: [{
        type: "topic" as const,
        id: `${input.sourceId}-overview`,
        title: input.title,
        description: `${input.title} 원문에서 추출한 검토 대기 개요`,
        lens: ["iching" as const],
        confidence: "low" as const,
        body: `## 원문 개요\n\n업로드된 자료에서 검토할 핵심 내용을 정리하는 초안입니다. [src: ${rawPath}#L1-L${lineCount}]\n\n> ⚠ 가정: Anthropic API가 연결되지 않아 자동 분석 대신 안전한 검토 대기 초안을 생성했습니다.`,
      }],
    };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const index = await readWikiIndex();
  const results: Array<z.infer<typeof draftSchema>> = [];
  const metadataLines = metadataLineCount(text);
  for (const chunk of sourceChunks(text)) {
    const numberedText = chunk.text.split("\n").map((line, index) => `${chunk.startLine + index}: ${line}`).join("\n");
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_SONNET_MODEL ?? "claude-sonnet-5",
      // adaptive thinking이 max_tokens를 함께 쓰므로 초안 JSON이 잘리지 않도록 여유를 둔다.
      max_tokens: 16000,
      output_config: { effort: "medium" },
      system: `당신은 근거 중심 Wiki 편집자다. 원문에서 인물·원리·예측·대상·주제를 추출하고 기존 인덱스와 대조해 신규 페이지 또는 기존 pageId 보강 초안을 만든다. 추론은 반드시 > ⚠ 가정: 블록에만 쓴다. JSON만 반환: {summary,pages:[{type,id,title,description,lens,confidence,body,prophecy?}]}. 이 청크에서 허용되는 line 범위는 ${chunk.startLine}-${chunk.endLine}이다.\nbody 작성 규칙: 사실 문장은 한 줄에 하나씩 쓰고, 그 줄은 반드시 [src: ${rawPath}#Lx-Ly] 앵커로 끝낸다. 한 줄에 문장을 여러 개 이어 쓰거나 앵커 뒤에 다른 문장을 붙이지 마라.\n인용 금지 구간: 1-${metadataLines}행은 파일 상단의 메타데이터 주석이며 원문이 아니다. 판본·파일 구조 설명을 원문처럼 인용하지 마라.\n필드 타입을 정확히 지켜라. pages는 1~8개 배열이다.\n- type: ${pageTypes.map((value) => JSON.stringify(value)).join(" | ")} 중 하나(문자열)\n- id: 소문자·숫자·하이픈만 쓰는 kebab-case 문자열 (예: "water-food")\n- title, description, body: 문자열\n- lens: 반드시 배열이다. [${prophetLensIds.map((value) => JSON.stringify(value)).join(" | ")}] 중 최소 1개. 문자열 하나만 쓰지 말고 ["iching"]처럼 배열로 감싸라.\n- confidence: "high" | "medium" | "low" 중 하나(문자열)\n- summary: 문자열\n\n예언 기록(type: "prediction")은 선별해서 만든다. 원문 전체를 훑어 페이지를 만들지 말고, 시점·대상·사건이 텍스트 안에서 비교적 특정되는 대목만 골라 최대 4건까지 만든다. 나머지는 원문으로만 두고 페이지를 만들지 않는다.\ntype이 "prediction"인 페이지에는 prophecy 객체를 넣는다:\n- prophecy.recorded: 저자가 이 예언을 기록한 시점. 원문 본문에 명시된 경우에만 쓴다. 업로드된 파일이 후대 교정본이면 그 판본 연도는 기록 시점이 아니므로 절대 쓰지 말고 null을 넣는다.\n- prophecy.targetPeriod: 예언이 가리키는 시기. 원문에 연도·기간이 명시된 경우에만 쓰고, 없으면 null.\nprophecy에 다른 키를 넣지 마라. 실제 사건 대응·적중 여부·후대 해석 존재 여부는 원문에 없는 정보이므로 절대 추측해서 쓰지 않는다. 그 판단은 사람이 검토 단계에서 채운다.`,
      messages: [{ role: "user", content: `기존 인덱스:\n${index}\n\n출처: ${input.title}\n원문 전체 범위: 1-${lineCount}\n현재 청크: ${chunk.startLine}-${chunk.endLine}\n각 행 앞의 숫자는 실제 원문 줄 번호이며 인용 앵커에 그대로 사용해야 한다.\n\n${numberedText}` }],
    });
    const raw = response.content.filter((block): block is Anthropic.Messages.TextBlock => block.type === "text").map((block) => block.text).join("\n");
    const json = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw;
    const parsed = draftSchema.parse(JSON.parse(json));
    validateChunkAnchors(parsed, rawPath, chunk, metadataLines);
    results.push(parsed);
  }
  return mergeDrafts(results);
}

function wikiPath(page: z.infer<typeof draftSchema>["pages"][number]): string {
  const folders = { prophet: "prophets", principle: "principles", prediction: "predictions", entity: "entities", topic: "topics", synthesis: "syntheses" } as const;
  return `wiki/${folders[page.type]}/${page.id}.md`;
}

function existingWikiPath(indexContent: string, pageId: string): string | null {
  return indexContent.match(new RegExp(`\\((wiki/[^)]+/${pageId}\\.md)\\)`))?.[1] ?? null;
}

function wikiContent(page: DraftPage, rawPath: string, lineCount: number, existingSource?: string): string {
  const today = new Date().toISOString().slice(0, 10);
  let type = page.type;
  let title = page.title;
  let description = page.description;
  let lens = page.lens;
  let sources = [`${rawPath}#L1-L${lineCount}`];
  let confidence = page.confidence;
  let body = page.body.trim();
  if (existingSource) {
    const existing = matter(existingSource);
    const metadata = wikiFrontmatterSchema.parse(existing.data);
    const confidenceRank = { low: 0, medium: 1, high: 2 } as const;
    type = metadata.type;
    title = metadata.title;
    description = metadata.description;
    lens = [...new Set([...metadata.lens, ...page.lens])];
    sources = [...new Set([...metadata.sources, ...sources])];
    confidence = confidenceRank[metadata.confidence] > confidenceRank[page.confidence] ? metadata.confidence : page.confidence;
    body = `${existing.content.trim()}\n\n## ${today} 인제스트 보강\n\n${body}`;
  }
  // 검증 필드는 원문에서 확인되는 것만 채우고, 해석사에 속하는 값은 사람이 채우도록 비워 둔다.
  const prophecyBlock = page.prophecy
    ? `prophecy:\n  recorded: ${page.prophecy.recorded === null || page.prophecy.recorded === undefined ? "null" : JSON.stringify(page.prophecy.recorded)}\n  targetPeriod: ${page.prophecy.targetPeriod === null || page.prophecy.targetPeriod === undefined ? "null" : JSON.stringify(page.prophecy.targetPeriod)}\n  actualEvent: null\n  interpretedBefore: false\n  interpretedAfter: false\n  verdict: unresolved\n`
    : "";
  return `---\ntype: ${type}\nid: ${page.id}\ntitle: ${JSON.stringify(title)}\ndescription: ${JSON.stringify(description)}\nlens: [${lens.join(", ")}]\nsources: [${sources.join(", ")}]\nconfidence: ${confidence}\nupdated: ${today}\n${prophecyBlock}---\n\n${body}\n`;
}

async function createPullRequest(rawPath: string, text: string, draft: Awaited<ReturnType<typeof draftPages>>, input: SourceInput) {
  const octokit = await getInstallationOctokit();
  const { owner, repo } = githubRepository();
  const main = await octokit.request("GET /repos/{owner}/{repo}/git/ref/{ref}", { owner, repo, ref: "heads/main" });
  const branch = `ingest/${Date.now()}-${randomUUID().slice(0, 8)}`;
  await octokit.request("POST /repos/{owner}/{repo}/git/refs", { owner, repo, ref: `refs/heads/${branch}`, sha: main.data.object.sha });

  const indexResponse = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", { owner, repo, path: "index.md", ref: branch });
  if (Array.isArray(indexResponse.data) || indexResponse.data.type !== "file" || !("content" in indexResponse.data)) throw new Error("INDEX_NOT_A_FILE");
  let indexContent = Buffer.from(indexResponse.data.content, "base64").toString("utf8").trimEnd();
  const pagePaths = new Map(draft.pages.map((page) => [page.id, existingWikiPath(indexContent, page.id) ?? wikiPath(page)]));
  for (const page of draft.pages) {
    const filePath = pagePaths.get(page.id)!;
    const entry = `- [${page.title}](${filePath}) — ${page.description}`;
    if (!indexContent.includes(`(${filePath})`)) indexContent += `\n${entry}`;
  }
  indexContent += "\n";

  const lineCount = text.split("\n").length;
  async function existingFile(filePath: string): Promise<{ sha: string; source: string } | null> {
    try {
      const response = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", { owner, repo, path: filePath, ref: branch });
      if (Array.isArray(response.data) || response.data.type !== "file" || !("content" in response.data)) return null;
      return { sha: response.data.sha, source: Buffer.from(response.data.content, "base64").toString("utf8") };
    } catch (error) {
      if ((error as { status?: number }).status === 404) return null;
      throw error;
    }
  }

  const metaPath = rawPath.replace(/\/[^/]+$/, "/_meta.yaml");
  const collected = new Date().toISOString();
  // 키는 rawMetaSchema(snake_case)를 따른다. camelCase로 쓰면 validate:wiki가 실패해 CI가 막힌다.
  // 출처 성격 필드(lens/method/record_reliability/canonical_edition)는 사람이 검토 단계에서 채운다.
  const metaContent = [
    `source_id: ${input.sourceId}`,
    `title: ${JSON.stringify(input.title)}`,
    `copyright: ${input.copyright}`,
    `collected_at: ${collected}`,
    `review_status: needs-source-metadata`,
    `notice: ${JSON.stringify(`원본 파일명 ${input.file.name}. 인제스트가 생성했으며 lens·method·record_reliability·canonical_edition을 사람이 채워야 한다.`)}`,
    "",
  ].join("\n");
  const [existingRaw, existingMeta, wikiFiles] = await Promise.all([
    existingFile(rawPath),
    existingFile(metaPath),
    Promise.all(draft.pages.map(async (page) => {
      const filePath = pagePaths.get(page.id)!;
      const existing = await existingFile(filePath);
      return { path: filePath, content: wikiContent(page, rawPath, lineCount, existing?.source), sha: existing?.sha };
    })),
  ]);
  const files: Array<{ path: string; content: string; sha?: string }> = [
    { path: rawPath, content: text, sha: existingRaw?.sha },
    { path: metaPath, content: metaContent, sha: existingMeta?.sha },
    ...wikiFiles,
    { path: "index.md", content: indexContent, sha: indexResponse.data.sha },
  ];
  for (const file of files) {
    await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path: file.path,
      branch,
      message: `ingest: ${file.path}`,
      content: Buffer.from(file.content).toString("base64"),
      ...(file.sha ? { sha: file.sha } : {}),
    });
  }

  const pull = await octokit.request("POST /repos/{owner}/{repo}/pulls", {
    owner,
    repo,
    head: branch,
    base: "main",
    title: `원문 인제스트: ${draft.summary}`,
    body: `## 변경 요약\n\n${draft.summary}\n\n## 검토 체크리스트\n\n- [ ] 모든 주장에 실제 raw 줄 앵커가 연결되어 있음\n- [ ] 추론은 ⚠ 가정 블록으로 분리됨\n- [ ] 저작권 범위가 메타데이터와 일치함\n- [ ] index.md 등록을 검토함`,
  });
  return { number: pull.data.number, url: pull.data.html_url };
}

export async function ingestSource(input: SourceInput) {
  const text = await sourceText(input.file);
  if (text.trim().length < 20) throw new Error("SOURCE_TOO_SHORT");
  const fileName = safeName(input.file.name).replace(/\.pdf$/i, ".txt");
  const rawPath = `raw/${input.sourceId}/${fileName}`;
  const storagePath = `sources/${input.sourceId}/${Date.now()}-${safeName(input.file.name)}`;
  const services = getAdminServices();
  if (services) {
    await services.storage.bucket().file(storagePath).save(Buffer.from(await input.file.arrayBuffer()), { contentType: input.file.type });
    await services.db.collection("sources_meta").doc(input.sourceId).set({
      title: input.title,
      copyright: input.copyright,
      storagePath,
      rawPath,
      createdBy: input.createdBy,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  const draft = await draftPages(text, input, rawPath);
  if (!process.env.GITHUB_APP_ID) return { mode: "preview" as const, rawPath, draft };
  const pullRequest = await createPullRequest(rawPath, text, draft, input);
  if (services) {
    await services.db.collection("review_queue").doc(String(pullRequest.number)).set({
      sourcePath: rawPath,
      status: "open",
      summary: draft.summary,
      createdBy: input.createdBy,
      url: pullRequest.url,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  return { mode: "pull_request" as const, rawPath, draft, pullRequest };
}
