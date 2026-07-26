import type { Metadata } from "next";
import { AdminIngest } from "@/components/admin-ingest";

export const metadata: Metadata = { title: "원문 인제스트" };

export default function IngestPage() {
  return (
    <main className="admin-page">
      <header className="admin-subheading"><span>SOURCE → PULL REQUEST</span><h1>원문 인제스트</h1><p>업로드 가능한 형식과 저작권 범위를 확인한 뒤 검토 가능한 초안을 만듭니다.</p></header>
      <AdminIngest />
    </main>
  );
}
