import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminServices } from "../src/lib/firebase/admin";
import { getIndex, listWikiPages } from "../src/lib/wiki/local";

async function walk(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  }));
  return nested.flat();
}
async function main() {
  const services = getAdminServices();
  if (!services) throw new Error("Firebase Admin 환경 변수가 필요합니다.");
  const rawRoot = path.join(process.cwd(), "raw");
  const [pages, index, rawFiles, existingWiki, [storedRawFiles]] = await Promise.all([listWikiPages(), getIndex(), walk(rawRoot), services.db.collection("wiki_snapshot").get(), services.storage.bucket().getFiles({ prefix: "raw/" })]);
  const sha = process.env.WIKI_SHA ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const batch = services.db.batch();
  for (const page of pages) {
    batch.set(services.db.collection("wiki_snapshot").doc(page.frontmatter.id), {
      ...page,
      path: `wiki/${page.slug}.md`,
      frontmatter: { ...page.frontmatter, updated: page.frontmatter.updated.toISOString().slice(0, 10) },
      sha,
      syncedAt: FieldValue.serverTimestamp(),
    });
  }
  const currentPageIds = new Set(pages.map((page) => page.frontmatter.id));
  for (const document of existingWiki.docs) {
    if (!currentPageIds.has(document.id)) batch.delete(document.ref);
  }
  batch.set(services.db.collection("meta").doc("snapshot"), { sha, index, syncedAt: FieldValue.serverTimestamp() });
  await batch.commit();
  const localRawPaths = new Set(rawFiles.map((file) => path.relative(process.cwd(), file).split(path.sep).join("/")));
  await Promise.all([
    ...rawFiles.map(async (file) => {
      const relative = path.relative(process.cwd(), file).split(path.sep).join("/");
      await services.storage.bucket().file(relative).save(await fs.readFile(file), { contentType: "text/plain; charset=utf-8" });
    }),
    ...storedRawFiles.filter((file) => !localRawPaths.has(file.name)).map((file) => file.delete({ ignoreNotFound: true })),
  ]);
  console.log(`Synced ${pages.length} pages and ${rawFiles.length} raw files at ${sha}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
