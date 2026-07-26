"use client";

import { FormEvent, KeyboardEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Sparkles } from "lucide-react";
import { EXAMPLE_QUESTIONS, LENSES } from "@/lib/constants";
import type { Lens } from "@/lib/wiki/schema";

export function AskComposer() {
  const router = useRouter();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [question, setQuestion] = useState("");
  const [lens, setLens] = useState<Lens>("all");

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const value = question.trim();
    if (value.length < 4) {
      textarea.current?.focus();
      return;
    }
    const id = crypto.randomUUID();
    router.push(`/q/${id}?question=${encodeURIComponent(value)}&lens=${lens}`);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className="ask-area">
      <form className="ask-composer" onSubmit={submit}>
        <label className="sr-only" htmlFor="future-question">미래에 관해 질문하기</label>
        <textarea
          ref={textarea}
          id="future-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="어떤 미래가 궁금하신가요?"
          rows={3}
          maxLength={500}
        />
        <div className="composer-controls">
          <div className="lens-scroller" role="radiogroup" aria-label="해석 렌즈">
            {LENSES.map((item) => (
              <button
                type="button"
                role="radio"
                aria-checked={lens === item.id}
                className={`lens-chip ${lens === item.id ? "selected" : ""}`}
                onClick={() => setLens(item.id)}
                key={item.id}
                title={item.short}
              >
                {item.id === "all" && <Sparkles size={14} aria-hidden="true" />}
                {item.label}
              </button>
            ))}
          </div>
          <button className="ask-button" type="submit" aria-label="질문 보내기" disabled={question.trim().length < 4}>
            <ArrowUp size={20} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
      </form>
      <div className="prompt-suggestions" aria-label="예시 질문">
        {EXAMPLE_QUESTIONS.map((example) => (
          <button key={example} type="button" onClick={() => { setQuestion(example); textarea.current?.focus(); }}>
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}
