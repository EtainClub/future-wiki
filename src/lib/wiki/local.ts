import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { wikiFrontmatterSchema, type Lens, type WikiPage } from "./schema";

const ROOT = process.cwd();
const WIKI_ROOT = path.join(ROOT, "wiki");
const RAW_ROOT = path.join(ROOT, "raw");

async function walk(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  }));
  return nested.flat();
}

export async function listWikiPages(): Promise<WikiPage[]> {
  let files: string[] = [];
  try {
    files = (await walk(WIKI_ROOT)).filter((file) => file.endsWith(".md"));
  } catch {
    return [];
  }

  const pages = await Promise.all(files.map(async (file) => {
    const source = await fs.readFile(file, "utf8");
    const parsed = matter(source);
    const frontmatter = wikiFrontmatterSchema.parse(parsed.data);
    const slug = path.relative(WIKI_ROOT, file).replace(/\.md$/, "").split(path.sep).join("/");
    return { slug, body: parsed.content.trim(), frontmatter };
  }));

  return pages.sort((a, b) => a.frontmatter.title.localeCompare(b.frontmatter.title, "ko"));
}

export async function listRawFiles(): Promise<string[]> {
  try {
    const files = (await walk(RAW_ROOT)).filter((file) => /\.(md|txt)$/i.test(file) && !file.endsWith("_meta.yaml"));
    return files.map((file) => `raw/${path.relative(RAW_ROOT, file).split(path.sep).join("/")}`).sort();
  } catch {
    return [];
  }
}

export async function getWikiPage(slug: string): Promise<WikiPage | null> {
  const normalized = slug.replace(/^\/+|\/+$/g, "");
  if (!normalized || normalized.includes("..")) return null;
  const file = path.resolve(WIKI_ROOT, `${normalized}.md`);
  if (!file.startsWith(`${WIKI_ROOT}${path.sep}`)) return null;
  try {
    const source = await fs.readFile(file, "utf8");
    const parsed = matter(source);
    return {
      slug: normalized,
      body: parsed.content.trim(),
      frontmatter: wikiFrontmatterSchema.parse(parsed.data),
    };
  } catch {
    return null;
  }
}

export async function getIndex(): Promise<string> {
  return fs.readFile(path.join(ROOT, "index.md"), "utf8");
}

