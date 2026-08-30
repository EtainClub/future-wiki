import { corsPreflight, withCors } from "@/lib/cors";
import { getRepositoryPage, listRepositoryPages } from "@/lib/wiki/repository";

export const runtime = "nodejs";

/**
 * 위키 본문의 공개 읽기 통로. 앱인토스 정적 번들에는 서버가 없으므로
 * 웹에서 서버 컴포넌트가 직접 읽던 내용을 같은 형태의 JSON으로 내보낸다.
 *
 * `?id=`가 있으면 문서 하나(본문 포함), 없으면 목록(본문 제외)을 돌려준다.
 * 이미 공개 렌더링되는 내용이라 인증을 요구하지 않는다.
 */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    const page = await getRepositoryPage(id);
    if (!page) return withCors(Response.json({ error: "NOT_FOUND" }, { status: 404 }));
    return withCors(Response.json({ page, repository: process.env.GITHUB_REPOSITORY ?? null }));
  }
  const pages = await listRepositoryPages();
  return withCors(Response.json({ pages: pages.map(({ slug, frontmatter }) => ({ slug, frontmatter })) }));
}

export function OPTIONS() {
  return corsPreflight();
}
