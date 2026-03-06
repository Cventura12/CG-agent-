import { useEffect, useRef } from "react";

import { useQueue } from "./useQueue";

export function useQueueNotificationStub(gcId: string | null): void {
  const queueQuery = useQueue(gcId);
  const lastQueueCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (!gcId || queueQuery.isLoading || queueQuery.isError) {
      return;
    }

    const nextCount = (queueQuery.data?.jobs ?? []).reduce((total, group) => total + group.drafts.length, 0);

    if (lastQueueCountRef.current === null) {
      lastQueueCountRef.current = nextCount;
      return;
    }

    const previousCount = lastQueueCountRef.current;
    lastQueueCountRef.current = nextCount;

    if (nextCount <= previousCount) {
      return;
    }

    if (!("Notification" in window)) {
      console.info(`GC Agent queue update: ${nextCount} item(s) waiting.`);
      return;
    }

    if (Notification.permission === "granted") {
      const body =
        nextCount === 1 ? "1 draft is waiting for review." : `${nextCount} drafts are waiting for review.`;
      new Notification("GC Agent queue update", { body });
      return;
    }

    if (Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, [gcId, queueQuery.data, queueQuery.isError, queueQuery.isLoading]);
}
