import { HomeView } from "@/components/home-view";
import { listRepositoryPages } from "@/lib/wiki/repository";

export const dynamic = "force-dynamic";

export default async function Home() {
  const pages = await listRepositoryPages();
  return <HomeView pages={pages.map(({ slug, frontmatter }) => ({ slug, frontmatter }))} />;
}
