"use client";

import { AlertTriangle } from "lucide-react";
import type { RemoteState } from "@/lib/use-remote";

/** 클라이언트 읽기의 대기·실패 화면. 정적 번들에서만 쓰인다. */
export function RemoteNotice({ state }: { state: RemoteState<unknown> }) {
  if (state.status === "error") {
    return (
      <main className="content-shell narrow-shell">
        <div className="error-card" role="alert">
          <AlertTriangle aria-hidden="true" />
          <h1>내용을 불러오지 못했습니다</h1>
          <p>{state.message}</p>
        </div>
      </main>
    );
  }
  return (
    <main className="content-shell narrow-shell" aria-live="polite">
      <div className="answer-skeleton" aria-hidden="true"><i /><i /><i /></div>
      <span className="sr-only">불러오는 중</span>
    </main>
  );
}
