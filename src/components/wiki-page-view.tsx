import Link from "next/link";
import { ArrowLeft, ExternalLink, FileCheck2 } from "lucide-react";
import { WikiMarkdown } from "@/components/wiki-markdown";
import type { WikiPage } from "@/lib/wiki/schema";

/** 위키 문서 본문. 웹은 서버 렌더링, 토스는 클라이언트 fetch로 같은 page를 넘긴다. */
export function WikiPageView({ page, repository }: { page: WikiPage; repository: string | null }) {
  const confidence = page.frontmatter.confidence === "high" ? "높음" : page.frontmatter.confidence === "medium" ? "보통" : "낮음";

  return (
    <main className="content-shell wiki-page-shell">
      <Link className="back-link" href="/wiki"><ArrowLeft size={16} aria-hidden="true" /> 위키로 돌아가기</Link>
      <article>
        <header className="wiki-page-header">
          <div className="wiki-meta"><span>{page.frontmatter.type}</span>{page.frontmatter.lens.map((lens) => <b key={lens}>{lens}</b>)}</div>
          <h1>{page.frontmatter.title}</h1><p>{page.frontmatter.description}</p>
          <div className="wiki-facts"><span><i className={`confidence-dot ${page.frontmatter.confidence}`} aria-hidden="true" /> 확신도 {confidence}</span><span>갱신 {page.frontmatter.updated.toLocaleDateString("ko-KR")}</span></div>
        </header>
        <WikiMarkdown>{page.body}</WikiMarkdown>
        <section className="source-panel">
          <div><FileCheck2 size={18} aria-hidden="true" /><h2>이 문서의 원문</h2></div>
          <ul>{page.frontmatter.sources.map((source) => <li key={source}>{repository ? <a href={`https://github.com/${repository}/blob/main/${source}`} target="_blank" rel="noreferrer"><code>{source}</code><ExternalLink size={14} aria-hidden="true" /></a> : <><code>{source}</code><ExternalLink size={14} aria-hidden="true" /></>}</li>)}</ul>
          <p>줄 번호는 Git 저장소의 원문과 고정되어 있으며, 변경은 Pull Request 검토를 거칩니다.</p>
        </section>
      </article>
    </main>
  );
}
