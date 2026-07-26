import { getAdminServices } from "../firebase/admin";
import { getIndex as getLocalIndex, getWikiPage, listWikiPages, pageAllowedForLens, readRaw as readLocalRaw } from "./local";
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
