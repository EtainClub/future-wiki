import test from "node:test";
import assert from "node:assert/strict";
import { parseHistory } from "../src/lib/history";
import { listRawFiles, readRaw } from "../src/lib/wiki/local";
import { answerPayloadSchema, wikiFrontmatterSchema } from "../src/lib/wiki/schema";

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