"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, BookOpen, Check, CircleGauge, Copy, GitBranch, Radar, RotateCcw, Sparkles, Waypoints } from "lucide-react";
import { LENSES } from "@/lib/constants";
import { getAppCheckToken } from "@/lib/firebase/client";
import { HISTORY_KEY, LEGACY_HISTORY_KEY, historySnapshot, parseHistory, type HistoryItem } from "@/lib/history";
import { WikiMarkdown } from "@/components/wiki-markdown";
import type { AnswerPayload, Lens } from "@/lib/wiki/schema";


function saveHistory(item: HistoryItem) {
  const previous = parseHistory(historySnapshot(localStorage));
  localStorage.setItem(HISTORY_KEY, JSON.stringify([item, ...previous.filter((entry) => entry.id !== item.id)].slice(0, 40)));
  localStorage.removeItem(LEGACY_HISTORY_KEY);
  window.dispatchEvent(new Event("future-wiki-history"));
}

export function AnswerExperience({ id, question, lens }: { id: string; question: string; lens: Lens }) {
  const router = useRouter();
  const [status, setStatus] = useState("답변 준비 중");
  const [answer, setAnswer] = useState<AnswerPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState(false);
  const [shareStatus, setShareStatus] = useState("");

  const ask = useCallback(async (signal: AbortSignal) => {
    const deviceId = localStorage.getItem("future-wiki-device") ?? crypto.randomUUID();
    localStorage.setItem("future-wiki-device", deviceId);
    const appCheckToken = await getAppCheckToken();
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-device-id": deviceId, ...(appCheckToken ? { "x-firebase-appcheck": appCheckToken } : {}) },
      body: JSON.stringify({ question, lens }),
      signal,
    });
    if (!response.ok || !response.body) throw new Error(response.status === 429 ? "한 시간의 질문 한도에 도달했습니다. 잠시 뒤 다시 시도해 주세요." : "답변 연결을 열지 못했습니다.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const event = frame.match(/^event:\s*(.+)$/m)?.[1];
        const rawData = frame.match(/^data:\s*(.+)$/m)?.[1];
        if (!event || !rawData) continue;
        const data = JSON.parse(rawData) as { message?: string } | AnswerPayload;
        if (event === "status" && "message" in data) setStatus(data.message ?? "근거를 읽는 중");
        if (event === "answer") {
          const next = data as AnswerPayload;
          setAnswer(next);
          saveHistory({ id, question, lens, createdAt: new Date().toISOString(), prediction: next.headline || next.prediction });
        }
        if (event === "error" && "message" in data) throw new Error(data.message);
      }
    }
  }, [id, lens, question]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void ask(controller.signal).catch((cause) => {
        if ((cause as Error).name !== "AbortError") setError(cause instanceof Error ? cause.message : "오류가 발생했습니다.");
      });
    });
    return () => controller.abort();
  }, [ask, attempt]);

  function askWithLens(nextLens: Lens) {
    const nextId = crypto.randomUUID();
    router.push(`/q/${nextId}?question=${encodeURIComponent(question)}&lens=${nextLens}`);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setShareStatus("링크를 복사했습니다.");
    } catch {
      setCopied(false);
      setShareStatus("링크를 복사하지 못했습니다.");
    }
    window.setTimeout(() => { setCopied(false); setShareStatus(""); }, 1600);
  }

  if (error) {
    return (
      <main className="answer-shell narrow-shell">
        <div className="error-card" role="alert">
          <AlertTriangle aria-hidden="true" />
          <h1>답변을 이어오지 못했습니다</h1>
          <p>{error}</p>
          <button className="primary-action" onClick={() => { setError(null); setAnswer(null); setStatus("질문의 결을 살피는 중"); setAttempt((value) => value + 1); }}><RotateCcw size={17} aria-hidden="true" /> 다시 시도</button>
        </div>
      </main>
    );
  }

  if (!answer) {
    return (
      <main className="answer-shell narrow-shell" aria-live="polite">
        <div className="question-eyebrow">{LENSES.find((item) => item.id === lens)?.label}의 관점</div>
        <h1 className="question-title">{question}</h1>
        <div className="thinking-card">
          <span className="thinking-orb" aria-hidden="true"><span /></span>
          <div><p>{status}</p><span>근거를 확인하며 답변을 엮고 있습니다</span></div>
        </div>
        <div className="answer-skeleton" aria-hidden="true"><i /><i /><i /></div>
      </main>
    );
  }

  const confidenceLabel = answer.confidence === "high" ? "높음" : answer.confidence === "medium" ? "보통" : "낮음";
  const likelihoodLabel = { likely: "가능성 높음", plausible: "충분히 가능", unlikely: "가능성 낮음" } as const;
  return (
    <main className="answer-shell narrow-shell">
      <div className="answer-topline">
        <span className="question-eyebrow">{LENSES.find((item) => item.id === lens)?.label}의 관점</span>
        <div><button className="icon-text-button" onClick={copyLink}>{copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}{copied ? "복사됨" : "공유"}</button><span className="sr-only" role="status">{shareStatus}</span></div>
      </div>
      <h1 className="question-title">{question}</h1>

      <section className="prediction-card">
        <div className="section-kicker"><Sparkles size={16} aria-hidden="true" /> 예견</div>
        {answer.headline && <p className="prediction-headline">{answer.headline}</p>}
        <div className="prediction-body"><WikiMarkdown>{answer.prediction}</WikiMarkdown></div>
        {answer.cached && <span className="cache-badge">저장된 답변</span>}
      </section>

      {answer.reasoning.length > 0 && (
        <details className="answer-section reasoning-section" open>
          <summary className="section-heading"><div><Waypoints size={19} aria-hidden="true" /><h2>유추의 사슬</h2></div><span>{answer.reasoning.length}단계 · 펼치기/접기</span></summary>
          <ol className="reasoning-list">
            {answer.reasoning.map((step, index) => (
              <li key={`${index}-${step.projection.slice(0, 24)}`}>
                <span className="reasoning-index">{String(index + 1).padStart(2, "0")}</span>
                <div className="reasoning-body">
                  <p className="reasoning-row"><b>원문</b><span>{step.observation}</span></p>
                  <p className="reasoning-row"><b>구조</b><span>{step.pattern}</span></p>
                  <p className="reasoning-row projected"><b>대입</b><span>{step.projection}</span></p>
                  {step.leap && <p className="reasoning-leap">이 대응은 <em>{step.leap}</em>는 조건에서만 성립합니다.</p>}
                  {step.basis.length > 0 && <p className="reasoning-basis">{step.basis.map((item) => <code key={item}>{item}</code>)}</p>}
                </div>
              </li>
            ))}
          </ol>
        </details>
      )}

      {answer.scenarios.length > 0 && (
        <section className="answer-section scenario-section">
          <div className="section-heading"><div><GitBranch size={19} aria-hidden="true" /><h2>갈라지는 미래</h2></div><span>{answer.scenarios.length}개의 갈래</span></div>
          <div className="scenario-grid">
            {answer.scenarios.map((scenario) => (
              <article className={`scenario-card ${scenario.likelihood}`} key={scenario.title}>
                <header>
                  <h3>{scenario.title}</h3>
                  <span className="scenario-weight">{likelihoodLabel[scenario.likelihood]}</span>
                </header>
                {scenario.horizon && <p className="scenario-horizon">{scenario.horizon}</p>}
                <p className="scenario-summary">{scenario.summary}</p>
                {scenario.signals.length > 0 && (
                  <ul className="scenario-signals">
                    {scenario.signals.map((signal) => <li key={signal}><Radar size={13} aria-hidden="true" />{signal}</li>)}
                  </ul>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      <details className="answer-section evidence-section" open>
        <summary className="section-heading"><div><BookOpen size={19} aria-hidden="true" /><h2>근거</h2></div><span>{answer.evidence.length}개의 문서 · 펼치기/접기</span></summary>
        <div className="evidence-list">
          {answer.evidence.map((item, index) => {
            const inner = (
              <>
                <span className="evidence-index">{String(index + 1).padStart(2, "0")}</span>
                <span><strong>{item.title}</strong><small>{item.detail}</small>{item.anchor && <code className="evidence-anchor">{item.anchor}</code>}</span>
                {item.kind === "raw" ? <span className="evidence-tag">원문</span> : <ArrowRight size={17} aria-hidden="true" />}
              </>
            );
            // 원문만 있고 아직 위키 문서가 없는 근거는 링크 대신 앵커를 그대로 보여 준다.
            return item.kind === "raw"
              ? <div className="evidence-row" key={`${item.pageId}-${index}`}>{inner}</div>
              : <Link className="evidence-row" href={`/wiki/${item.pageId}`} key={`${item.pageId}-${index}`}>{inner}</Link>;
          })}
        </div>
      </details>

      <section className="assumption-card">
        <div className="section-kicker"><AlertTriangle size={16} aria-hidden="true" /> AI가 추가한 가정</div>
        <ul>{answer.assumptions.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>

      <section className="confidence-row">
        <span className={`confidence-ring ${answer.confidence}`}><CircleGauge size={21} aria-hidden="true" /></span>
        <div><div><strong>확신도 {confidenceLabel}</strong><span>{answer.confidence}</span></div><p>{answer.confidenceReason}</p></div>
      </section>

      <section className="lens-again">
        <span>다른 관점에서는 무엇이 보일까요?</span>
        <div>{answer.suggestedLenses.map((item) => (
          <button type="button" key={item} onClick={() => askWithLens(item)}>{LENSES.find((lensItem) => lensItem.id === item)?.label}의 눈으로 다시 보기 <ArrowRight size={15} aria-hidden="true" /></button>
        ))}</div>
      </section>
    </main>
  );
}
