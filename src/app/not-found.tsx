import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return <main className="content-shell narrow-shell"><div className="empty-state"><span className="error-code">404</span><h1>아직 기록되지 않은 페이지입니다</h1><p>위키 인덱스에서 다른 문서를 찾아보세요.</p><Link className="primary-action" href="/wiki"><ArrowLeft size={16} /> 위키로 돌아가기</Link></div></main>;
}
