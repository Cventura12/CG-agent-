import { useQuery } from "@tanstack/react-query";

import { fetchQueue } from "../api/queue";

export function useQueue(gcId: string | null) {
  return useQuery({
    queryKey: ["queue", gcId ?? "anonymous"],
    queryFn: () => fetchQueue(),
    enabled: Boolean(gcId),
    refetchInterval: 30000,
  });
}
