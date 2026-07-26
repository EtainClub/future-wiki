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
