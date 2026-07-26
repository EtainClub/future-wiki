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

## 데이터 원칙

- `raw/`, `wiki/`, `index.md`가 유일한 지식 원본입니다.
- Firestore는 스냅샷·캐시·파생 분석·검토 큐만 보관합니다.
- 캐시는 정규화 질문, 렌즈, 현재 Git SHA를 함께 해시하므로 Wiki 변경 시 자동 무효화됩니다.
- 인제스트 변경은 AI가 브랜치와 PR을 만들고 사람이 머지해야 공개됩니다.
- 포함된 시드 원문은 구조 검증용 편집 메모이며 실제 원전 대조 전 직접 인용 자료로 사용할 수 없습니다.
