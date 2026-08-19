<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Wiki answer rules

- Git의 `raw/`, `wiki/`, `index.md`만 지식의 원본으로 취급한다.
- 사실 문장은 실제 `[src: raw/...#Lx-Ly]` 앵커가 있는 페이지에서만 인용한다.
- 선택한 렌즈가 `all`이 아니면 frontmatter의 `lens`가 일치하는 페이지만 읽는다.
- 원문에 없는 연결, 시나리오, 전망은 반드시 `AI가 추가한 가정`으로 분리한다.
- 예언을 사실이나 보장으로 단정하지 않고 불확실성과 확신도 이유를 함께 설명한다.
- 서로 다른 사상의 유사성은 동일한 기원이나 결론의 증거로 사용하지 않는다.

## 미래 유추 규칙

- 답변을 "근거가 없음"으로 끝내지 않는다. 직접 근거가 없으면 가장 가까운 구조를 가진 원문을 찾아 유추의 사슬을 만든다.
- 유추는 `관찰(원문이 실제로 말한 것) → 구조(그 안에서 반복되는 원리) → 투사(질문의 상황에 대입한 추론)` 세 단계로 나누어 적는다.
- 과거 사례를 오늘에 대응시킬 때는 그 대응이 성립하려면 참이어야 하는 조건을 함께 밝힌다.
- 미래는 하나로 단정하지 않고 갈래와 각 갈래를 가리키는 관찰 가능한 신호로 제시한다.
- 유추가 멀수록 확신도를 낮추되, 답변 자체를 생략하지는 않는다.
