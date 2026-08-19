import "server-only";

import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminServices } from "./firebase/admin";
import { answerPayloadSchema, type AnswerPayload, type Lens } from "./wiki/schema";

const localCache = new Map<string, AnswerPayload>();

export function answerCacheKey(normalizedQuestion: string, lens: Lens, wikiSha: string): string {
  return createHash("sha256").update(`${normalizedQuestion}\u0000${lens}\u0000${wikiSha}`).digest("hex");
}

export async function currentWikiSha(): Promise<string> {
  const services = getAdminServices();
  if (!services) return process.env.LOCAL_WIKI_SHA ?? "local-seed-v1";
  const snapshot = await services.db.collection("meta").doc("snapshot").get();
  return String(snapshot.data()?.sha ?? "unsynced");
}

export async function readCachedAnswer(key: string): Promise<AnswerPayload | null> {
  const services = getAdminServices();
  if (!services) {
    const answer = localCache.get(key);
    return answer ? { ...answer, cached: true } : null;
  }
  const ref = services.db.collection("qa_cache").doc(key);
  const snapshot = await ref.get();
  if (!snapshot.exists) return null;
  const parsed = answerPayloadSchema.safeParse(snapshot.data()?.answer);
  if (!parsed.success) return null;
  await ref.update({ hits: FieldValue.increment(1) });
  return { ...parsed.data, cached: true };
}

export async function writeCachedAnswer(key: string, answer: AnswerPayload): Promise<void> {
  const services = getAdminServices();
  if (!services) {
    localCache.set(key, answer);
    return;
  }
  await Promise.all([
    services.db.collection("qa_cache").doc(key).set({
      question: answer.question,
      lens: answer.lens,
      answer,
      citedPages: answer.evidence.map((item) => item.pageId),
      assumptions: answer.assumptions,
      confidence: answer.confidence,
      createdAt: FieldValue.serverTimestamp(),
      hits: 0,
    }),
    services.db.collection("derived").doc(answer.id).set({
      question: answer.question,
      lens: answer.lens,
      // prediction은 마크다운 본문이라 목록에 그대로 걸면 기호가 새어 나온다.
      summary: answer.headline || answer.prediction,
      citedPages: answer.evidence.map((item) => item.pageId),
      promoted: false,
      qaRef: key,
      createdAt: FieldValue.serverTimestamp(),
    }),
  ]);
}
