import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WikiPageView } from "@/components/wiki-page-view";
import { getRepositoryPage } from "@/lib/wiki/repository";

export const dynamic = "force-dynamic";

async function findPage(slug: string[]) {
  return getRepositoryPage(slug.join("/"));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await findPage(slug);
  return page ? { title: page.frontmatter.title, description: page.frontmatter.description } : { title: "문서를 찾을 수 없음" };
}

export default async function WikiPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const page = await findPage(slug);
  if (!page) notFound();
  return <WikiPageView page={page} repository={process.env.GITHUB_REPOSITORY ?? null} />;
}
