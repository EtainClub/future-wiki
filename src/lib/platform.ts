/**
 * 빌드 대상 구분. 런타임 감지가 아니라 빌드 시점에 박히는 상수다.
 *
 * 앱인토스 번들은 토스 웹뷰 안에서만 실행되므로 감지할 것이 없고,
 * 감지 대신 상수를 쓰면 웹 번들에서 토스 전용 코드가 통째로 사라진다.
 */
export const IS_TOSS_APP = process.env.NEXT_PUBLIC_TOSS_APP === "1";

/** 정적 번들에는 서버가 없으므로 API 호출은 배포된 App Hosting 오리진으로 나간다. */
const DEFAULT_API_BASE = "https://future-wiki--future-wiki.asia-east1.hosted.app";
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE).replace(/\/+$/, "");

export function apiUrl(path: string): string {
  return IS_TOSS_APP ? `${API_BASE}${path}` : path;
}

/**
 * 위키 문서 링크. 웹은 `/wiki/<id>`로 서버 렌더링하지만,
 * 정적 내보내기에는 미리 알 수 없는 동적 경로를 만들 수 없어 쿼리로 넘긴다.
 */
export function wikiHref(pageId: string): string {
  return IS_TOSS_APP ? `/wiki/view/?id=${encodeURIComponent(pageId)}` : `/wiki/${pageId}`;
}

/** 답변 링크. wikiHref와 같은 이유로 토스 빌드에서는 id도 쿼리로 넘긴다. */
export function questionHref(id: string, question: string, lens: string): string {
  const query = `question=${encodeURIComponent(question)}&lens=${lens}`;
  return IS_TOSS_APP ? `/q/?id=${encodeURIComponent(id)}&${query}` : `/q/${id}?${query}`;
}
