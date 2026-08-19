import { getAdminServices } from "../firebase/admin";
import { getIndex as getLocalIndex, getWikiPage, listWikiPages, pageAllowedForLens, readRaw as readLocalRaw, scanCorpus, searchRawLocal, searchTokens, leadingComment, sourceGuideLocal, type RawHit } from "./local";
import { wikiFrontmatterSchema, type Lens, type WikiPage } from "./schema";

function parseSnapshotPage(data: unknown): WikiPage | null {
  if (!data || typeof data !== "object") return null;
  const value = data as Record<string, unknown>;
  const frontmatter = wikiFrontmatterSchema.safeParse(value.frontmatter);
  if (!frontmatter.success || typeof value.slug !== "string" || typeof value.body !== "string") return null;
  return { slug: value.slug, body: value.body, frontmatter: frontmatter.data };
}

function sortPages(pages: WikiPage[]): WikiPage[] {
  return pages.sort((a, b) => a.frontmatter.title.localeCompare(b.frontmatter.title, "ko"));
}

export async function listRepositoryPages(): Promise<WikiPage[]> {
  const services = getAdminServices();
  if (!services) return listWikiPages();
  const snapshot = await services.db.collection("wiki_snapshot").get();
  return sortPages(snapshot.docs.map((doc) => parseSnapshotPage(doc.data())).filter((page): page is WikiPage => page !== null));
}

export async function getRepositoryPage(slugOrId: string): Promise<WikiPage | null> {
  const normalized = slugOrId.replace(/^\/+|\/+$/g, "");
  if (!normalized || normalized.includes("..")) return null;
  const services = getAdminServices();
  if (!services) {
    const pages = await listWikiPages();
    return pages.find((page) => page.slug === normalized || page.frontmatter.id === normalized || page.frontmatter.id === normalized.split("/").at(-1)) ?? await getWikiPage(normalized);
  }

  const direct = await services.db.collection("wiki_snapshot").doc(normalized.split("/").at(-1)!).get();
  if (direct.exists) return parseSnapshotPage(direct.data());
  const bySlug = await services.db.collection("wiki_snapshot").where("slug", "==", normalized).limit(1).get();
  return bySlug.empty ? null : parseSnapshotPage(bySlug.docs[0].data());
}

export async function readWikiIndex(): Promise<string> {
  const services = getAdminServices();
  if (!services) return getLocalIndex();
  const snapshot = await services.db.collection("meta").doc("snapshot").get();
  return String(snapshot.data()?.index ?? "# 인덱스가 아직 동기화되지 않았습니다.");
}

export async function readWikiPage(pageId: string, lens: Lens): Promise<WikiPage | { denied: true } | null> {
  const page = await getRepositoryPage(pageId);
  if (!page) return null;
  if (!pageAllowedForLens(page, lens)) return { denied: true };
  return page;
}

function rawRange(rawPath: string, startLine: number, endLine: number) {
  if (!rawPath.startsWith("raw/")) throw new Error("Invalid raw path");
  const safePath = rawPath.slice(4);
  if (!safePath || safePath.includes("..")) throw new Error("Invalid raw path");
  const start = Number.isFinite(startLine) ? Math.max(1, Math.trunc(startLine)) : 1;
  const requestedEnd = Number.isFinite(endLine) ? Math.trunc(endLine) : start + 19;
  const end = Math.min(Math.max(start, requestedEnd), start + 199);
  return { safePath, start, end };
}

export async function readWikiRaw(rawPath: string, startLine: number, endLine: number): Promise<string> {
  const { safePath, start, end } = rawRange(rawPath, startLine, endLine);
  const services = getAdminServices();
  if (!services) return readLocalRaw(`raw/${safePath}`, start, end);
  const [buffer] = await services.storage.bucket().file(`raw/${safePath}`).download();
  return buffer.toString("utf8").split("\n").slice(start - 1, end).join("\n");
}

/** 위키 검색 한 건. LLM이 pageId를 알아내는 통로다. */
export type PageHit = { pageId: string; title: string; description: string; lens: string[]; snippet: string };

function snippetAround(body: string, tokens: string[]): string {
  const lines = body.split("\n").map((line) => line.trim()).filter((line) => line.length > 1);
  const best = lines.find((line) => tokens.some((token) => line.toLowerCase().includes(token)));
  return (best ?? lines[0] ?? "").slice(0, 200);
}

