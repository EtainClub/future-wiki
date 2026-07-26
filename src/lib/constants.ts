import type { Lens } from "./wiki/schema";

export const LENSES: Array<{ id: Lens; label: string; short: string }> = [
  { id: "all", label: "전체 지혜", short: "모든 체계를 함께 봅니다" },
  { id: "tanheo", label: "탄허", short: "탄허의 사상과 시대 인식" },
  { id: "iching", label: "주역", short: "변화의 구조와 괘의 원리" },
  { id: "jeongyeok", label: "정역", short: "후천 전환과 순환의 관점" },
  { id: "nostradamus", label: "노스트라다무스", short: "상징적 예언의 관점" },
];

export const EXAMPLE_QUESTIONS = [
  "기후 변화는 앞으로 우리의 삶을 어떻게 바꿀까?",
  "2030년대 동아시아 질서는 어떤 전환을 겪을까?",
  "AI의 확산을 변화의 원리로 해석하면 무엇이 보일까?",
];

export const DISCLAIMER = "본 서비스는 인문학적 탐구·오락 목적이며 실제 미래를 보증하지 않습니다.";
