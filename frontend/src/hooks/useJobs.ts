import { useQuery } from "@tanstack/react-query";

import { fetchJobs } from "../api/jobs";

export function useJobs(gcId: string | null) {
  return useQuery({
    queryKey: ["jobs", gcId ?? "anonymous"],
    queryFn: () => fetchJobs(),
    enabled: Boolean(gcId),
    staleTime: 30000,
  });
}
