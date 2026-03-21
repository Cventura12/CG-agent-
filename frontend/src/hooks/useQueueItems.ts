import { useEffect } from "react";

import { useAppStore } from "../store/appStore";

export function useQueueItems(pollMs = 20000) {
  const refreshQueueItems = useAppStore((state) => state.refreshQueueItems);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (cancelled) {
        return;
      }
      await refreshQueueItems();
    };

    void run();
    const intervalId = window.setInterval(() => {
      void run();
    }, pollMs);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [pollMs, refreshQueueItems]);
}
