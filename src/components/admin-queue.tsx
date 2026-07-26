"use client";

import { useEffect, useState } from "react";
import { ExternalLink, GitPullRequest } from "lucide-react";

type QueueItem = { id: string; sourcePath?: string; status?: string; summary?: string; url?: string; createdAt?: string | null };

export function AdminQueue() {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const headers = process.env.NODE_ENV !== "production" ? { "x-demo-admin": "true" } : undefined;
    void fetch("/api/admin/queue", { headers }).then(async (response) => {
      if (!response.ok) throw new Error("관리자 로그인이 필요합니다.");
      return response.json() as Promise<{ items: QueueItem[] }>;
    }).then((data) => setItems(data.items)).catch((cause) => setError(cause instanceof Error ? cause.message : "검토 큐를 불러오지 못했습니다."));
  }, []);


  if (error) return <div className="queue-gate" role="alert"><GitPullRequest size={28} aria-hidden="true" /><h2>검토 큐를 불러오지 못했습니다</h2><p>{error}</p></div>;
  if (items === null) return <div className="history-loading" role="status"><span className="sr-only">검토 큐를 불러오는 중</span></div>;
  if (!items.length) return <div className="empty-state"><GitPullRequest size={28} aria-hidden="true" /><h2>열린 검토가 없습니다</h2><p>새 원문을 인제스트하면 GitHub Pull Request가 여기에 나타납니다.</p></div>;

  return <div className="queue-list">{items.map((item) => <a href={item.url} target="_blank" rel="noreferrer" key={item.id}><div><span className={`queue-status ${item.status}`}>{item.status}</span><code>{item.sourcePath}</code></div><h2>{item.summary}</h2><small>PR #{item.id}{item.createdAt ? ` · ${new Date(item.createdAt).toLocaleDateString("ko-KR")}` : ""}</small><ExternalLink size={17} aria-hidden="true" /></a>)}</div>;
}
