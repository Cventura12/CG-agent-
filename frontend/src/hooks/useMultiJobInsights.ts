import { useQuery } from "@tanstack/react-query";

import { fetchMultiJobInsights } from "../api/insights";

export function useMultiJobInsights(gcId: string | null, horizonDays: number) {
  return useQuery({
    queryKey: ["insights", "multi-job", gcId ?? "anonymous", horizonDays],
    queryFn: () => fetchMultiJobInsights(horizonDays),
    enabled: Boolean(gcId),
    staleTime: 30000,
  });
}

