import Link from "next/link";
import { BookOpen, Clock3, ShieldCheck } from "lucide-react";
import { IS_TOSS_APP } from "@/lib/platform";

const nav = [
  { href: "/wiki", label: "위키", icon: BookOpen },
  { href: "/history", label: "기록", icon: Clock3 },
  { href: "/admin", label: "관리", icon: ShieldCheck },
];

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="미래위키 홈">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span>미래위키</span>
        </Link>
        {/* 토스 번들에는 관리자 화면이 없고 탐색은 하단 탭바가 맡으므로 상단 링크를 비운다. */}
        {!IS_TOSS_APP && (
          <nav className="main-nav" aria-label="주요 탐색">
            {nav.map(({ href, label, icon: Icon }) => (
              <Link href={href} key={href} className="nav-link">
                <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
