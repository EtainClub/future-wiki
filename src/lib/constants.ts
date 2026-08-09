import { LENS_REGISTRY } from "./wiki/lenses";
import type { Lens } from "./wiki/schema";

/** UI 목록은 LENS_REGISTRY에서 파생된다. 예언가 추가는 lenses.ts만 고친다. */
export const LENSES: Array<{ id: Lens; label: string; short: string }> = [
  { id: "all", label: "전체 지혜", short: "모든 체계를 함께 봅니다" },
  ...LENS_REGISTRY.map((lens) => ({ id: lens.id as Lens, label: lens.label, short: lens.short })),
];

export const EXAMPLE_QUESTIONS = [
  "기후 변화는 앞으로 우리의 삶을 어떻게 바꿀까?",
  "2030년대 동아시아 질서는 어떤 전환을 겪을까?",
  "AI의 확산을 변화의 원리로 해석하면 무엇이 보일까?",
];

export const DISCLAIMER = "본 서비스는 인문학적 탐구·오락 목적이며 실제 미래를 보증하지 않습니다.";
