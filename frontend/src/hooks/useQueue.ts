ï»¿import { useQuery } from "@tanstack/react-query";

import { fetchQueue } from "../api/queue";
import { loadCachedJson, saveCachedJson } from "../utils/offlineCache";
import type { QueuePayload } from "../types";

function cacheKey(gcId: string | null): string {
  return `gc-agent:cache:queue:${gcId ?? "anonymous"}`;
}

export function useQueue(gcId: string | null) {
  const storageKey = cacheKey(gcId);
  const initialData = loadCachedJson<QueuePayload>(storageKey) ?? undefined;

  return useQuery({
    queryKey: ["queue", gcId ?? "anonymous"],
    queryFn: async () => {
      const payload = await fetchQueue();
      saveCachedJson(storageKey, payload);
      return payload;
    },
    enabled: Boolean(gcId),
    refetchInterval: 30000,
    retry: (failureCount) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return false;
      }
      return failureCount < 2;
    },
    initialData,
  });
}
