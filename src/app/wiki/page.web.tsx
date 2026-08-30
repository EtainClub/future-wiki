import type { Metadata } from "next";
import { WikiIndexView } from "@/components/wiki-index-view";
import { listRepositoryPages } from "@/lib/wiki/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "위키" };

export default async function WikiIndexPage() {
  const pages = await listRepositoryPages();
  return <WikiIndexView pages={pages.map(({ slug, frontmatter }) => ({ slug, frontmatter }))} />;
}
