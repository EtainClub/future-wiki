import test from "node:test";
import assert from "node:assert/strict";
import { parseHistory } from "../src/lib/history";
import { listRawFiles, readRaw } from "../src/lib/wiki/local";
import { LENSES } from "../src/lib/constants";
import { LENS_REGISTRY } from "../src/lib/wiki/lenses";
import { answerPayloadSchema, lensValues, prophecySchema, rawMetaSchema, wikiFrontmatterSchema } from "../src/lib/wiki/schema";

test("history parsing filters malformed or unsafe entries", () => {
  const parsed = parseHistory(JSON.stringify([
    { id: "ok", question: "질문", lens: "all", createdAt: "2026-07-27T00:00:00.000Z" },
    { id: "bad-date", question: "질문", lens: "all", createdAt: "not-a-date" },
    { id: "bad-lens", question: "질문", lens: "unknown", createdAt: "2026-07-27T00:00:00.000Z" },
  ]));
  assert.deepEqual(parsed.map((item) => item.id), ["ok"]);
  assert.deepEqual(parseHistory("not-json"), []);
});

test("runtime schemas coerce snapshot dates and reject incomplete answers", () => {
  const frontmatter = wikiFrontmatterSchema.parse({
    type: "topic",
    id: "runtime-check",
    title: "런타임 검증",
    description: "날짜 변환 검증",
    lens: ["iching"],
    sources: ["raw/example.txt#L1-L2"],
    confidence: "medium",
    updated: "2026-07-27",
  });
  assert.ok(frontmatter.updated instanceof Date);
  assert.equal(answerPayloadSchema.safeParse({ id: "x", question: "질문", lens: "all", prediction: "예측", evidence: [], assumptions: [], confidence: "low", confidenceReason: "제한", suggestedLenses: [] }).success, false);
});

test("raw reads reject traversal and clamp oversized ranges", async () => {
  const firstRaw = (await listRawFiles())[0];
  assert.ok(firstRaw);
  const excerpt = await readRaw(firstRaw, 1, 10_000);
  assert.ok(excerpt.split("\n").length <= 200);
  await assert.rejects(() => readRaw("raw/../package.json", 1, 10), /Invalid raw path/);
});

test("렌즈는 LENS_REGISTRY 한 곳에서만 파생된다", () => {
  const registryIds = LENS_REGISTRY.map((lens) => lens.id);
  // zod enum, UI 목록이 레지스트리와 어긋나면 예언가 추가 시 한쪽만 고치는 사고가 난다.
  assert.deepEqual([...lensValues], ["all", ...registryIds]);
  assert.deepEqual(LENSES.map((lens) => lens.id), ["all", ...registryIds]);
  assert.equal(wikiFrontmatterSchema.safeParse({
    type: "topic", id: "lens-check", title: "t", description: "d",
    lens: ["all"], sources: ["raw/a.txt#L1"], confidence: "low", updated: "2026-01-01",
  }).success, false, "all은 페이지 lens로 쓸 수 없다");
  for (const lens of LENS_REGISTRY) {
    assert.ok(lens.label && lens.short, `${lens.id}: UI 라벨 누락`);
  }
});

test("예언 검증 필드는 기록 신뢰도·해석 확신도와 독립이다", () => {
  const prophecy = prophecySchema.parse({ recorded: "1555" });
  assert.deepEqual(prophecy, {
    recorded: "1555", targetPeriod: null, actualEvent: null,
    interpretedBefore: false, interpretedAfter: false, verdict: "unresolved",
  });
  // prophecy 블록은 선택이므로 기존 페이지가 깨지지 않는다.
  const page = wikiFrontmatterSchema.parse({
    type: "prediction", id: "p", title: "t", description: "d",
    lens: ["nostradamus"], sources: ["raw/a.txt#L1"], confidence: "low", updated: "2026-01-01",
  });
  assert.equal(page.prophecy, undefined);
  // 기록 신뢰도는 출처 단위이고 verdict/confidence와 값 공간이 다르다.
  const meta = rawMetaSchema.parse({
    source_id: "s", title: "t", copyright: "public-domain", record_reliability: "D",
  });
  assert.equal(meta.record_reliability, "D");
  assert.equal(rawMetaSchema.safeParse({ source_id: "s", title: "t", copyright: "public-domain", record_reliability: "low" }).success, false);
});