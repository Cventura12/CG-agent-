import { useQuery } from "@tanstack/react-query";

import { fetchUsageAnalytics } from "../api/analytics";

export function useAnalytics(gcId: string | null, days = 30) {
  return useQuery({
    queryKey: ["analytics", gcId ?? "anonymous", days],
    queryFn: () => fetchUsageAnalytics(days),
    enabled: Boolean(gcId),
    staleTime: 30000,
  });
}
