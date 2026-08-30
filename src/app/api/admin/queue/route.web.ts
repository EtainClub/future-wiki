import { getAdminServices } from "@/lib/firebase/admin";
import { verifyAdmin } from "@/lib/security";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await verifyAdmin(request);
    const services = getAdminServices();
    if (!services) return Response.json({ items: [] });
    const snapshot = await services.db.collection("review_queue").limit(100).get();
    const items = snapshot.docs
      .map((doc) => { const data = doc.data() as { status?: string; createdAt?: { toDate?: () => { toISOString?: () => string } } }; return { id: doc.id, ...data, createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null }; })
      .filter((item) => item.status === "open")
      .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
    return Response.json({ items });
  } catch {
    return Response.json({ error: "ADMIN_REQUIRED" }, { status: 403 });
  }
}
