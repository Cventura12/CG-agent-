import { publicApiClient } from "./client";
import type { BriefingPayload } from "../types";

const betaContractorId =
  (import.meta.env.VITE_BETA_CONTRACTOR_ID as string | undefined)?.trim() ??
  "00000000-0000-0000-0000-000000000001";

const betaApiKey = (import.meta.env.VITE_BETA_API_KEY as string | undefined)?.trim() ?? "";

export function hasContractorApiCredentials(): boolean {
  return Boolean(betaContractorId && betaApiKey);
}

export async function fetchContractorBriefing(): Promise<BriefingPayload> {
  if (!betaApiKey) {
    throw new Error("VITE_BETA_API_KEY is required for briefing requests");
  }

  const response = await publicApiClient.get<BriefingPayload>("/briefing", {
    params: {
      contractor_id: betaContractorId,
    },
    headers: {
      "X-API-Key": betaApiKey,
    },
  });

  return response.data;
}
