import type { Metadata } from "next";
import { HistoryList } from "@/components/history-list";

export const metadata: Metadata = { title: "질문 기록" };

export default function HistoryPage() {
  return (
    <main className="content-shell narrow-shell">
      <header className="page-heading"><span>나의 탐구</span><h1>질문 기록</h1><p>이 브라우저에만 저장된 질문과 답변을 다시 살펴보세요.</p></header>
      <HistoryList />
    </main>
  );
}
