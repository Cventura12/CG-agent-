import { useQuery } from "@tanstack/react-query";

import { fetchReferrals } from "../api/referrals";

export function useReferrals(gcId: string | null) {
  return useQuery({
    queryKey: ["referrals", gcId ?? "anonymous"],
    queryFn: () => fetchReferrals(),
    enabled: Boolean(gcId),
    staleTime: 30000,
  });
}
