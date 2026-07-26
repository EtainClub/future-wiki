import { z } from "zod";
import { after } from "next/server";
import { answerCacheKey, currentWikiSha, readCachedAnswer, writeCachedAnswer } from "@/lib/cache";
import { normalizeQuestion, runAnswer } from "@/lib/llm/answer";
import { enforceRateLimit, verifyAppCheck } from "@/lib/security";
import { lensSchema } from "@/lib/wiki/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  question: z.string().trim().min(4).max(500),
  lens: lensSchema.default("all"),
});

function sse(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function POST(request: Request) {
  try {
    await verifyAppCheck(request);
    const input = requestSchema.parse(await request.json());
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
          const [normalized, wikiSha] = await Promise.all([
            normalizeQuestion(input.question, input.lens),
            currentWikiSha(),
          ]);
          const key = answerCacheKey(normalized.normalized, input.lens, wikiSha);
          const cached = await readCachedAnswer(key);
          if (cached) {
            emit("status", { message: "같은 질문의 검증된 답변을 찾았습니다" });
            emit("answer", cached);
            emit("done", { cached: true });
            return;
          }

          const answer = await runAnswer(input.question, input.lens, normalized, (message) => emit("status", { message }));
          deferredWrite = () => writeCachedAnswer(key, answer);
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

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_REQUEST";
    if (code === "RATE_LIMITED") return Response.json({ error: code }, { status: 429 });
    if (code === "APP_CHECK_REQUIRED") return Response.json({ error: code }, { status: 401 });
    return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }
}
