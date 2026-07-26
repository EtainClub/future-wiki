"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, FileText, LoaderCircle, UploadCloud } from "lucide-react";

type Result = { mode: "preview" | "pull_request"; rawPath: string; draft: { summary: string; pages: Array<{ id: string; title: string }> }; pullRequest?: { url: string; number: number } };

export function AdminIngest() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const demoMode = process.env.NODE_ENV !== "production";


  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: demoMode ? { "x-demo-admin": "true" } : undefined,
        body: new FormData(event.currentTarget),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "인제스트에 실패했습니다.");
      setResult(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "인제스트에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ingest-layout">
      <form className="admin-form" onSubmit={submit}>
        <div className="form-intro"><UploadCloud size={22} aria-hidden="true" /><div><h2>새 원문</h2><p>업로드 후 AI가 초안을 만들고 GitHub PR로 보냅니다.</p></div></div>
        {demoMode && <div className="demo-notice">로컬 데모 모드 · API 키 없이 검토용 초안을 만듭니다.</div>}
        <label><span>출처 제목</span><input name="title" required minLength={2} autoComplete="off" placeholder="예: 주역 계사전 발췌" /></label>
        <label><span>출처 ID</span><input name="sourceId" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" autoComplete="off" spellCheck={false} placeholder="iching-xici-01" /><small>영문 소문자, 숫자, 하이픈만 사용</small></label>
        <fieldset><legend>저작권 범위</legend><label className="radio-card"><input type="radio" name="copyright" value="excerpt" defaultChecked /><span><strong>발췌만</strong><small>현대 저작물 또는 권리 확인 전</small></span></label><label className="radio-card"><input type="radio" name="copyright" value="full" /><span><strong>전문 가능</strong><small>공개 도메인 또는 사용 허가 확보</small></span></label></fieldset>
        <label className="file-drop"><FileText size={24} aria-hidden="true" /><span><strong>md, txt, pdf 파일 선택</strong><small>최대 10MB · PDF는 서버에서 텍스트로 변환</small></span><input type="file" name="file" accept=".md,.txt,.pdf" required /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-action wide" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={18} aria-hidden="true" /> 원문을 분석하는 중</> : <><UploadCloud size={18} aria-hidden="true" /> 인제스트 시작</>}</button>
      </form>

      <aside className="ingest-result" aria-live="polite">
        {result ? <><CheckCircle2 className="success-icon" aria-hidden="true" /><span className="status-label">{result.mode === "pull_request" ? "PR 생성 완료" : "초안 미리보기"}</span><h2>{result.draft.summary}</h2><p className="mono-path">{result.rawPath}</p><ul>{result.draft.pages.map((page) => <li key={page.id}><strong>{page.title}</strong><span>{page.id}</span></li>)}</ul>{result.pullRequest && <a className="primary-action" href={result.pullRequest.url} target="_blank" rel="noreferrer">GitHub에서 PR #{result.pullRequest.number} 검토</a>}</> : <><span className="result-orb" aria-hidden="true" /><h2>사람이 마지막 결정을 합니다</h2><p>생성된 문서는 곧바로 공개되지 않습니다. GitHub diff에서 근거와 가정을 확인한 뒤 머지하세요.</p><ol><li>원문 보관</li><li>Wiki 초안 생성</li><li>GitHub PR 검토</li><li>머지 후 스냅샷 동기화</li></ol></>}
      </aside>
    </div>
  );
}
