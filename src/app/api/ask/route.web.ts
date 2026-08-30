import { z } from "zod";
import { after } from "next/server";
import { answerCacheKey, currentWikiSha, readCachedAnswer, readStoredAnswer, writeCachedAnswer, writeStoredAnswer } from "@/lib/cache";
import { normalizeQuestion, runAnswer } from "@/lib/llm/answer";
import { corsPreflight, withCors } from "@/lib/cors";
import { enforceRateLimit, verifyClientAttestation } from "@/lib/security";
import { lensSchema, type AnswerPayload } from "@/lib/wiki/schema";

export const runtime = "nodejs";
// 유추 답변은 원전 항해·재검색·본문 확인까지 도구를 여러 번 오간다.
// 60초에서는 검색이 한 번만 빗나가도 끊겼다. Cloud Run 기본 요청 한도(300초) 안이다.
export const maxDuration = 120;

const requestSchema = z.object({
  // 클라이언트가 만든 공유 id. 답변을 이 id로 저장해 같은 링크 재방문이 공짜가 되게 한다.
  id: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  question: z.string().trim().min(4).max(500),
  lens: lensSchema.default("all"),
});

function sse(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** 이미 만들어진 답변을 그대로 흘려보낸다. 모델 호출이 한 번도 일어나지 않는다. */
function replayStream(answer: AnswerPayload): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(sse("status", { message: "저장된 답변을 불러왔습니다" }));
      controller.enqueue(sse("answer", answer));
      controller.enqueue(sse("done", { cached: true }));
      controller.close();
    },
  });
  return withCors(new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  }));
}

export async function POST(request: Request) {
  try {
    await verifyClientAttestation(request);
    const input = requestSchema.parse(await request.json());

    // 공유 링크 재방문. 정규화도 사용량 차감도 하기 전에 끝낸다.
    // 여기서 걸러야 링크를 열 때마다 답변을 다시 만드는 일이 없다.
    const stored = await readStoredAnswer(input.id);
    if (stored) return replayStream(stored);

    const rate = await enforceRateLimit(request);
    let deferredWrite: (() => Promise<void>) | null = null;
    after(async () => {
      if (!deferredWrite) return;
      try {
        await deferredWrite();
      } catch (error) {
        console.error("Failed to persist answer cache", error);
      }
    });

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (event: string, data: unknown) => controller.enqueue(sse(event, data));
        try {
          emit("status", { message: "질문의 의미를 정리하는 중", rateRemaining: rate.remaining });
          const wikiSha = await currentWikiSha();

          // 정규화는 그 자체로 모델 호출이다. 같은 문장을 그대로 물은 경우는
          // 정규화 전에 원문 질문 키로 먼저 걸러 호출을 아낀다.
          const rawKey = answerCacheKey(input.question.replace(/\s+/g, " "), input.lens, wikiSha);
          const rawHit = await readCachedAnswer(rawKey);
          const normalized = rawHit ? null : await normalizeQuestion(input.question, input.lens);
          const key = normalized ? answerCacheKey(normalized.normalized, input.lens, wikiSha) : rawKey;
          const cached = rawHit ?? (await readCachedAnswer(key));

          if (cached) {
            emit("status", { message: "같은 질문의 검증된 답변을 찾았습니다" });
            // 캐시에서 왔더라도 이 공유 id로 저장해 둔다. 다음 클릭은 조회 한 번으로 끝난다.
            const answer = { ...cached, id: input.id };
            deferredWrite = () => writeStoredAnswer(answer);
            emit("answer", answer);
            emit("done", { cached: true });
            return;
          }

          // id는 클라이언트가 만든 공유 id로 고정한다. 링크와 저장된 답변이 같은 키를 쓴다.
          const generated = await runAnswer(input.question, input.lens, normalized!, (message) => emit("status", { message }));
          const answer = { ...generated, id: input.id };
          deferredWrite = async () => {
            await Promise.all([writeCachedAnswer(key, rawKey, answer), writeStoredAnswer(answer)]);
          };
          emit("answer", answer);
          emit("done", { cached: false });
        } catch (error) {
          console.error("Answer stream failed", error);
          emit("error", { message: "답변을 만들지 못했습니다. 잠시 후 다시 시도해 주세요." });
        } finally {
          controller.close();
        }
      },
    });

    return withCors(new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    }));
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_REQUEST";
    if (code === "RATE_LIMITED") return withCors(Response.json({ error: code }, { status: 429 }));
    if (code === "APP_CHECK_REQUIRED") return withCors(Response.json({ error: code }, { status: 401 }));
    return withCors(Response.json({ error: "INVALID_REQUEST" }, { status: 400 }));
  }
}

export function OPTIONS() {
  return corsPreflight();
}
