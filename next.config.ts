import type { NextConfig } from "next";

/**
 * 앱인토스 빌드 여부. `pnpm|npm run build:toss`가 TOSS_BUILD=1을 넣는다.
 *
 * 토스는 자체 웹뷰 셸이 정적 번들을 읽어 실행하므로 Node 서버가 없다.
 * 그래서 토스 빌드에서는 output: "export"로 out/을 만들고,
 * API 라우트·관리자 화면처럼 서버가 필요한 파일은 pageExtensions로 통째로 뺀다.
 *
 * 규칙: `*.web.tsx`는 웹 전용, `*.toss.tsx`는 토스 전용, 확장자가 없는 파일은 공용이다.
 */
const isTossBuild = process.env.TOSS_BUILD === "1";

const nextConfig: NextConfig = {
  pageExtensions: isTossBuild
    ? ["toss.tsx", "toss.ts", "tsx", "ts"]
    : ["web.tsx", "web.ts", "tsx", "ts"],
  ...(isTossBuild
    ? {
        output: "export" as const,
        // 정적 서버는 디렉터리 index.html을 찾으므로 /wiki/view/ 형태로 내보낸다.
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
