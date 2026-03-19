import { useEffect } from "react";

import { useAppStore } from "../store/appStore";

export function useVoiceSessions(pollMs = 20000) {
  const refreshVoiceSessions = useAppStore((state) => state.refreshVoiceSessions);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (cancelled) {
        return;
      }
      await refreshVoiceSessions();
    };

    void run();
    const intervalId = window.setInterval(() => {
      void run();
    }, pollMs);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [pollMs, refreshVoiceSessions]);
}