export async function readRaw(pathname: string, startLine = 1, endLine = startLine + 20): Promise<string> {
  const relative = pathname.replace(/^raw\//, "");
  if (!relative || relative.includes("..")) throw new Error("Invalid raw path");
  const file = path.resolve(RAW_ROOT, relative);
  if (!file.startsWith(`${RAW_ROOT}${path.sep}`)) throw new Error("Invalid raw path");
  const text = await fs.readFile(file, "utf8");
  const start = Number.isFinite(startLine) ? Math.max(1, Math.trunc(startLine)) : 1;
  const requestedEnd = Number.isFinite(endLine) ? Math.trunc(endLine) : start + 19;
  const end = Math.min(Math.max(start, requestedEnd), start + 199);
  return text.split("\n").slice(start - 1, end).join("\n");
}

export function pageAllowedForLens(page: WikiPage, lens: Lens): boolean {
  return lens === "all" || page.frontmatter.lens.includes(lens);
}

/** 검색 한 건. path는 raw 파일 경로, line은 1부터 센다. */
export type RawHit = { path: string; line: number; text: string; anchor: string };

/**
 * 검색어를 토큰으로 나눈다.
 *
 * 원문 코퍼스는 한문과 중세 프랑스어다. 한문은 한 글자가 한 낱말이라
 * 두 글자 이상만 남기는 규칙을 쓰면 革·師·兵 같은 핵심어가 통째로 버려진다.
 * 그래서 한자 덩어리는 길이와 무관하게 살리고, 한글·라틴 낱말만 두 글자 이상을 요구한다.
 */
export function searchTokens(query: string): string[] {
  const han = query.match(/\p{Script=Han}+/gu) ?? [];
  // 한문 원전에는 현대 한자어 복합어가 거의 없다. "貨幣"를 통째로 찾으면 0건이지만
  // 貨와 幣로 나누면 걸린다. 복합어를 낱자로도 풀어 넣어 검색이 빈손으로 끝나지 않게 한다.
  // 원형을 앞에 두어 점수(scanCorpus)에서 정확한 복합어가 낱자보다 앞서게 한다.
  const chars = han.flatMap((run) => (run.length > 1 ? [...run] : []));
  const words = (query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((token) => token.length > 1 && !/\p{Script=Han}/u.test(token));
  return [...new Set([...han, ...words, ...chars])].slice(0, 24);
}

/**
 * raw 원문 전체를 줄 단위로 훑어 토큰이 걸리는 줄을 돌려준다.
 *
 * 코퍼스가 1만 줄 미만이라 색인 없이 매 요청 스캔해도 되지만,
 * 같은 프로세스에서 반복 호출되므로 파일 내용은 모듈 캐시에 담는다.
 */
const rawCorpusCache = new Map<string, string[]>();

async function rawLines(file: string): Promise<string[]> {
  const cached = rawCorpusCache.get(file);
  if (cached) return cached;
  const lines = (await fs.readFile(path.join(ROOT, file), "utf8")).split("\n");
  rawCorpusCache.set(file, lines);
  return lines;
}

/**
 * 이미 메모리에 올라온 코퍼스를 훑는다. 로컬 파일과 Storage 사본이 같은 규칙을 쓰도록 분리했다.
 * 점수는 걸린 토큰 수이며, 같은 점수면 경로 순으로 안정 정렬한다.
 */
export function scanCorpus(corpus: Iterable<[string, string[]]>, tokens: string[], limit: number): RawHit[] {
  const hits: Array<{ hit: RawHit; score: number }> = [];
  for (const [file, lines] of corpus) {
    lines.forEach((text, index) => {
      const trimmed = text.trim();
      if (trimmed.length < 2) return;
      const haystack = trimmed.toLowerCase();
      // 글자 수로 가중한다. 貨幣가 통째로 걸린 줄이 貨·幣만 흩어져 걸린 줄보다 앞선다.
      const score = tokens.reduce((total, token) => (haystack.includes(token) ? total + token.length : total), 0);
      if (!score) return;
      const line = index + 1;
      hits.push({ score, hit: { path: file, line, text: trimmed.slice(0, 240), anchor: `${file}#L${line}` } });
    });
  }
  return hits.sort((a, b) => b.score - a.score || a.hit.path.localeCompare(b.hit.path)).slice(0, limit).map((entry) => entry.hit);
}

export async function searchRawLocal(query: string, limit = 24): Promise<RawHit[]> {
  const tokens = searchTokens(query);
  if (!tokens.length) return [];
  const files = await listRawFiles();
  const corpus: Array<[string, string[]]> = await Promise.all(files.map(async (file): Promise<[string, string[]]> => [file, await rawLines(file)]));
  return scanCorpus(corpus, tokens, limit);
}


/**
 * 출처별 안내문. `_meta.yaml`과 각 파일 머리의 주석 블록을 모은다.
 *
 * 원문 파일 머리에는 판본과 함께 "7 師 → L130" 같은 줄 색인이 들어 있다.
 * 이걸 먼저 보여 주면 한국어 질문으로는 걸리지 않는 한문 원문도
 * 괘 이름이나 象 번호로 곧장 read_raw까지 갈 수 있다.
 */
export function leadingComment(lines: string[]): string[] {
  // 파일 머리의 연속된 주석 블록만 판본·줄 색인을 담는다.
  // 본문 중간의 마크다운 제목까지 긁으면 안내문이 잡음으로 부풀어 오른다.
  const header: string[] = [];
  for (const line of lines.slice(0, 120)) {
    if (line.startsWith("#")) header.push(line);
    else if (line.trim()) break;
  }
  return header;
}

export async function sourceGuideLocal(): Promise<string> {
  const files = await listRawFiles();
  const byDirectory = new Map<string, string[]>();
  for (const file of files) {
    const directory = file.split("/").slice(0, 2).join("/");
    byDirectory.set(directory, [...(byDirectory.get(directory) ?? []), file]);
  }
  const sections = await Promise.all([...byDirectory].map(async ([directory, members]) => {
    const meta = await fs.readFile(path.join(ROOT, directory, "_meta.yaml"), "utf8").catch(() => "");
    const headers = await Promise.all(members.map(async (file) => {
      const lines = await rawLines(file);
      const header = leadingComment(lines);
      return `### ${file} (${lines.length}줄)\n${header.join("\n") || "(머리 주석 없음)"}`;
    }));
    return `## ${directory}\n${meta.trim()}\n\n${headers.join("\n\n")}`;
  }));
  return sections.join("\n\n");
}
