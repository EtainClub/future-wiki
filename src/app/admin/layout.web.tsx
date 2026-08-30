import Link from "next/link";
import { cookies } from "next/headers";
import { FileUp, LayoutDashboard, GitPullRequest } from "lucide-react";
import { AdminGate, AdminSignOut } from "@/components/admin-session-controls";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionValue } from "@/lib/admin-session";
import { getAdminServices } from "@/lib/firebase/admin";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const services = getAdminServices();
  const requiresAuth = process.env.NODE_ENV === "production" || Boolean(services);
  const sessionValue = requiresAuth ? (await cookies()).get(ADMIN_SESSION_COOKIE)?.value : undefined;
  const session = requiresAuth ? await verifyAdminSessionValue(sessionValue) : { uid: "local-admin" };
  if (!session) return <AdminGate />;

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div><span>OPERATIONS</span><h2>관리자 작업실</h2></div>
        <nav><Link href="/admin"><LayoutDashboard size={17} aria-hidden="true" /> 대시보드</Link><Link href="/admin/ingest"><FileUp size={17} aria-hidden="true" /> 원문 인제스트</Link><Link href="/admin/queue"><GitPullRequest size={17} aria-hidden="true" /> 검토 큐</Link></nav>
        <p>지식의 진실은 Git에,<br />운영 상태는 Firebase에 둡니다.</p>
        {requiresAuth && <AdminSignOut />}
      </aside>
      <div className="admin-content">{children}</div>
    </div>
  );
}
