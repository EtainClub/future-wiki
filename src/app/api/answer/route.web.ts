import { corsPreflight, withCors } from "@/lib/cors";
import { readStoredAnswer } from "@/lib/cache";

export const runtime = "nodejs";

/**
 * 공유 링크가 가리키는 답변의 읽기 통로.
 *
 * 공유된 링크는 이미 만들어진 답변을 다시 보여주는 것이므로 생성 경로(/api/ask)를
 * 거칠 이유가 없다. 여기는 모델을 호출하지 않고 사용량도 차감하지 않는다.
 */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const answer = await readStoredAnswer(id);
  if (!answer) return withCors(Response.json({ error: "NOT_FOUND" }, { status: 404 }));
  return withCors(Response.json({ answer }));
}

export function OPTIONS() {
  return corsPreflight();
}
