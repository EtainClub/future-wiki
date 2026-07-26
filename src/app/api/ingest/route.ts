import { z } from "zod";
import { ingestSource } from "@/lib/ingest/pipeline";
import { verifyAdmin } from "@/lib/security";

export const runtime = "nodejs";
export const maxDuration = 300;

const metadataSchema = z.object({
  title: z.string().trim().min(2).max(120),
  sourceId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  copyright: z.enum(["full", "excerpt"]),
});

export async function POST(request: Request) {
  try {
    const admin = await verifyAdmin(request);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "FILE_REQUIRED" }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return Response.json({ error: "FILE_TOO_LARGE" }, { status: 413 });
    if (!/\.(md|txt|pdf)$/i.test(file.name)) return Response.json({ error: "UNSUPPORTED_FILE" }, { status: 415 });

    const metadata = metadataSchema.parse({
      title: form.get("title"),
      sourceId: form.get("sourceId"),
      copyright: form.get("copyright"),
    });
    const result = await ingestSource({ file, ...metadata, createdBy: admin.uid });
    return Response.json(result, { status: result.mode === "pull_request" ? 201 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "INGEST_FAILED";
    const status = message === "ADMIN_REQUIRED" ? 403 : 400;
    return Response.json({ error: message }, { status });
  }
}
