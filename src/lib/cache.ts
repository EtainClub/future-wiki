import "server-only";

import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminServices } from "./firebase/admin";
import { answerPayloadSchema, type AnswerPayload, type Lens } from "./wiki/schema";

const localCache = new Map<string, AnswerPayload>();
const localAnswers = new Map<string, AnswerPayload>();

export function answerCacheKey(normalizedQuestion: string, lens: Lens, wikiSha: string): string {
  return createHash("sha256").update(`${normalizedQuestion}\u0000${lens}\u0000${wikiSha}`).digest("hex");
}

/** 공유 링크의 id. Firestore 문서 경로에 그대로 들어가므로 형태를 제한한다. */
function isShareId(id: string): boolean {
  return /^[A-Za-z0-9-]{8,64}$/.test(id);
}

/**
 * 공유 링크로 저장된 답변을 id 그대로 되찾는다.
 *
 * qa_cache와 달리 키에 wikiSha가 없다. 공유된 링크는 공유 당시의 답변을 계속
 * 보여야 하고, 위키가 갱신됐다는 이유로 링크를 열 때마다 답변을 다시 생성하면
 * 클릭 한 번마다 모델 호출 비용이 든다.
 */
export async function readStoredAnswer(id: string): Promise<AnswerPayload | null> {
  if (!isShareId(id)) return null;
  const services = getAdminServices();
  if (!services) {
    const answer = localAnswers.get(id);
    return answer ? { ...answer, cached: true } : null;
  }
  const snapshot = await services.db.collection("answers").doc(id).get();
  if (!snapshot.exists) return null;
  const parsed = answerPayloadSchema.safeParse(snapshot.data()?.answer);
  if (!parsed.success) return null;
  return { ...parsed.data, cached: true };
}

/** 답변을 공유 id로 영구 저장한다. 같은 링크를 다시 열면 여기서 그대로 나간다. */
export async function writeStoredAnswer(answer: AnswerPayload): Promise<void> {
  if (!isShareId(answer.id)) return;
  const services = getAdminServices();
  if (!services) {
    localAnswers.set(answer.id, answer);
    return;
  }
  await services.db.collection("answers").doc(answer.id).set({
    question: answer.question,
    lens: answer.lens,
    answer,
    createdAt: FieldValue.serverTimestamp(),
  });
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

/**
 * 질문 단위 캐시. 정규화 키와 원문 질문 키에 같은 답변을 함께 걸어 둔다.
 *
 * 원문 키가 있어야 다음 사람이 똑같은 문장을 물었을 때 정규화(Haiku 호출)를
 * 하기 전에 캐시가 걸린다. 정규화 키는 표현이 달라도 같은 뜻이면 걸리게 한다.
 */
export async function writeCachedAnswer(key: string, rawKey: string, answer: AnswerPayload): Promise<void> {
  const services = getAdminServices();
  if (!services) {
    localCache.set(key, answer);
    localCache.set(rawKey, answer);
    return;
  }
  const entry = {
    question: answer.question,
    lens: answer.lens,
    answer,
    citedPages: answer.evidence.map((item) => item.pageId),
    assumptions: answer.assumptions,
    confidence: answer.confidence,
    createdAt: FieldValue.serverTimestamp(),
    hits: 0,
  };
  await Promise.all([
    services.db.collection("qa_cache").doc(key).set(entry),
    services.db.collection("qa_cache").doc(rawKey).set(entry),
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
