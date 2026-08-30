import type { Metadata } from "next";
import { AdminQueue } from "@/components/admin-queue";

export const metadata: Metadata = { title: "검토 큐" };

export default function QueuePage() {
  return (
    <main className="admin-page">
      <header className="admin-subheading"><span>HUMAN IN THE LOOP</span><h1>검토 큐</h1><p>AI가 만든 변경안의 상태를 확인하고 GitHub에서 직접 검토합니다.</p></header>
      <AdminQueue />
    </main>
  );
}
