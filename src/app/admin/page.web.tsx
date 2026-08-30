import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Database, FileText, GitPullRequest, Radio } from "lucide-react";
import { getAdminServices } from "@/lib/firebase/admin";
import { listRawFiles } from "@/lib/wiki/local";
import { listRepositoryPages } from "@/lib/wiki/repository";

export const metadata: Metadata = { title: "관리자" };

export default async function AdminPage() {
  const [pages, rawFiles] = await Promise.all([listRepositoryPages(), listRawFiles()]);
  const sourceCount = rawFiles.length;
  const services = getAdminServices();
  const connected = Boolean(services);
  const queueCount: number | string = connected ? "로그인 후" : 0;

  return (
    <main className="admin-page">
      <header className="admin-heading"><div><span>운영 개요</span><h1>좋은 지식은<br />검토를 통과합니다.</h1></div><span className={`connection-pill ${connected ? "online" : ""}`}><i /> {connected ? "Firebase 연결됨" : "로컬 데모"}</span></header>
      <div className="stat-grid">
        <div><BookOpen /><span>Wiki 문서</span><strong>{pages.length}</strong><small>Git 기준</small></div>
        <div><FileText /><span>원문 파일</span><strong>{sourceCount}</strong><small>Git 기준</small></div>
        <div><GitPullRequest /><span>열린 검토</span><strong>{queueCount}</strong><small>GitHub PR</small></div>
      </div>
      <div className="admin-dashboard-grid">
        <section className="next-action-card"><span>다음 작업</span><h2>새로운 원문에서<br />지식 초안을 만드세요.</h2><p>파일을 올리면 AI가 기존 문서와 대조하고, 사람이 검토할 Pull Request를 만듭니다.</p><Link className="primary-action" href="/admin/ingest">원문 인제스트 <ArrowRight size={16} /></Link></section>
        <section className="system-card"><div><h2>시스템 상태</h2><span>환경 설정 기준</span></div><ul><li><Database size={17} /><span>Firestore snapshot</span><b>{connected ? "ready" : "local"}</b></li><li><Radio size={17} /><span>SSE answer stream</span><b>ready</b></li><li><GitPullRequest size={17} /><span>GitHub App</span><b>{process.env.GITHUB_APP_ID ? "ready" : "preview"}</b></li></ul></section>
      </div>
    </main>
  );
}
