import "server-only";

import matter from "gray-matter";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminServices } from "../firebase/admin";
import { wikiFrontmatterSchema } from "../wiki/schema";
import { getInstallationOctokit, githubRepository } from "./client";

async function fetchFile(path: string, ref: string): Promise<string> {
  const octokit = await getInstallationOctokit();
  const { owner, repo } = githubRepository();
  const response = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", { owner, repo, path, ref });
  const data = response.data;
  if (Array.isArray(data) || data.type !== "file" || !("content" in data)) throw new Error(`NOT_A_FILE:${path}`);
  return Buffer.from(data.content, "base64").toString("utf8");
}

async function upsertWikiFile(filePath: string, ref: string): Promise<void> {
  const services = getAdminServices();
  if (!services) throw new Error("FIREBASE_REQUIRED");
  const source = await fetchFile(filePath, ref);
  const parsed = matter(source);
  const frontmatter = wikiFrontmatterSchema.parse(parsed.data);
  const slug = filePath.replace(/^wiki\//, "").replace(/\.md$/, "");
  await services.db.collection("wiki_snapshot").doc(frontmatter.id).set({
    slug,
    body: parsed.content.trim(),
    frontmatter: { ...frontmatter, updated: frontmatter.updated.toISOString().slice(0, 10) },
    path: filePath,
    sha: ref,
    syncedAt: FieldValue.serverTimestamp(),
  });
}

export async function syncWikiSnapshot(before: string, after: string): Promise<{ updated: number; removed: number; rawUpdated: number; rawRemoved: number }> {
  const services = getAdminServices();
  if (!services) throw new Error("FIREBASE_REQUIRED");
  const db = services.db;
  const octokit = await getInstallationOctokit();
  const { owner, repo } = githubRepository();
  const comparison = await octokit.request("GET /repos/{owner}/{repo}/compare/{basehead}", {
    owner,
    repo,
    basehead: `${before}...${after}`,
  });
  const files = comparison.data.files ?? [];
  const wikiFiles = files.filter((file) => file.filename.startsWith("wiki/") && file.filename.endsWith(".md"));
  const rawFiles = files.filter((file) => file.filename.startsWith("raw/") && /\.(md|txt|ya?ml)$/i.test(file.filename));
  let updated = 0;
  let removed = 0;
  let rawUpdated = 0;
  let rawRemoved = 0;

  async function deleteSnapshot(filePath: string) {
    const snapshot = await db.collection("wiki_snapshot").where("path", "==", filePath).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }

  for (const file of wikiFiles) {
    if (file.status === "removed") {
      await deleteSnapshot(file.filename);
      removed += 1;
    } else {
      if (file.status === "renamed" && file.previous_filename) await deleteSnapshot(file.previous_filename);
      await upsertWikiFile(file.filename, after);
      updated += 1;
    }
  }

  for (const file of rawFiles) {
    if (file.status === "removed") {
      await services.storage.bucket().file(file.filename).delete({ ignoreNotFound: true });
      rawRemoved += 1;
    } else {
      if (file.status === "renamed" && file.previous_filename) {
        await services.storage.bucket().file(file.previous_filename).delete({ ignoreNotFound: true });
      }
      const source = await fetchFile(file.filename, after);
      await services.storage.bucket().file(file.filename).save(Buffer.from(source), { contentType: "text/plain; charset=utf-8" });
      rawUpdated += 1;
    }
  }

  let index: string | undefined;
  if (files.some((file) => file.filename === "index.md" && file.status !== "removed")) index = await fetchFile("index.md", after);
  const previous = await services.db.collection("meta").doc("snapshot").get();
  await services.db.collection("meta").doc("snapshot").set({
    sha: after,
    index: index ?? previous.data()?.index ?? "",
    syncedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { updated, removed, rawUpdated, rawRemoved };
}
