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
