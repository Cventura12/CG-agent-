import { useQuery } from "@tanstack/react-query";

import { fetchJobs } from "../api/jobs";
import { loadCachedJson, saveCachedJson } from "../utils/offlineCache";
import type { JobsListPayload } from "../types";

function cacheKey(gcId: string | null): string {
  return `gc-agent:cache:jobs:${gcId ?? "anonymous"}`;
}

export function useJobs(gcId: string | null) {
  const storageKey = cacheKey(gcId);
  const initialData = loadCachedJson<JobsListPayload>(storageKey) ?? undefined;

  return useQuery({
    queryKey: ["jobs", gcId ?? "anonymous"],
    queryFn: async () => {
      const payload = await fetchJobs();
      saveCachedJson(storageKey, payload);
      return payload;
    },
    enabled: Boolean(gcId),
    staleTime: 30000,
    retry: (failureCount) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return false;
      }
      return failureCount < 2;
    },
    initialData,
  });
}
