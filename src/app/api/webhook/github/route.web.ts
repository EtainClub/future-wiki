import { createHmac, timingSafeEqual } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminServices } from "@/lib/firebase/admin";
import { syncWikiSnapshot } from "@/lib/github/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

function validSignature(body: string, signature: string | null): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  return expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export async function POST(request: Request) {
  const body = await request.text();
  if (!validSignature(body, request.headers.get("x-hub-signature-256"))) {
    return Response.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
  }
  const event = request.headers.get("x-github-event");
  if (event === "pull_request") {
    const payload = JSON.parse(body) as { action?: string; number?: number; pull_request?: { merged?: boolean; state?: string } };
    if (payload.action !== "closed" || !payload.number) return Response.json({ ok: true, skipped: "pull_request_not_closed" });
    const services = getAdminServices();
    if (!services) throw new Error("FIREBASE_REQUIRED");
    const reviewRef = services.db.collection("review_queue").doc(String(payload.number));
    const review = await reviewRef.get();
    if (!review.exists) return Response.json({ ok: true, skipped: "untracked_pull_request" });
    await reviewRef.update({
      status: payload.pull_request?.merged ? "merged" : "closed",
      updatedAt: FieldValue.serverTimestamp(),
    });
    return Response.json({ ok: true, reviewStatus: payload.pull_request?.merged ? "merged" : "closed" });
  }
  if (event !== "push") return Response.json({ ok: true, skipped: "unsupported_event" });

  const payload = JSON.parse(body) as { ref?: string; before?: string; after?: string };
  if (payload.ref !== "refs/heads/main" || !payload.before || !payload.after) {
    return Response.json({ ok: true, skipped: "not_main" });
  }
  const result = await syncWikiSnapshot(payload.before, payload.after);
  return Response.json({ ok: true, ...result });
}