/**
 * 질문 토큰으로 위키 페이지를 훑는다.
 *
 * 인덱스 설명만 보면 얇은 위키에서는 "관련 문서 없음"으로 끝나기 쉬우므로
 * 본문까지 훑어 부분적으로라도 걸리는 페이지를 후보로 남긴다.
 */
export async function searchWikiPages(query: string, lens: Lens, limit = 8): Promise<PageHit[]> {
  const tokens = searchTokens(query);
  const pages = (await listRepositoryPages()).filter((page) => pageAllowedForLens(page, lens));
  if (!tokens.length) return pages.slice(0, limit).map((page) => ({ pageId: page.frontmatter.id, title: page.frontmatter.title, description: page.frontmatter.description, lens: [...page.frontmatter.lens], snippet: snippetAround(page.body, tokens) }));
  const scored = pages.map((page) => {
    const heading = `${page.frontmatter.title} ${page.frontmatter.description}`.toLowerCase();
    const body = page.body.toLowerCase();
    // 제목·설명에 걸리면 본문 언급보다 강하게 잡는다.
    const score = tokens.reduce((total, token) => total + (heading.includes(token) ? 3 : 0) + (body.includes(token) ? 1 : 0), 0);
    return { page, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  // 걸리는 페이지가 없어도 빈손으로 돌려보내지 않는다. 렌즈 안에서 읽을 수 있는 문서는 알려준다.
  const chosen = (scored.length ? scored.map((item) => item.page) : pages).slice(0, limit);
  return chosen.map((page) => ({ pageId: page.frontmatter.id, title: page.frontmatter.title, description: page.frontmatter.description, lens: [...page.frontmatter.lens], snippet: snippetAround(page.body, tokens) }));
}

const storageCorpus = new Map<string, string[]>();

/** Storage 모드에서 raw 코퍼스를 한 번 내려받아 프로세스 수명 동안 재사용한다. */
async function storageRawFiles(): Promise<Map<string, string[]>> {
  if (storageCorpus.size) return storageCorpus;
  const services = getAdminServices();
  if (!services) return storageCorpus;
  const [files] = await services.storage.bucket().getFiles({ prefix: "raw/" });
  const readable = files.filter((file) => /\.(md|txt)$/i.test(file.name) && !file.name.endsWith("_meta.yaml"));
  await Promise.all(readable.map(async (file) => {
    const [buffer] = await file.download();
    storageCorpus.set(file.name, buffer.toString("utf8").split("\n"));
  }));
  return storageCorpus;
}

export async function searchWikiRaw(query: string, limit = 24): Promise<RawHit[]> {
  const services = getAdminServices();
  if (!services) return searchRawLocal(query, limit);
  const tokens = searchTokens(query);
  if (!tokens.length) return [];
  return scanCorpus(await storageRawFiles(), tokens, limit);
}

/** 출처 안내문. 로컬은 파일에서, 배포 환경은 Storage 코퍼스에서 같은 형태로 만든다. */
export async function readSourceGuide(): Promise<string> {
  const services = getAdminServices();
  if (!services) return sourceGuideLocal();
  const corpus = await storageRawFiles();
  const [metaFiles] = await services.storage.bucket().getFiles({ prefix: "raw/" });
  const metas = new Map<string, string>();
  await Promise.all(metaFiles.filter((file) => file.name.endsWith("_meta.yaml")).map(async (file) => {
    const [buffer] = await file.download();
    metas.set(file.name.split("/").slice(0, 2).join("/"), buffer.toString("utf8").trim());
  }));
  const byDirectory = new Map<string, string[]>();
  for (const file of corpus.keys()) {
    const directory = file.split("/").slice(0, 2).join("/");
    byDirectory.set(directory, [...(byDirectory.get(directory) ?? []), file]);
  }
  return [...byDirectory].map(([directory, members]) => {
    const headers = members.map((file) => {
      const lines = corpus.get(file) ?? [];
      const header = leadingComment(lines);
      return `### ${file} (${lines.length}줄)\n${header.join("\n") || "(머리 주석 없음)"}`;
    });
    return `## ${directory}\n${metas.get(directory) ?? ""}\n\n${headers.join("\n\n")}`;
  }).join("\n\n");
}
