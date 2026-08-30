"use client";

import { Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { RemoteNotice } from "@/components/remote-notice";
import { WikiPageView } from "@/components/wiki-page-view";
import { useRemote } from "@/lib/use-remote";
import { fetchWikiPage } from "@/lib/wiki/client-api";

function WikiViewInner() {
  const id = useSearchParams().get("id") ?? "";
  const state = useRemote(useCallback((signal: AbortSignal) => (id ? fetchWikiPage(id, signal) : Promise.resolve(null)), [id]));
  if (state.status !== "ready") return <RemoteNotice state={state} />;
  if (!state.data) return <RemoteNotice state={{ status: "error", message: "아직 기록되지 않은 문서입니다." }} />;
  return <WikiPageView page={state.data.page} repository={state.data.repository} />;
}

export default function TossWikiViewPage() {
  return <Suspense fallback={<RemoteNotice state={{ status: "loading" }} />}><WikiViewInner /></Suspense>;
}
