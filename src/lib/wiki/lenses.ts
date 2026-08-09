/**
 * 렌즈(예언 관점) 레지스트리 — 단일 출처.
 *
 * 예언가를 추가할 때는 이 파일의 LENS_REGISTRY에만 항목을 넣는다.
 * zod enum, UI 목록, LLM 프롬프트, 기록 검증이 모두 여기서 파생된다.
 */

/**
 * 예언 방식 분류. 렌즈와 독립된 축이다.
 * 서로 다른 방식의 유사성을 같은 기원의 증거로 쓰지 않기 위해 명시적으로 구분한다.
 */
export const PROPHECY_METHODS = [
  "astrology-symbolic", // 점성술·상징 해석형
  "clairvoyance", // 투시·채널링형
  "precognitive-dream", // 예지몽형
  "religious-vision", // 종교적 환시형
  "cosmic-cycle", // 역학·우주주기 계산형
  "dynastic-cycle", // 역사·왕조순환형
  "geomancy", // 풍수·도참형
  "posthumous-attribution", // 후대 귀속·전승형
] as const;
export type ProphecyMethod = (typeof PROPHECY_METHODS)[number];

/**
 * 기록 신뢰도 — "예언이 맞았는가"가 아니라
 * "그 사람이 사건 발생 전에 실제로 그 말을 남겼음을 얼마나 확인할 수 있는가".
 * 해석의 확신도(wiki frontmatter의 confidence)와는 독립된 축이다.
 */
export const RECORD_RELIABILITIES = ["A", "B", "C", "D"] as const;
export type RecordReliability = (typeof RECORD_RELIABILITIES)[number];

export type LensDefinition = {
  readonly id: string;
  readonly label: string;
  readonly short: string;
  readonly method: ProphecyMethod;
  readonly recordReliability: RecordReliability;
  /** 인물이 아닌 문헌 전통이면 생략한다. */
  readonly lifespan?: string;
  readonly region?: string;
};

export const LENS_REGISTRY = [
  {
    id: "tanheo",
    label: "탄허",
    short: "탄허의 사상과 시대 인식",
    method: "cosmic-cycle",
    recordReliability: "B",
    lifespan: "1913-1983",
    region: "한국",
  },
  {
    id: "iching",
    label: "주역",
    short: "변화의 구조와 괘의 원리",
    method: "cosmic-cycle",
    recordReliability: "A",
    region: "중국",
  },
  {
    id: "jeongyeok",
    label: "정역",
    short: "후천 전환과 순환의 관점",
    method: "cosmic-cycle",
    recordReliability: "A",
    lifespan: "1826-1898",
    region: "조선",
  },
  {
    id: "nostradamus",
    label: "노스트라다무스",
    short: "상징적 예언의 관점",
    method: "astrology-symbolic",
    recordReliability: "A",
    lifespan: "1503-1566",
    region: "프랑스",
  },
  {
    // 당대 이순풍·원천강에게 귀속되지만 현전 텍스트는 1915년 간행 금비본이다.
    // 저자 귀속과 텍스트 성립 시점의 간극이 커 기록 신뢰도를 C로 둔다.
    id: "tuibeitu",
    label: "추배도",
    short: "왕조 순환으로 읽는 상징 예언",
    method: "dynastic-cycle",
    recordReliability: "C",
    region: "중국",
  },
] as const satisfies readonly LensDefinition[];

export type ProphetLens = (typeof LENS_REGISTRY)[number]["id"];
export type Lens = "all" | ProphetLens;

/** 페이지 frontmatter의 lens에 쓸 수 있는 값 (all 제외). */
export const prophetLensIds = LENS_REGISTRY.map((lens) => lens.id) as [ProphetLens, ...ProphetLens[]];

/** 질의에 쓸 수 있는 값 (all 포함). */
export const lensIds = ["all", ...prophetLensIds] as [Lens, ...Lens[]];

export function lensDefinition(id: ProphetLens): LensDefinition {
  return LENS_REGISTRY.find((lens) => lens.id === id)!;
}
