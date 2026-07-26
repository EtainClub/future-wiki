import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AnswerExperience } from "@/components/answer-experience";
import { lensSchema } from "@/lib/wiki/schema";

export const metadata: Metadata = { title: "답변" };

export default async function QuestionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const question = typeof query.question === "string" ? query.question.trim().slice(0, 500) : "";
  if (question.length < 4) notFound();
  const lens = lensSchema.catch("all").parse(typeof query.lens === "string" ? query.lens : "all");
  return <AnswerExperience id={id} question={question} lens={lens} />;
}
