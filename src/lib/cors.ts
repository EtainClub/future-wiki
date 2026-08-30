/**
 * 토스 웹뷰는 로컬 번들을 실행하므로 Origin이 배포 도메인과 다르다(대개 null).
 * 공개 읽기 엔드포인트와 /api/ask는 쿠키를 쓰지 않으므로 와일드카드로 연다.
 * 쿠키를 쓰는 관리자 엔드포인트에는 절대 붙이지 않는다.
 */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-device-id, x-firebase-appcheck",
  "Access-Control-Max-Age": "86400",
};

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function withCors(response: Response): Response {
  for (const [key, value] of Object.entries(CORS_HEADERS)) response.headers.set(key, value);
  return response;
}
