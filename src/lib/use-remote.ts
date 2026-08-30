"use client";

import { useEffect, useState } from "react";

export type RemoteState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; message: string };

/**
 * 정적 번들에는 서버 렌더링이 없으므로, 서버 컴포넌트가 하던 읽기를
 * 클라이언트에서 한 번 수행한다. load는 useCallback으로 고정해서 넘긴다.
 */
export function useRemote<T>(load: (signal: AbortSignal) => Promise<T>): RemoteState<T> {
  const [state, setState] = useState<RemoteState<T>>({ status: "loading" });
  const [tracked, setTracked] = useState(() => load);

  // load가 바뀌면(예: 문서 id 변경) 이전 결과를 그대로 보여주지 않고 렌더 중에 되돌린다.
  if (tracked !== load) {
    setTracked(() => load);
    setState({ status: "loading" });
  }

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .then((data) => setState({ status: "ready", data }))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setState({ status: "error", message: error instanceof Error ? error.message : "불러오지 못했습니다." });
      });
    return () => controller.abort();
  }, [load]);

  return state;
}
