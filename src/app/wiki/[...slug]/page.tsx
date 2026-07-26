import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, FileCheck2 } from "lucide-react";
import { WikiMarkdown } from "@/components/wiki-markdown";
import { getRepositoryPage } from "@/lib/wiki/repository";

export const dynamic = "force-dynamic";

async function findPage(slug: string[]) {
  return getRepositoryPage(slug.join("/"));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await findPage(slug);
  return page ? { title: page.frontmatter.title, description: page.frontmatter.description } : { title: "문서를 찾을 수 없음" };
}

export default async function WikiPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const page = await findPage(slug);
  if (!page) notFound();
  const confidence = page.frontmatter.confidence === "high" ? "높음" : page.frontmatter.confidence === "medium" ? "보통" : "낮음";
  const repository = process.env.GITHUB_REPOSITORY;

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
