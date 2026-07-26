import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { listRepositoryPages } from "@/lib/wiki/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "위키" };

const labels: Record<string, string> = { prophet: "인물", principle: "원리", prediction: "예측", entity: "대상", topic: "주제", synthesis: "종합" };

export default async function WikiIndexPage() {
  const pages = await listRepositoryPages();
  const groups = Object.entries(Object.groupBy(pages, (page) => page.frontmatter.type));
  return (
    <main className="content-shell wiki-index-shell">
      <header className="page-heading"><span>살아 있는 지식 저장소</span><h1>미래위키</h1><p>원문에서 출발해 사람이 검토한 문서입니다. 각 페이지는 출처와 확신도를 함께 보존합니다.</p></header>
      <div className="wiki-groups">
        {groups.map(([type, items]) => items && (
          <section className="wiki-group" key={type}>
            <div className="wiki-group-title"><h2>{labels[type] ?? type}</h2><span>{items.length}</span></div>
            <div className="wiki-card-grid">{items.map((page) => (
              <Link href={`/wiki/${page.frontmatter.id}`} className="wiki-card" key={page.frontmatter.id}>
                <div><span>{page.frontmatter.lens.join(" · ")}</span><i className={`confidence-dot ${page.frontmatter.confidence}`} role="img" aria-label={`확신도 ${page.frontmatter.confidence}`} /></div>
                <h3>{page.frontmatter.title}</h3><p>{page.frontmatter.description}</p><small>업데이트 {page.frontmatter.updated.toLocaleDateString("ko-KR")}</small><ArrowRight size={17} aria-hidden="true" />
              </Link>
            ))}</div>
          </section>
        ))}
      </div>
    </main>
  );
}
