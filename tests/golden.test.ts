import test from "node:test";
import assert from "node:assert/strict";
import { buildLocalAnswer } from "../src/lib/llm/answer";
import { listWikiPages } from "../src/lib/wiki/local";
import type { Lens } from "../src/lib/wiki/schema";

const cases: Array<[string, Lens]> = [
  ["기후 변화는 삶을 어떻게 바꿀까?", "all"],
  ["기후 위기를 탄허의 관점으로 보면?", "tanheo"],
  ["기후 변화에 대비하는 변화의 원리는?", "iching"],
  ["생태 전환을 후천의 관점에서 보면?", "jeongyeok"],
  ["2030년대 동아시아 질서는 어떻게 변할까?", "all"],
  ["한반도는 문명의 교차로가 될까?", "tanheo"],
  ["평화를 주역의 변화로 해석하면?", "iching"],
  ["동아시아의 후천 전환은 무엇을 뜻할까?", "jeongyeok"],
  ["AI 확산은 인간의 주도권을 어떻게 바꿀까?", "all"],
  ["기술 변화에서 때에 맞는 판단은?", "iching"],
  ["AI 시대의 새 책임을 정역으로 보면?", "jeongyeok"],
  ["문명 전환에서 중요한 태도는?", "tanheo"],
  ["변화가 막혔을 때 무엇을 살펴야 하나?", "iching"],
  ["예언의 상징을 사건에 연결해도 될까?", "nostradamus"],
  ["노스트라다무스 번역본은 어떻게 검토해야 하나?", "nostradamus"],
];

test("15 golden questions keep citations, assumptions, and lens boundaries", async () => {
  const pages = await listWikiPages();
  const byId = new Map(pages.map((page) => [page.frontmatter.id, page]));
  for (const [question, lens] of cases) {
    const answer = await buildLocalAnswer(question, lens);
    assert.ok(answer.evidence.length > 0, `${question}: evidence required`);
    assert.ok(answer.assumptions.length > 0, `${question}: assumptions required`);
    assert.match(answer.confidenceReason, /근거|직접|문헌|제한|단정/);
    // 답변은 "근거 없음"으로 끝나지 않고 유추와 갈래까지 채워야 한다.
    assert.ok(answer.headline.length > 0, `${question}: headline required`);
    assert.ok(answer.scenarios.length >= 2, `${question}: 미래는 하나로 단정하지 않는다`);
    assert.ok(answer.reasoning.length > 0, `${question}: 유추 단계 required`);
    for (const step of answer.reasoning) {
      // 원문과 대입이 한 칸에 섞이면 독자가 어디부터 추론인지 알 수 없다.
      assert.ok(step.observation && step.pattern && step.projection, `${question}: 유추 3단이 모두 필요하다`);
      for (const basis of step.basis) assert.ok(byId.has(basis) || basis.startsWith("raw/"), `${question}: ${basis}는 실재하는 근거가 아니다`);
    }
    // prediction은 마크다운으로 렌더링되므로 소제목이 있어야 화면이 벽글이 되지 않는다.
    assert.match(answer.prediction, /^## /m, `${question}: prediction must be formatted markdown`);
    for (const evidence of answer.evidence) {
      const page = byId.get(evidence.pageId);
      assert.ok(page, `${question}: cited page must exist`);
      if (lens !== "all") assert.ok(page.frontmatter.lens.includes(lens), `${question}: ${evidence.pageId} violates ${lens} lens`);
      // wikiFrontmatterSchema와 같은 형태를 요구한다. 단일 줄 앵커(#L170)도 유효하며
      // 효사 한 줄을 가리킬 때는 범위보다 정밀하다.
      assert.ok(page.frontmatter.sources.every((source) => /^raw\/.+#L\d+(?:-L\d+)?$/.test(source)), `${question}: source anchors required`);
    }
  }
});
