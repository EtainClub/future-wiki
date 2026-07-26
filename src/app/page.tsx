import Link from "next/link";
import { ArrowRight, GitPullRequest, Library, ShieldCheck } from "lucide-react";
import { AskComposer } from "@/components/ask-composer";
import { listRepositoryPages } from "@/lib/wiki/repository";

export const dynamic = "force-dynamic";

export default async function Home() {
  const pages = await listRepositoryPages();
  const sources = new Set(pages.flatMap((page) => page.frontmatter.sources.map((source) => source.split("#")[0])));
  const featured = pages.filter((page) => page.frontmatter.type === "principle" || page.frontmatter.type === "synthesis").slice(0, 3);

  return (
    <main className="home-shell">
      <section className="hero-section">
        <div className="hero-orbit" aria-hidden="true"><span /><i /><b /></div>
        <p className="hero-eyebrow">AN EVIDENCE-LED ORACLE</p>
        <h1>오래된 지혜로,<br /><span>아직 오지 않은 시간을 묻다.</span></h1>
        <p className="hero-copy">예언을 믿음의 대상이 아닌 사유의 도구로. 원문과 해석, 가정을 분리해 미래의 가능성을 탐구합니다.</p>
        <AskComposer />
        <div className="trust-line"><ShieldCheck size={15} aria-hidden="true" /><span>모든 답변은 원문 근거와 AI의 가정을 분리해 보여드립니다</span></div>
      </section>

      <section className="principles-strip" aria-label="서비스 원칙">
        <div><Library size={19} aria-hidden="true" /><span><strong>{pages.length}</strong>개의 검토된 문서</span></div>
        <div><GitPullRequest size={19} aria-hidden="true" /><span><strong>{sources.size}</strong>개의 연결된 원문</span></div>
        <div><ShieldCheck size={19} aria-hidden="true" /><span><strong>100%</strong> 사람의 머지 검토</span></div>
      </section>

      <section className="featured-section">
        <div className="section-title-row"><div><span>살펴볼 관점</span><h2>변화를 읽는 세 가지 실마리</h2></div><Link href="/wiki">위키 전체 보기 <ArrowRight size={16} aria-hidden="true" /></Link></div>
        <div className="featured-grid">
          {featured.map((page, index) => (
            <Link href={`/wiki/${page.frontmatter.id}`} className="featured-card" key={page.frontmatter.id}>
              <span className="card-number">0{index + 1}</span>
              <div className={`card-symbol symbol-${index + 1}`} aria-hidden="true"><i /><i /><i /></div>
              <div><span className="card-type">{page.frontmatter.lens.join(" · ")}</span><h3>{page.frontmatter.title}</h3><p>{page.frontmatter.description}</p></div>
              <ArrowRight className="card-arrow" size={18} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      <section className="method-callout">
        <div><span>어떻게 답하나요?</span><h2>빠르게 말하기보다,<br />근거까지 걸어갑니다.</h2></div>
        <ol><li><span>1</span><div><strong>질문을 정리합니다</strong><p>의미는 보존하고 탐색할 개념을 찾습니다.</p></div></li><li><span>2</span><div><strong>원문까지 확인합니다</strong><p>인덱스와 위키, 줄 단위 원문을 차례로 읽습니다.</p></div></li><li><span>3</span><div><strong>사실과 가정을 나눕니다</strong><p>근거, AI의 가정, 확신도를 함께 돌려드립니다.</p></div></li></ol>
      </section>
    </main>
  );
}
