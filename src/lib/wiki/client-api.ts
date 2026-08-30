import { apiUrl } from "@/lib/platform";
import { wikiFrontmatterSchema, type WikiPage } from "./schema";

/** 목록에는 본문이 없다. 카드 렌더링에 필요한 만큼만 내려온다. */
export type WikiSummary = Pick<WikiPage, "slug" | "frontmatter">;

function parseSummary(value: unknown): WikiSummary | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  const frontmatter = wikiFrontmatterSchema.safeParse(entry.frontmatter);
  if (!frontmatter.success || typeof entry.slug !== "string") return null;
  return { slug: entry.slug, frontmatter: frontmatter.data };
}

export async function fetchWikiSummaries(signal?: AbortSignal): Promise<WikiSummary[]> {
  const response = await fetch(apiUrl("/api/wiki"), { signal });
  if (!response.ok) throw new Error("위키 목록을 불러오지 못했습니다.");
  const data = (await response.json()) as { pages?: unknown[] };
  return (data.pages ?? []).map(parseSummary).filter((page): page is WikiSummary => page !== null);
}

export async function fetchWikiPage(id: string, signal?: AbortSignal): Promise<{ page: WikiPage; repository: string | null } | null> {
  const response = await fetch(apiUrl(`/api/wiki?id=${encodeURIComponent(id)}`), { signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("문서를 불러오지 못했습니다.");
  const data = (await response.json()) as { page?: unknown; repository?: string | null };
  const raw = data.page as Record<string, unknown> | undefined;
  const frontmatter = wikiFrontmatterSchema.safeParse(raw?.frontmatter);
  if (!frontmatter.success || typeof raw?.slug !== "string" || typeof raw?.body !== "string") return null;
  return { page: { slug: raw.slug, body: raw.body, frontmatter: frontmatter.data }, repository: data.repository ?? null };
}
