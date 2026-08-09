import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { rawMetaSchema, wikiFrontmatterSchema } from "../src/lib/wiki/schema";

const root = process.cwd();
const wikiRoot = path.join(root, "wiki");
const rawRoot = path.join(root, "raw");

async function walk(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat();
}

async function main() {
const wikiFiles = (await walk(wikiRoot)).filter((file) => file.endsWith(".md"));
// listRawFiles와 같은 필터를 쓴다. .DS_Store 같은 파일이 원문 수에 잡히면 안 된다.
const rawFiles = (await walk(rawRoot)).filter((file) => /\.(md|txt)$/i.test(file) && !file.endsWith("_meta.yaml"));
const index = await fs.readFile(path.join(root, "index.md"), "utf8");
const ids = new Set<string>();
const errors: string[] = [];
const warnings: string[] = [];

for (const file of wikiFiles) {
  const relative = path.relative(root, file).split(path.sep).join("/");
  try {
    const parsed = matter(await fs.readFile(file, "utf8"));
    const meta = wikiFrontmatterSchema.parse(parsed.data);
    if (path.basename(file, ".md") !== meta.id) errors.push(`${relative}: id must match filename`);
    if (ids.has(meta.id)) errors.push(`${relative}: duplicate id ${meta.id}`);
    ids.add(meta.id);
    if (!index.includes(relative)) errors.push(`${relative}: missing from index.md`);
    // 예언 기록 페이지는 검증 필드를 갖춰야 한다. 기존 페이지 호환을 위해 경고로만 보고한다.
    if (meta.type === "prediction" && !meta.prophecy) {
      warnings.push(`${relative}: type: prediction 인데 prophecy 블록이 없음 (recorded/verdict 등 검증 필드 누락)`);
    }
    if (meta.prophecy?.interpretedBefore === false && meta.prophecy?.verdict === "hit") {
      warnings.push(`${relative}: 사후 해석만 있는데 verdict가 hit — 사후 귀속 여부를 확인할 것`);
    }

    const claims = parsed.content.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && !line.startsWith(">") && !line.startsWith("-") && !line.startsWith("[src:"));
    for (const claim of claims) {
      if (!/\[src: raw\/.+#L\d+(?:-L\d+)?\]$/.test(claim)) errors.push(`${relative}: claim lacks trailing source anchor: ${claim.slice(0, 50)}`);
    }

    const anchors = [...new Set([...meta.sources, ...Array.from(parsed.content.matchAll(/\[src: (raw\/.+#L\d+(?:-L\d+)?)\]/g), (match) => match[1])])];
    for (const anchor of anchors) {
      const match = anchor.match(/^(raw\/.+)#L(\d+)(?:-L(\d+))?$/);
      if (!match) { errors.push(`${relative}: invalid anchor ${anchor}`); continue; }
      const rawFile = path.resolve(root, match[1]);
      if (!rawFile.startsWith(`${rawRoot}${path.sep}`)) { errors.push(`${relative}: anchor escapes raw/`); continue; }
      try {
        const lines = (await fs.readFile(rawFile, "utf8")).split("\n").length;
        const end = Number(match[3] ?? match[2]);
        if (end > lines) errors.push(`${relative}: anchor ${anchor} exceeds ${lines} lines`);
      } catch { errors.push(`${relative}: missing source ${match[1]}`); }
    }
  } catch (error) {
    errors.push(`${relative}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

for (const link of index.matchAll(/\((wiki\/[^)]+\.md)\)/g)) {
  try { await fs.access(path.join(root, link[1])); } catch { errors.push(`index.md: broken link ${link[1]}`); }
}
if (rawFiles.length < 30) errors.push(`raw/: expected at least 30 source files, found ${rawFiles.length}`);

// 출처 단위 메타데이터. 판본과 기록 신뢰도가 없으면 앵커의 의미를 해석할 수 없다.
const metaFiles = (await walk(rawRoot)).filter((file) => file.endsWith("_meta.yaml"));
for (const file of metaFiles) {
  const relative = path.relative(root, file).split(path.sep).join("/");
  try {
    const meta = rawMetaSchema.parse(matter(`---\n${await fs.readFile(file, "utf8")}\n---\n`).data);
    for (const field of ["lens", "method", "record_reliability", "canonical_edition", "attribution_note"] as const) {
      if (meta[field] === undefined) warnings.push(`${relative}: ${field} 누락`);
    }
  } catch (error) {
    errors.push(`${relative}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (warnings.length) {
  console.warn(`경고 ${warnings.length}건 (빌드는 통과):`);
  console.warn(warnings.map((warning) => `- ${warning}`).join("\n"));
}
if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}
console.log(`Validated ${wikiFiles.length} wiki pages, ${rawFiles.length} source files, ${metaFiles.length} _meta.yaml, and ${ids.size} unique page IDs.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
