# 미래위키

오래된 문헌을 사실 예측이 아닌 사유의 렌즈로 사용하되, 모든 답변에서 원문 근거·AI 가정·확신도를 분리하는 Next.js/Firebase MVP입니다.

## 로컬 실행

```bash
cp .env.example .env.local
npm install
npm run dev
```

Anthropic과 Firebase 환경 변수가 없으면 로컬 시드 위키와 메모리 캐시를 사용하는 데모 모드로 동작합니다. `/admin/ingest`에서는 GitHub App이 연결되기 전까지 안전한 PR 미리보기만 생성합니다.

## 품질 게이트

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

`npm test`는 frontmatter·답변 스키마, 실제 raw 줄 앵커, 내부 링크, `index.md` 등록, 원문 30건 이상, 기록 데이터 검증, 원문 범위 제한을 확인하고 골든 질문 15개의 인용·가정·렌즈 격리를 회귀 검사합니다.

## 프로덕션 연결

1. Firebase 프로젝트에서 Firestore, Storage, Google Auth, App Check, App Hosting을 활성화합니다.
2. 관리자 계정에 `admin: true` custom claim을 부여합니다.
3. `.env.example`의 Firebase Web 설정을 App Hosting 환경 변수로 등록합니다.
4. `apphosting.yaml`에 선언된 Secret Manager 시크릿을 `firebase apphosting:secrets:set`으로 생성합니다.
5. GitHub App에 Contents(read/write), Pull requests(read/write), Metadata(read) 권한을 부여하고 `push`·`pull_request` webhook을 `/api/webhook/github`에 연결합니다.
6. `firestore.rules`와 `storage.rules`를 배포하고 `npm run sync:wiki`로 Wiki 스냅샷과 raw 원문을 최초 동기화합니다.
7. App Hosting backend를 main 브랜치에 연결합니다. 이후 main push가 Wiki·raw 증분 동기화를 수행합니다.

## 앱인토스(토스 미니앱) 빌드

토스는 자체 웹뷰 셸이 **정적 번들**을 읽어 실행합니다. Node 서버가 없으므로
토스 빌드는 웹과 같은 코드베이스에서 다른 형태로 나갑니다.

| | 웹 (App Hosting) | 토스 미니앱 |
| --- | --- | --- |
| 렌더링 | 서버 렌더링 | `output: "export"` 정적 번들 |
| 위키 본문 | 서버 컴포넌트가 직접 읽음 | 배포된 백엔드의 `GET /api/wiki`를 클라이언트에서 읽음 |
| 답변 | 같은 오리진 `/api/ask` | 배포 오리진의 `/api/ask` (CORS + SSE) |
| 클라이언트 증명 | App Check(reCAPTCHA Enterprise) | Firebase 익명 로그인 ID 토큰 |
| 탐색 | 상단 헤더 링크 | 하단 플로팅 탭바 |
| 관리자 화면·API 라우트 | 포함 | 번들에서 제외 |

### 파일 확장자 규칙

`next.config.ts`의 `pageExtensions`가 어느 파일을 라우트로 볼지 빌드마다 바꿉니다.

- `page.web.tsx` / `route.web.ts` — 웹 전용. 토스 번들에서 통째로 빠집니다.
- `page.toss.tsx` — 토스 전용. 웹 빌드에서 빠집니다.
- `page.tsx` — 공용.

**새 라우트를 추가할 때 확장자를 빠뜨리면 조용히 한쪽 빌드에서만 사라집니다.**
서버가 필요한 화면·API는 반드시 `.web`을, 정적 번들 전용 화면은 `.toss`를 붙입니다.

### 빌드

```bash
npm run build:toss   # TOSS_BUILD=1 next build → out/
npm run build:ait    # 위 빌드 후 ait build → future-wiki.ait
```

`@apps-in-toss/web-framework` v3의 `ait build`는 빌드를 실행하지 않고 `webBundleDir`(=`out/`)에
있는 결과물을 포장만 하므로 반드시 `build:toss`를 먼저 돌려야 합니다. `build:ait`가 둘을 묶습니다.

심사는 번들을 정적 스캔해 `eval` 계열 코드를 거부합니다. 제출 전 확인:

```bash
npm run build:ait
grep -rl "eval(\|new Function(" out/_next/static/chunks/   # 아무것도 나오면 안 됩니다
```

### 배포 전 준비

1. `apps-in-toss.config.ts`의 `appName`은 앱인토스 개발자 센터에 등록된 이름(`future-wiki`)과 정확히 같아야 합니다.
2. Firebase 콘솔에서 **익명 로그인(Anonymous)** 공급자를 활성화합니다. 토스 웹뷰는 등록된
   도메인이 없어 App Check를 통과할 수 없으므로, `/api/ask`는 익명 사용자의 ID 토큰을 대신 받습니다.
   App Check **적용(enforcement)을 Authentication 제품에는 켜지 마세요.** 켜면 익명 로그인 자체가 막힙니다.
3. 백엔드를 먼저 배포해야 합니다. 토스 번들은 `NEXT_PUBLIC_API_BASE_URL`(기본값: App Hosting URL)의
   `/api/wiki`와 `/api/ask`를 호출하며, 두 엔드포인트만 CORS를 엽니다. 관리자 API는 쿠키를 쓰므로 열지 않습니다.

## 데이터 원칙

- `raw/`, `wiki/`, `index.md`가 유일한 지식 원본입니다.
- Firestore는 스냅샷·캐시·파생 분석·검토 큐만 보관합니다.
- 캐시는 정규화 질문, 렌즈, 현재 Git SHA를 함께 해시하므로 Wiki 변경 시 자동 무효화됩니다.
- 답변은 공유 링크의 id로 `answers/{id}`에 그대로 저장되며 Wiki SHA로 무효화되지 않습니다.
  공유된 링크는 공유 당시의 답변을 계속 보여야 하고, 링크를 열 때마다 답변을 다시 만들면
  클릭 한 번마다 모델 호출 비용이 들기 때문입니다. 재방문은 `GET /api/answer?id=`만 탑니다.
- 인제스트 변경은 AI가 브랜치와 PR을 만들고 사람이 머지해야 공개됩니다.
- 포함된 시드 원문은 구조 검증용 편집 메모이며 실제 원전 대조 전 직접 인용 자료로 사용할 수 없습니다.
