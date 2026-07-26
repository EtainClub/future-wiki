"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { ArrowRight, Clock3, Trash2 } from "lucide-react";
import { LENSES } from "@/lib/constants";
import { HISTORY_KEY, LEGACY_HISTORY_KEY, historySnapshot, parseHistory } from "@/lib/history";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("future-wiki-history", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("future-wiki-history", callback);
  };
}


export function HistoryList() {
  const [confirming, setConfirming] = useState(false);
  const snapshot = useSyncExternalStore(subscribe, () => historySnapshot(localStorage), () => "[]");
  const items = parseHistory(snapshot);

  function clear() {
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(LEGACY_HISTORY_KEY);
    setConfirming(false);
    window.dispatchEvent(new Event("future-wiki-history"));
  }
  if (!items.length) return (
    <div className="empty-state"><Clock3 size={28} aria-hidden="true" /><h2>아직 남겨진 질문이 없습니다</h2><p>미래에 관해 질문하면 이 기기에만 기록됩니다.</p><Link className="primary-action" href="/">첫 질문 시작하기 <ArrowRight size={16} aria-hidden="true" /></Link></div>
  );

  return (
    <>
      <div className="list-toolbar"><span>{items.length}개의 질문</span><div>{confirming ? <><button onClick={clear} className="danger-button">정말 지우기</button><button onClick={() => setConfirming(false)}>취소</button></> : <button onClick={() => setConfirming(true)}><Trash2 size={15} aria-hidden="true" /> 기록 지우기</button>}</div></div>
      <div className="history-list">
        {items.map((item) => (
          <Link href={`/q/${item.id}?question=${encodeURIComponent(item.question)}&lens=${item.lens}`} className="history-row" key={item.id}>
            <div><span>{LENSES.find((lens) => lens.id === item.lens)?.label}</span><time dateTime={item.createdAt}>{new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</time></div>
            <h2>{item.question}</h2>
            {item.prediction && <p>{item.prediction}</p>}
            <ArrowRight className="history-arrow" size={18} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </>
  );
}
