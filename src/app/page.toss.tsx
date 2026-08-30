"use client";

import { useCallback } from "react";
import { HomeView } from "@/components/home-view";
import { useRemote } from "@/lib/use-remote";
import { fetchWikiSummaries } from "@/lib/wiki/client-api";

/**
 * 앱인토스 홈. 문서 목록은 배포된 백엔드에서 읽지만 질문 입력은 즉시 쓸 수 있어야 하므로
 * 목록을 기다리지 않고 빈 목록으로 먼저 그린다.
 */
export default function TossHome() {
  const state = useRemote(useCallback((signal: AbortSignal) => fetchWikiSummaries(signal), []));
  return <HomeView pages={state.status === "ready" ? state.data : []} />;
}
