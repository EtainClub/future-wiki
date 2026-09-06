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
  {
    // 유기(1311-1375) 귀속이나 청 말 황제까지 언급하므로 현전 형태는 후대 성립이다.
    id: "liubowen",
    label: "유백온",
    short: "왕조 흥망을 문답으로 읽는 관점",
    method: "dynastic-cycle",
    recordReliability: "C",
    lifespan: "1311-1375",
    region: "중국",
  },
  {
    // 말라키(1094-1148) 귀속이나 텍스트는 1595년에야 처음 나타난다. 약 450년의 공백이 있다.
    id: "malachy",
    label: "성 말라키",
    short: "교황 계승을 표어로 읽는 관점",
    method: "posthumous-attribution",
    recordReliability: "D",
    lifespan: "1094-1148",
    region: "아일랜드",
  },
  {
    // 어슐라 사우사일(통칭 Mother Shipton). 본인 기록은 없고 현전 최고본은 사후 80년 뒤인 1641년 팸플릿이다.
    // 유명한 "말 없는 마차" 예언은 1862년 Charles Hindley의 위조이며 본인이 1873년에 자백했다.
    // 위조가 문헌사적으로 입증된 드문 사례라 사후 귀속의 구조를 보여 주는 대조군으로 쓴다.
    id: "mothershipton",
    label: "마더 쉽턴",
    short: "잉글랜드 예언 전승과 후대 위조가 겹친 관점",
    method: "posthumous-attribution",
    recordReliability: "D",
    lifespan: "1488?-1561",
    region: "잉글랜드",
  },
  {
    // 1955년 간행된 익명 계시 문헌. 개인 저작으로 귀속되지 않아 화자를 사람 단위로 확인할 수 없다.
    // 지구재앙·전쟁·진화와 미래 국면(빛과 생명의 시대)을 다루는 10편만 수집했다.
    id: "urantia",
    label: "유란시아",
    short: "행성의 진화와 미래 국면을 다루는 계시 문헌",
    method: "clairvoyance",
    recordReliability: "C",
    lifespan: "1955년 간행",
    region: "미국",
  },
  {
    // 저자와 간행 시점이 모두 분명한 드문 경우다. 기록 신뢰도는 A지만 내용은 현대 천문학과 어긋난다.
    // 기록 신뢰도와 적중 여부가 서로 다른 축임을 보여 주는 대조군으로 쓴다.
    id: "swedenborg",
    label: "스베덴보리",
    short: "보고 들은 것으로 기록한 환시의 관점",
    method: "religious-vision",
    recordReliability: "A",
    lifespan: "1688-1772",
    region: "스웨덴",
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
