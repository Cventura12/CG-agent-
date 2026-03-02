import { publicApiClient } from "./client";
import type { QuoteResponse } from "../types";

const betaContractorId =
  (import.meta.env.VITE_BETA_CONTRACTOR_ID as string | undefined)?.trim() ??
  "00000000-0000-0000-0000-000000000001";

const betaApiKey = (import.meta.env.VITE_BETA_API_KEY as string | undefined)?.trim() ?? "";

export function hasBetaApiCredentials(): boolean {
  return Boolean(betaApiKey && betaContractorId);
}

export function getBetaContractorId(): string {
  return betaContractorId;
}

export async function submitQuote(input: string): Promise<QuoteResponse> {
  if (!betaApiKey) {
    throw new Error("VITE_BETA_API_KEY is required for quote submission");
  }

  const response = await publicApiClient.post<QuoteResponse>(
    "/quote",
    {
      input,
      contractor_id: betaContractorId,
    },
    {
      headers: {
        "X-API-Key": betaApiKey,
      },
    }
  );

  return response.data;
}

export async function fetchQuotePdf(quoteId: string): Promise<Blob> {
  if (!betaApiKey) {
    throw new Error("VITE_BETA_API_KEY is required for quote PDF requests");
  }

  const response = await publicApiClient.get<ArrayBuffer>(`/quote/${quoteId}/pdf`, {
    params: {
      contractor_id: betaContractorId,
    },
    headers: {
      "X-API-Key": betaApiKey,
    },
    responseType: "arraybuffer",
  });

  return new Blob([response.data], { type: "application/pdf" });
}
