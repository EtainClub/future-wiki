import type { Metadata, Viewport } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "미래위키 — 오래된 지혜로 미래를 묻다", template: "%s · 미래위키" },
  description: "탄허, 주역, 정역의 문헌을 근거로 미래의 가능성을 탐구하는 출처 중심 위키입니다.",
  applicationName: "미래위키",
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f5f5f1" }, { media: "(prefers-color-scheme: dark)", color: "#11120f" }],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
        <SiteHeader />
        <div className="page-frame" id="main-content" tabIndex={-1}>{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
