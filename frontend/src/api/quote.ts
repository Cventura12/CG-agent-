import { publicApiClient } from "./client";
import type {
  QuoteDecisionResponse,
  QuoteDeliveryResponse,
  QuoteResponse,
  QuoteSendResponse,
} from "../types";

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

export async function fetchQuoteDelivery(quoteId: string): Promise<QuoteDeliveryResponse> {
  if (!betaApiKey) {
    throw new Error("VITE_BETA_API_KEY is required for quote delivery history");
  }

  const response = await publicApiClient.get<QuoteDeliveryResponse>(`/quote/${quoteId}/delivery`, {
    params: {
      contractor_id: betaContractorId,
    },
    headers: {
      "X-API-Key": betaApiKey,
    },
  });

  return response.data;
}

export async function approveQuote(quoteId: string, feedbackNote = ""): Promise<QuoteDecisionResponse> {
  if (!betaApiKey) {
    throw new Error("VITE_BETA_API_KEY is required for quote approval");
  }

  const response = await publicApiClient.post<QuoteDecisionResponse>(
    `/quote/${quoteId}/approve`,
    {
      contractor_id: betaContractorId,
      feedback_note: feedbackNote,
    },
    {
      headers: {
        "X-API-Key": betaApiKey,
      },
    }
  );

  return response.data;
}

export async function editQuote(
  quoteId: string,
  payload: {
    edited_scope_of_work: string;
    edited_total_price: number | null;
    feedback_note?: string;
  }
): Promise<QuoteDecisionResponse> {
  if (!betaApiKey) {
    throw new Error("VITE_BETA_API_KEY is required for quote editing");
  }

  const response = await publicApiClient.post<QuoteDecisionResponse>(
    `/quote/${quoteId}/edit`,
    {
      contractor_id: betaContractorId,
      edited_scope_of_work: payload.edited_scope_of_work,
      edited_total_price: payload.edited_total_price,
      feedback_note: payload.feedback_note ?? "",
    },
    {
      headers: {
        "X-API-Key": betaApiKey,
      },
    }
  );

  return response.data;
}

export async function discardQuote(quoteId: string, feedbackNote = ""): Promise<QuoteDecisionResponse> {
  if (!betaApiKey) {
    throw new Error("VITE_BETA_API_KEY is required for quote discard");
  }

  const response = await publicApiClient.post<QuoteDecisionResponse>(
    `/quote/${quoteId}/discard`,
    {
      contractor_id: betaContractorId,
      feedback_note: feedbackNote,
    },
    {
      headers: {
        "X-API-Key": betaApiKey,
      },
    }
  );

  return response.data;
}

export async function sendQuoteToClient(
  quoteId: string,
  payload: {
    channel: "whatsapp" | "sms" | "email";
    destination: string;
    recipient_name?: string;
    message_override?: string;
  }
): Promise<QuoteSendResponse> {
  if (!betaApiKey) {
    throw new Error("VITE_BETA_API_KEY is required for quote delivery");
  }

  const response = await publicApiClient.post<QuoteSendResponse>(
    `/quote/${quoteId}/send`,
    {
      contractor_id: betaContractorId,
      channel: payload.channel,
      destination: payload.destination,
      recipient_name: payload.recipient_name ?? "",
      message_override: payload.message_override ?? "",
    },
    {
      headers: {
        "X-API-Key": betaApiKey,
      },
    }
  );

  return response.data;
}
