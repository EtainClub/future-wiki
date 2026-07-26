"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogIn, LogOut, ShieldCheck } from "lucide-react";
import { signInAdmin, signOutAdmin } from "@/lib/firebase/client";

export function AdminGate() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function login() {
    setBusy(true);
    setError(null);
    try {
      const token = await signInAdmin();
      if (!token) throw new Error("Firebase 클라이언트 설정이 필요합니다.");
      const response = await fetch("/api/admin/session", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("관리자 권한이 있는 계정이 아닙니다.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "로그인하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-auth-shell">
      <div className="queue-gate">
        <ShieldCheck size={30} aria-hidden="true" />
        <h1>관리자 작업실</h1>
        <p>Firebase 관리자 권한이 있는 Google 계정으로 로그인하세요.</p>
        <button className="primary-action" onClick={login} disabled={busy}><LogIn size={17} aria-hidden="true" /> {busy ? "권한을 확인하는 중" : "관리자 로그인"}</button>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </main>
  );
}

export function AdminSignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await Promise.all([fetch("/api/admin/session", { method: "DELETE" }), signOutAdmin()]);
    } finally {
      router.refresh();
      setBusy(false);
    }
  }

  return <button className="admin-signout" onClick={logout} disabled={busy}><LogOut size={14} aria-hidden="true" /> {busy ? "로그아웃 중" : "로그아웃"}</button>;
}