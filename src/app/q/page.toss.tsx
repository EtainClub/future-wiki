"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AnswerExperience } from "@/components/answer-experience";
import { RemoteNotice } from "@/components/remote-notice";
import { lensSchema } from "@/lib/wiki/schema";

function AnswerInner() {
  const params = useSearchParams();
  const question = (params.get("question") ?? "").trim().slice(0, 500);
  const id = params.get("id") ?? "";
  if (question.length < 4 || !id) return <RemoteNotice state={{ status: "error", message: "질문을 찾지 못했습니다." }} />;
  return <AnswerExperience id={id} question={question} lens={lensSchema.catch("all").parse(params.get("lens") ?? "all")} />;
}

export default function TossQuestionPage() {
  return <Suspense fallback={<RemoteNotice state={{ status: "loading" }} />}><AnswerInner /></Suspense>;
}
