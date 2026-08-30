import { defineConfig } from "@apps-in-toss/web-framework/config";

/**
 * 앱인토스 미니앱 설정(web-framework v3).
 *
 * v3의 `ait build`는 빌드를 실행하지 않고 webBundleDir에 이미 있는 결과물을 포장만 한다.
 * 그래서 반드시 `npm run build:toss`(=next build, TOSS_BUILD=1)를 먼저 돌려야 한다.
 * `npm run build:ait`가 두 단계를 순서대로 묶어 둔다.
 */
export default defineConfig({
  // 앱인토스 개발자 센터에 등록된 appName과 정확히 같아야 한다.
  appName: "future-wiki",
  brand: { primaryColor: "#385d4d" },
  permissions: [],
  navigationBar: { withBackButton: true, withHomeButton: true, withTitle: true },
  webView: { bounces: false, pullToRefreshEnabled: false },
  webBundleDir: "out",
});
