import type { Lens } from "./wiki/schema";

export const HISTORY_KEY = "future-wiki-history:v1";
export const LEGACY_HISTORY_KEY = "future-wiki-history";
const VALID_LENSES = new Set<Lens>(["all", "tanheo", "iching", "jeongyeok", "nostradamus"]);

export type HistoryItem = {
  id: string;
  question: string;
  lens: Lens;
  createdAt: string;
  prediction?: string;
};

function isHistoryItem(value: unknown): value is HistoryItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string"
    && typeof item.question === "string"
    && VALID_LENSES.has(item.lens as Lens)
    && typeof item.createdAt === "string"
    && Number.isFinite(Date.parse(item.createdAt))
    && (item.prediction === undefined || typeof item.prediction === "string");
}

export function parseHistory(snapshot: string): HistoryItem[] {
  try {
    const parsed: unknown = JSON.parse(snapshot);
    return Array.isArray(parsed) ? parsed.filter(isHistoryItem) : [];
  } catch {
    return [];
  }
}

export function historySnapshot(storage: Storage): string {
  return storage.getItem(HISTORY_KEY) ?? storage.getItem(LEGACY_HISTORY_KEY) ?? "[]";
}