"use client";

import { useCallback } from "react";
import { RemoteNotice } from "@/components/remote-notice";
import { WikiIndexView } from "@/components/wiki-index-view";
import { useRemote } from "@/lib/use-remote";
import { fetchWikiSummaries } from "@/lib/wiki/client-api";

export default function TossWikiIndexPage() {
  const state = useRemote(useCallback((signal: AbortSignal) => fetchWikiSummaries(signal), []));
  if (state.status !== "ready") return <RemoteNotice state={state} />;
  return <WikiIndexView pages={state.data} />;
}
