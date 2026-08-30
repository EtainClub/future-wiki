"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Clock3, Sparkles } from "lucide-react";

const tabs = [
  { href: "/", label: "묻기", icon: Sparkles },
  { href: "/wiki", label: "위키", icon: BookOpen },
  { href: "/history", label: "기록", icon: Clock3 },
];

/**
 * 앱인토스 미니앱의 하단 탭바.
 *
 * 토스 미니앱은 탭바를 화면 끝에 붙이지 않고 여백을 둔 카드로 띄운다.
 * 위치·모양은 globals.css의 `[data-toss="1"] .tabbar`가 맡는다.
 */
export function TossTabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar" aria-label="주요 탐색">
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link href={href} key={href} className={`tabbar-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
            <Icon size={19} strokeWidth={1.9} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
