import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { UserButton, useClerk } from "@clerk/clerk-react";
import { Link, useLocation } from "react-router-dom";
import { Loader2, Mic, Send, Square, TriangleAlert } from "lucide-react";

import {
  approveQuote,
  discardQuote,
  editQuote,
  fetchQuoteDelivery,
  fetchQuotePdf,
  getBetaContractorId,
  hasBetaApiCredentials,
  sendQuoteToClient,
  submitQuote,
} from "../api/quote";
import type {
  QuoteApprovalStatus,
  QuoteDeliveryAttempt,
  QuoteDraft,
  QuoteLineItem,
  QuoteResponse,
} from "../types";

const bypassAuth = import.meta.env.VITE_BYPASS_AUTH === "true";

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type BrowserSpeechRecognition = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  start: () => void;
  stop: () => void;
};

type BrowserSpeechRecognitionEvent = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      0: {
        transcript: string;
      };
    };
  };
};

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

type ShareNavigator = Navigator & {
  canShare?: (data?: { files?: File[] }) => boolean;
  share?: (data?: { files?: File[]; title?: string; text?: string }) => Promise<void>;
};

type QuoteDecisionAction = "approve" | "edit" | "discard";
type QuoteInputSource = "manual" | "voice";

type OfflineQueuedQuote = {
  id: string;
  input: string;
  source: QuoteInputSource;
  created_at: string;
};

type QuoteSubmissionRequest = {
  input: string;
  source: QuoteInputSource;
};

const QUOTE_NOTES_STORAGE_KEY = "gc-agent:quote:notes:v1";
const QUOTE_OFFLINE_QUEUE_STORAGE_KEY = "gc-agent:quote:offline-queue:v1";
const ACTIVE_QUOTE_STORAGE_KEY = "gc-agent:quote:active:v1";

function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function loadStoredNotes(): string {
  if (!hasLocalStorage()) {
    return "";
  }

  try {
    return window.localStorage.getItem(QUOTE_NOTES_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveStoredNotes(value: string): void {
  if (!hasLocalStorage()) {
    return;
  }

  try {
    if (value.trim()) {
      window.localStorage.setItem(QUOTE_NOTES_STORAGE_KEY, value);
    } else {
      window.localStorage.removeItem(QUOTE_NOTES_STORAGE_KEY);
    }
  } catch {
    // Ignore localStorage errors so quote flow still works.
  }
}

function loadOfflineQueue(): OfflineQueuedQuote[] {
  if (!hasLocalStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(QUOTE_OFFLINE_QUEUE_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const value = entry as Record<string, unknown>;
        const source = value.source === "voice" ? "voice" : "manual";
        if (typeof value.input !== "string" || typeof value.id !== "string") {
          return null;
        }
        return {
          id: value.id,
          input: value.input,
          source,
          created_at:
            typeof value.created_at === "string" && value.created_at
              ? value.created_at
              : new Date().toISOString(),
        } satisfies OfflineQueuedQuote;
      })
      .filter((entry): entry is OfflineQueuedQuote => Boolean(entry));
  } catch {
    return [];
  }
}

function saveOfflineQueue(queue: OfflineQueuedQuote[]): void {
  if (!hasLocalStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(QUOTE_OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Ignore localStorage errors so quote flow still works.
  }
}

function loadStoredActiveQuote(): QuoteResponse | null {
  if (!hasLocalStorage()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(ACTIVE_QUOTE_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const candidate = parsed as Record<string, unknown>;
    if (typeof candidate.quote_id !== "string" || !candidate.quote_id.trim()) {
      return null;
    }
    if (!candidate.quote_draft || typeof candidate.quote_draft !== "object") {
      return null;
    }
    return candidate as unknown as QuoteResponse;
  } catch {
    return null;
  }
}

function saveStoredActiveQuote(value: QuoteResponse | null): void {
  if (!hasLocalStorage()) {
    return;
  }

  try {
    if (value) {
      window.localStorage.setItem(ACTIVE_QUOTE_STORAGE_KEY, JSON.stringify(value));
    } else {
      window.localStorage.removeItem(ACTIVE_QUOTE_STORAGE_KEY);
    }
  } catch {
    // Ignore localStorage errors so quote flow still works.
  }
}

function buildOfflineQueueId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  const speechWindow = window as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function formatCurrency(value: number | undefined): string {
  const normalized = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(normalized);
}

function formatDeliveryTimestamp(value: string | null): string {
  if (!value) {
    return "Timestamp pending";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function deliveryStatusTone(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized === "delivered") {
    return "border-green/40 bg-green/10 text-green";
  }
  if (normalized === "sent" || normalized === "queued" || normalized === "accepted") {
    return "border-orange/40 bg-orange/10 text-orange";
  }
  if (normalized === "pending" || normalized === "scheduled") {
    return "border-yellow/50 bg-yellow/10 text-yellow";
  }
  return "border-red-400/40 bg-red-400/10 text-red-200";
}

function lineItemLabel(item: QuoteLineItem): string {
  return item.item ?? item.name ?? "Line item";
}

function lineItemTotal(item: QuoteLineItem): number {
  if (typeof item.total_cost === "number" && Number.isFinite(item.total_cost)) {
    return item.total_cost;
  }
  const quantity = typeof item.quantity === "number" ? item.quantity : 0;
  const unitCost = typeof item.unit_cost === "number" ? item.unit_cost : 0;
  return quantity * unitCost;
}

function QuotePreviewCard({ quote }: { quote: QuoteDraft }) {
  const lineItems = Array.isArray(quote.line_items) ? quote.line_items : [];

  return (
    <article className="rounded-2xl border border-border bg-surface p-4 shadow-lg shadow-black/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-orange">Quote Draft</p>
          <h2 className="mt-1 text-lg font-semibold text-text">{quote.company_name}</h2>
          <p className="text-sm text-muted">{quote.project_address || "Project address pending"}</p>
        </div>
        <div className="rounded-xl border border-green/40 bg-green/10 px-4 py-3 text-right">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-green">Price</p>
          <p className="mt-1 text-xl font-semibold text-text">{formatCurrency(quote.total_price)}</p>
        </div>
      </div>

      <section className="mt-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Scope</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-text/90">{quote.scope_of_work}</p>
      </section>

      <section className="mt-5">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Materials</p>
          <p className="text-xs text-muted">{lineItems.length} item(s)</p>
        </div>
        <div className="mt-3 space-y-2">
          {lineItems.length === 0 ? (
            <p className="rounded-xl border border-border bg-bg px-3 py-3 text-sm text-muted">
              Material line items were not returned.
            </p>
          ) : (
            lineItems.map((item, index) => (
              <div
                key={`${lineItemLabel(item)}-${index}`}
                className="rounded-xl border border-border bg-bg px-3 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-text">{lineItemLabel(item)}</p>
                    <p className="mt-1 text-xs text-muted">
                      {item.quantity ?? 0} {item.unit ?? "unit"}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-text">{formatCurrency(lineItemTotal(item))}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-bg px-3 py-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Terms</p>
          <p className="mt-2 text-sm leading-6 text-text/90">
            {quote.approval_notes || "Field conditions and hidden damage are subject to final review."}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-bg px-3 py-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Exclusions</p>
          <ul className="mt-2 space-y-2 text-sm leading-6 text-text/90">
            {quote.exclusions.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-orange" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </article>
  );
}

function ConfidenceBadge({
  confidence,
}: {
  confidence: QuoteResponse["estimate_confidence"];
}) {
  const tone =
    confidence.level === "high"
      ? "border-green/40 bg-green/10 text-green"
      : confidence.level === "medium"
      ? "border-yellow/50 bg-yellow/10 text-yellow"
      : "border-red-400/40 bg-red-400/10 text-red-200";

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-lg shadow-black/20">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Estimate confidence</p>
        <span className={`rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] ${tone}`}>
          {confidence.level} ({confidence.score})
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {confidence.reasons.map((reason) => (
          <p key={reason} className="rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text/90">
            {reason}
          </p>
        ))}
      </div>
    </section>
  );
}

function AssumptionsCard({
  assumptions,
  clarificationQuestions,
  coldStart,
}: {
  assumptions: string[];
  clarificationQuestions: string[];
  coldStart: QuoteResponse["cold_start"];
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-lg shadow-black/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Assumptions to confirm</p>
        {coldStart.active ? (
          <span className="rounded-full border border-yellow/50 bg-yellow/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-yellow">
            Cold start
          </span>
        ) : null}
      </div>

      {coldStart.active ? (
        <p className="mt-2 rounded-xl border border-yellow/40 bg-yellow/10 px-3 py-2 text-sm text-yellow">
          Limited memory signal found. This draft used template defaults for{" "}
          {coldStart.primary_trade.replace("_", " ")}.
        </p>
      ) : null}

      <div className="mt-3 space-y-2">
        {assumptions.length > 0 ? (
          assumptions.map((item) => (
            <p key={item} className="rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text/90">
              {item}
            </p>
          ))
        ) : (
          <p className="rounded-xl border border-border bg-bg px-3 py-2 text-sm text-muted">
            No explicit assumptions were returned.
          </p>
        )}
      </div>

      {clarificationQuestions.length > 0 ? (
        <div className="mt-3 rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-red-200">Open clarification items</p>
          <ul className="mt-2 space-y-1 text-sm text-red-100">
            {clarificationQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function QuotePage() {
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const autoSubmitRef = useRef(false);
  const latestTranscriptRef = useRef("");
  const wasOnlineRef = useRef(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  const [notes, setNotes] = useState(() => loadStoredNotes());
  const [isRecording, setIsRecording] = useState(false);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueuedQuote[]>(() =>
    loadOfflineQueue()
  );
  const [queueMessage, setQueueMessage] = useState<string | null>(null);
  const [isQueueSyncing, setIsQueueSyncing] = useState(false);
  const [voiceSupported] = useState(() => Boolean(getSpeechRecognitionConstructor()));
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [activeQuote, setActiveQuote] = useState<QuoteResponse | null>(() => loadStoredActiveQuote());
  const [editedScopeOfWork, setEditedScopeOfWork] = useState("");
  const [editedTotalPrice, setEditedTotalPrice] = useState("");
  const [feedbackNote, setFeedbackNote] = useState("");
  const [decisionStatus, setDecisionStatus] = useState<QuoteApprovalStatus | null>(null);
  const [decisionMessage, setDecisionMessage] = useState<string | null>(null);
  const [deliveryChannel, setDeliveryChannel] = useState<"whatsapp" | "sms" | "email">("whatsapp");
  const [deliveryDestination, setDeliveryDestination] = useState("");
  const [deliveryRecipientName, setDeliveryRecipientName] = useState("");
  const [deliveryMessageOverride, setDeliveryMessageOverride] = useState("");
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null);
  const [deliveryHistory, setDeliveryHistory] = useState<QuoteDeliveryAttempt[]>([]);
  const [isDeliveryHistoryLoading, setIsDeliveryHistoryLoading] = useState(false);

  const { signOut } = useClerk();
  const location = useLocation();
  const apiReady = hasBetaApiCredentials();
  const firstSessionMode = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("first_session") === "1";
  }, [location.search]);

  const applyQuoteSuccess = useCallback((payload: QuoteResponse) => {
    setActiveQuote(payload);
    setEditedScopeOfWork(payload.quote_draft.scope_of_work ?? "");
    setEditedTotalPrice(String(payload.quote_draft.total_price ?? ""));
    setFeedbackNote("");
    setDecisionStatus(null);
    setDecisionMessage(null);
    setDeliveryDestination("");
    setDeliveryRecipientName(payload.quote_draft.customer_name ?? "");
    setDeliveryMessageOverride("");
    setDeliveryMessage(null);
    setDeliveryHistory([]);
    setShareMessage(null);
    setQueueMessage(null);
    if (payload.errors.length > 0) {
      setCaptureError(payload.errors[0] ?? null);
    } else {
      setCaptureError(null);
    }
  }, []);

  const enqueueOfflineQuote = useCallback((input: string, source: QuoteInputSource) => {
    const trimmed = input.trim();
    if (!trimmed) {
      return;
    }

    const nextEntry: OfflineQueuedQuote = {
      id: buildOfflineQueueId(),
      input: trimmed,
      source,
      created_at: new Date().toISOString(),
    };

    setOfflineQueue((current) => [...current, nextEntry]);
    setNotes("");
    setActiveQuote(null);
    setCaptureError(null);
    setShareMessage(null);
    setDecisionStatus(null);
    setDecisionMessage(null);
    setDeliveryMessage(null);
    setQueueMessage(
      "Offline mode: notes saved locally and queued. They will sync when you reconnect."
      );
  }, []);

  const loadDeliveryHistory = useCallback(
    async (quoteId: string) => {
      if (!apiReady || !quoteId.trim()) {
        setDeliveryHistory([]);
        return;
      }

      setIsDeliveryHistoryLoading(true);
      try {
        const payload = await fetchQuoteDelivery(quoteId);
        setDeliveryHistory(Array.isArray(payload.deliveries) ? payload.deliveries : []);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Could not refresh quote delivery status.";
        setCaptureError(message);
      } finally {
        setIsDeliveryHistoryLoading(false);
      }
    },
    [apiReady]
  );

  const quoteMutation = useMutation({
    mutationFn: async ({ input }: QuoteSubmissionRequest) => submitQuote(input),
    onSuccess: applyQuoteSuccess,
    onError: (error, variables) => {
      const currentlyOnline =
        typeof navigator === "undefined" ? true : navigator.onLine;
      if (!currentlyOnline) {
        enqueueOfflineQuote(variables.input, variables.source);
        return;
      }
      const message =
        error instanceof Error ? error.message : "Quote request failed. Check API key and contractor ID.";
      setCaptureError(message);
    },
  });

  const syncQueuedNotes = useCallback(async () => {
    if (isQueueSyncing || quoteMutation.isPending) {
      return;
    }
    if (!apiReady) {
      setQueueMessage("Set VITE_BETA_API_KEY and VITE_BETA_CONTRACTOR_ID before syncing queued notes.");
      return;
    }
    if (!isOnline) {
      setQueueMessage("Still offline. Queued notes will sync after reconnection.");
      return;
    }
    if (offlineQueue.length === 0) {
      setQueueMessage("No queued notes waiting to sync.");
      return;
    }

    setIsQueueSyncing(true);
    setCaptureError(null);
    let pending = [...offlineQueue];
    let syncedCount = 0;

    while (pending.length > 0) {
      const queued = pending[0];
      if (!queued) {
        break;
      }
      try {
        const payload = await submitQuote(queued.input);
        applyQuoteSuccess(payload);
        pending = pending.slice(1);
        syncedCount += 1;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to sync all queued notes.";
        setCaptureError(message);
        break;
      }
    }

    setOfflineQueue(pending);
    if (pending.length === 0) {
      setQueueMessage(
        `Synced ${syncedCount} queued note${syncedCount === 1 ? "" : "s"}.`
      );
    } else {
      setQueueMessage(
        `Synced ${syncedCount} queued note${syncedCount === 1 ? "" : "s"}. ${pending.length} still queued.`
      );
    }
    setIsQueueSyncing(false);
  }, [
    apiReady,
    applyQuoteSuccess,
    isOnline,
    isQueueSyncing,
    offlineQueue,
    quoteMutation.isPending,
  ]);

  const submitInput = useCallback(
    (input: string, source: QuoteInputSource) => {
      const trimmed = input.trim();
      if (!trimmed || quoteMutation.isPending || isQueueSyncing) {
        return;
      }

      setActiveQuote(null);
      setCaptureError(null);
      setShareMessage(null);
      setDecisionStatus(null);
    setDecisionMessage(null);
    setDeliveryMessage(null);
    setDeliveryHistory([]);
    setQueueMessage(null);
    latestTranscriptRef.current = trimmed;

      if (!isOnline) {
        enqueueOfflineQuote(trimmed, source);
        return;
      }

      quoteMutation.mutate({ input: trimmed, source });
    },
    [enqueueOfflineQuote, isOnline, isQueueSyncing, quoteMutation]
  );

  useEffect(() => {
    if (!activeQuote) {
      saveStoredActiveQuote(null);
      return;
    }
    saveStoredActiveQuote(activeQuote);
    setEditedScopeOfWork(activeQuote.quote_draft.scope_of_work ?? "");
    setEditedTotalPrice(String(activeQuote.quote_draft.total_price ?? ""));
    setDeliveryRecipientName(
      (current) => current || (activeQuote.quote_draft.customer_name ?? "")
    );
  }, [activeQuote]);

  useEffect(() => {
    if (!activeQuote?.quote_id) {
      setDeliveryHistory([]);
      return;
    }
    if (!apiReady) {
      return;
    }
    void loadDeliveryHistory(activeQuote.quote_id);
  }, [activeQuote?.quote_id, apiReady, loadDeliveryHistory]);

  useEffect(() => {
    saveStoredNotes(notes);
  }, [notes]);

  useEffect(() => {
    saveOfflineQueue(offlineQueue);
  }, [offlineQueue]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleOnline = () => {
      setIsOnline(true);
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const becameOnline = !wasOnlineRef.current && isOnline;
    wasOnlineRef.current = isOnline;
    if (becameOnline && offlineQueue.length > 0 && apiReady) {
      void syncQueuedNotes();
    }
  }, [apiReady, isOnline, offlineQueue.length, syncQueuedNotes]);

  const sendMutation = useMutation({
    mutationFn: async (quote: QuoteResponse) => {
      const pdfBlob = await fetchQuotePdf(quote.quote_id);
      const filename = `gc-agent-quote-${quote.quote_id}.pdf`;
      const file = new File([pdfBlob], filename, { type: "application/pdf" });
      const shareNavigator = navigator as ShareNavigator;

      if (
        shareNavigator.share &&
        (!shareNavigator.canShare || shareNavigator.canShare({ files: [file] }))
      ) {
        await shareNavigator.share({
          title: `Quote for ${quote.quote_draft.customer_name || "customer"}`,
          text: quote.quote_draft.project_address || "GC Agent quote ready to send",
          files: [file],
        });
        return "PDF generated and opened in the native share sheet.";
      }

      const objectUrl = window.URL.createObjectURL(pdfBlob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => {
        window.URL.revokeObjectURL(objectUrl);
      }, 60000);
      return "PDF opened in a new tab for download or manual sharing.";
    },
    onSuccess: (message) => {
      setShareMessage(message);
      setCaptureError(null);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Could not generate quote PDF.";
      setCaptureError(message);
      setShareMessage(null);
    },
  });

  const directDeliveryMutation = useMutation({
    mutationFn: async () => {
      if (!activeQuote) {
        throw new Error("No active quote to send.");
      }
      const destination = deliveryDestination.trim();
      if (!destination) {
        throw new Error("Enter a destination phone number.");
      }
      return sendQuoteToClient(activeQuote.quote_id, {
        channel: deliveryChannel,
        destination,
        recipient_name: deliveryRecipientName.trim(),
        message_override: deliveryMessageOverride.trim(),
      });
    },
    onSuccess: (payload) => {
      setDeliveryMessage(
        `Quote sent via ${payload.channel.toUpperCase()} to ${payload.destination}.`
      );
      setCaptureError(null);
      void loadDeliveryHistory(payload.quote_id);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Could not send quote to customer.";
      setCaptureError(message);
      setDeliveryMessage(null);
    },
  });

  const decisionMutation = useMutation({
    mutationFn: async (action: QuoteDecisionAction) => {
      if (!activeQuote) {
        throw new Error("No active quote to review");
      }

      if (action === "approve") {
        return approveQuote(activeQuote.quote_id, feedbackNote);
      }

      if (action === "discard") {
        return discardQuote(activeQuote.quote_id, feedbackNote);
      }

      const parsedTotal = Number.parseFloat(editedTotalPrice);
      return editQuote(activeQuote.quote_id, {
        edited_scope_of_work: editedScopeOfWork,
        edited_total_price: Number.isFinite(parsedTotal) ? parsedTotal : null,
        feedback_note: feedbackNote,
      });
    },
    onSuccess: (payload) => {
      setDecisionStatus(payload.approval_status);
      setDecisionMessage(
        payload.memory_updated
          ? `Quote ${payload.approval_status}. Learning signal saved to estimating memory.`
          : `Quote ${payload.approval_status}.`
      );
      if (activeQuote && payload.quote_draft) {
        setActiveQuote({
          ...activeQuote,
          quote_draft: payload.quote_draft,
        });
      }
      setCaptureError(null);
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Could not save quote decision.";
      setCaptureError(message);
      setDecisionMessage(null);
    },
  });

  const helperText = useMemo(() => {
    if (!voiceSupported) {
      return "Web Speech API is unavailable in this browser. Type field notes below and send manually.";
    }
    return isRecording
      ? "Listening now. Release to send the transcript."
      : "Press and hold to capture a voice note. Release to send.";
  }, [isRecording, voiceSupported]);

  const deliveryDestinationLabel = deliveryChannel === "email" ? "Client email" : "Client phone";
  const deliveryDestinationPlaceholder =
    deliveryChannel === "email" ? "customer@example.com" : "+14235551234";

  const beginRecording = () => {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      setCaptureError("Web Speech API is not available in this browser.");
      return;
    }

    if (quoteMutation.isPending || isRecording) {
      return;
    }

    if (!recognitionRef.current) {
      const recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event) => {
        let combined = "";
        for (let index = 0; index < event.results.length; index += 1) {
          const result = event.results[index];
          if (!result) {
            continue;
          }
          combined += result[0].transcript;
        }

        const normalized = combined.trim();
        if (normalized) {
          latestTranscriptRef.current = normalized;
          setNotes(normalized);
        }
      };

      recognition.onerror = (event) => {
        const message = event.error ? `Voice capture failed: ${event.error}` : "Voice capture failed.";
        setCaptureError(message);
        setIsRecording(false);
        autoSubmitRef.current = false;
      };

      recognition.onend = () => {
        setIsRecording(false);
        const transcript = latestTranscriptRef.current.trim();
        if (autoSubmitRef.current && transcript) {
          submitInput(transcript, "voice");
        }
        autoSubmitRef.current = false;
      };

      recognitionRef.current = recognition;
    }

    setCaptureError(null);
    setActiveQuote(null);
    latestTranscriptRef.current = "";
    setNotes("");
    autoSubmitRef.current = false;
    setIsRecording(true);
    recognitionRef.current.start();
  };

  const stopRecordingAndSend = () => {
    if (!recognitionRef.current || !isRecording) {
      return;
    }

    autoSubmitRef.current = true;
    recognitionRef.current.stop();
  };

  const handleManualSubmit = () => {
    submitInput(notes, "manual");
  };

  return (
    <main className="min-h-screen bg-bg px-3 pb-10 pt-3 text-text sm:px-4">
      <div className="mx-auto max-w-2xl">
        <header className="sticky top-0 z-20 rounded-2xl border border-border bg-surface/95 p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-orange">New Quote</p>
              <h1 className="mt-1 text-lg font-semibold text-text">Voice to quote</h1>
              <p className="mt-1 text-xs text-muted">
                Contractor ID: <span className="font-mono text-text/90">{getBetaContractorId()}</span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              {bypassAuth ? (
                <span className="rounded-md border border-border px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-muted">
                  Demo Mode
                </span>
              ) : (
                <>
                  <Link
                    to="/queue"
                    className="rounded-md border border-border px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-muted transition hover:border-orange hover:text-orange"
                  >
                    Queue
                  </Link>
                  <button
                    type="button"
                    onClick={() => void signOut({ redirectUrl: "/onboarding" })}
                    className="rounded-md border border-border px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-muted transition hover:border-orange hover:text-orange"
                  >
                    Sign Out
                  </button>
                  <UserButton afterSignOutUrl="/onboarding" />
                </>
              )}
            </div>
          </div>
        </header>

        {firstSessionMode ? (
          <section className="mt-4 rounded-2xl border border-green/40 bg-green/10 p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-green">First session</p>
            <p className="mt-1 text-sm text-text/90">
              Goal: get your first approved draft in under 10 minutes. Send one real field note, review assumptions,
              then approve or edit so memory can learn your style.
            </p>
          </section>
        ) : null}

        <section className="mt-4 rounded-2xl border border-border bg-surface p-4 shadow-lg shadow-black/20">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-border bg-bg p-3">
              {apiReady ? (
                <Mic className="h-5 w-5 text-orange" aria-hidden="true" />
              ) : (
                <TriangleAlert className="h-5 w-5 text-yellow" aria-hidden="true" />
              )}
            </div>

            <div className="min-w-0">
              <p className="text-sm font-medium text-text">{helperText}</p>
              <p className="mt-1 text-sm text-muted">
                {apiReady
                  ? "Designed for a phone screen: hold the big mic button, talk, and release."
                  : "Set VITE_BETA_API_KEY and VITE_BETA_CONTRACTOR_ID in frontend/.env before sending quotes."}
              </p>
            </div>
          </div>

          <div
            className={`mt-4 rounded-xl border px-3 py-3 ${
              isOnline
                ? "border-green/40 bg-green/10"
                : "border-yellow/40 bg-yellow/10"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-text">
                {isOnline ? "Online" : "Offline"} | queued {offlineQueue.length}
              </p>

              <button
                type="button"
                onClick={() => void syncQueuedNotes()}
                disabled={
                  !apiReady ||
                  !isOnline ||
                  offlineQueue.length === 0 ||
                  isQueueSyncing ||
                  quoteMutation.isPending
                }
                className="inline-flex min-h-9 items-center justify-center rounded-lg border border-border bg-bg px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted transition hover:border-orange hover:text-orange disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isQueueSyncing ? "Syncing..." : "Sync queued notes"}
              </button>
            </div>
            <p className="mt-2 text-xs text-muted">
              If you lose signal on-site, notes are saved locally and synced after reconnect.
            </p>
          </div>

          {queueMessage ? (
            <div className="mt-3 rounded-xl border border-green/40 bg-green/10 px-4 py-3 text-sm text-green">
              {queueMessage}
            </div>
          ) : null}

          {offlineQueue.length > 0 ? (
            <div className="mt-3 rounded-xl border border-border bg-bg px-3 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                Queued note preview
              </p>
              <div className="mt-2 space-y-2">
                {offlineQueue.slice(0, 3).map((queued) => (
                  <p
                    key={queued.id}
                    className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text/90"
                  >
                    {queued.input.length > 120
                      ? `${queued.input.slice(0, 120)}...`
                      : queued.input}
                  </p>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-5">
            <button
              type="button"
              onPointerDown={beginRecording}
              onPointerUp={stopRecordingAndSend}
              onPointerLeave={stopRecordingAndSend}
              onPointerCancel={stopRecordingAndSend}
              disabled={
                !voiceSupported || !apiReady || quoteMutation.isPending || isQueueSyncing
              }
              className="flex min-h-28 w-full items-center justify-center gap-3 rounded-2xl border border-orange/50 bg-orange/10 px-5 py-6 text-left transition hover:border-orange hover:bg-orange/15 disabled:cursor-not-allowed disabled:border-border disabled:bg-bg disabled:text-muted"
              style={{ touchAction: "none" }}
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-orange text-bg">
                {isRecording ? <Square className="h-5 w-5" aria-hidden="true" /> : <Mic className="h-5 w-5" aria-hidden="true" />}
              </span>
              <span>
                <span className="block font-mono text-xs uppercase tracking-[0.2em] text-orange">
                  {isRecording ? "Recording" : "Hold to record"}
                </span>
                <span className="mt-1 block text-base font-medium text-text">
                  {isRecording ? "Release to send transcript" : "Press, talk, release"}
                </span>
              </span>
            </button>
          </div>

          <div className="mt-4">
            <label htmlFor="quote-notes" className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
              Transcript / field notes
            </label>
            <textarea
              id="quote-notes"
              value={notes}
              onChange={(event) => {
                const value = event.target.value;
                latestTranscriptRef.current = value;
                setNotes(value);
              }}
              rows={6}
              placeholder="If voice capture is unavailable, type field notes here."
              className="mt-2 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm leading-6 text-text outline-none transition focus:border-orange"
            />
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleManualSubmit}
              disabled={!apiReady || !notes.trim() || quoteMutation.isPending || isQueueSyncing}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-green px-5 py-3 text-sm font-medium text-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {quoteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              <span>
                {quoteMutation.isPending
                  ? "Running agent..."
                  : !isOnline
                  ? "Save Offline"
                  : "Send Notes"}
              </span>
            </button>

            <p className="text-sm text-muted">
              Mobile-first target: large tap zones and a single primary action from a 390px screen.
            </p>
          </div>

          {captureError ? (
            <div className="mt-4 rounded-xl border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-200">
              {captureError}
            </div>
          ) : null}
        </section>

        {activeQuote ? (
          <section className="mt-5 space-y-4">
            <ConfidenceBadge confidence={activeQuote.estimate_confidence} />
            <AssumptionsCard
              assumptions={activeQuote.assumptions ?? []}
              clarificationQuestions={activeQuote.clarification_questions ?? []}
              coldStart={
                activeQuote.cold_start ?? {
                  active: false,
                  primary_trade: "general_construction",
                }
              }
            />
            <QuotePreviewCard quote={activeQuote.quote_draft} />

            <div className="rounded-2xl border border-border bg-surface p-4 shadow-lg shadow-black/20">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Review & learn</p>
              <p className="mt-1 text-sm text-muted">
                Approve as-is, approve with edits, or discard. Approve/edit actions feed estimating memory.
              </p>

              <div className="mt-4 grid gap-3">
                <label className="text-xs uppercase tracking-[0.16em] text-muted" htmlFor="edited-scope">
                  Scope edits
                </label>
                <textarea
                  id="edited-scope"
                  value={editedScopeOfWork}
                  onChange={(event) => setEditedScopeOfWork(event.target.value)}
                  rows={5}
                  className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm leading-6 text-text outline-none transition focus:border-orange"
                />
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-[0.16em] text-muted" htmlFor="edited-total">
                    Final total price
                  </label>
                  <input
                    id="edited-total"
                    type="number"
                    value={editedTotalPrice}
                    onChange={(event) => setEditedTotalPrice(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition focus:border-orange"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.16em] text-muted" htmlFor="feedback-note">
                    Feedback note (optional)
                  </label>
                  <input
                    id="feedback-note"
                    type="text"
                    value={feedbackNote}
                    onChange={(event) => setFeedbackNote(event.target.value)}
                    placeholder="Why you edited or discarded"
                    className="mt-2 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition focus:border-orange"
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => decisionMutation.mutate("approve")}
                  disabled={decisionMutation.isPending || !apiReady}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl bg-green px-4 py-2 text-sm font-medium text-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Approve as-is
                </button>
                <button
                  type="button"
                  onClick={() => decisionMutation.mutate("edit")}
                  disabled={decisionMutation.isPending || !apiReady}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl bg-orange px-4 py-2 text-sm font-medium text-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Save edits + approve
                </button>
                <button
                  type="button"
                  onClick={() => decisionMutation.mutate("discard")}
                  disabled={decisionMutation.isPending || !apiReady}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-red-400/40 bg-red-400/10 px-4 py-2 text-sm font-medium text-red-200 transition hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Discard quote
                </button>
              </div>

              {decisionStatus ? (
                <div className="mt-3 rounded-xl border border-green/40 bg-green/10 px-4 py-3 text-sm text-green">
                  {decisionMessage ?? `Quote ${decisionStatus}.`}
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-border bg-surface p-4 shadow-lg shadow-black/20">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Send Quote</p>
                  <p className="mt-1 text-sm text-muted">
                    Generate a customer-facing PDF, then send it by text or email from the device share sheet.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => sendMutation.mutate(activeQuote)}
                  disabled={sendMutation.isPending || !apiReady}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-orange px-5 py-3 text-sm font-medium text-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                  <span>{sendMutation.isPending ? "Generating PDF..." : "Send PDF"}</span>
                </button>
              </div>

              {shareMessage ? (
                <div className="mt-3 rounded-xl border border-green/40 bg-green/10 px-4 py-3 text-sm text-green">
                  {shareMessage}
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-border bg-surface p-4 shadow-lg shadow-black/20">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Send to client (one tap)</p>
                  <p className="mt-1 text-sm text-muted">
                    Deliver the quote directly from GC Agent via WhatsApp, SMS, or email.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => activeQuote && void loadDeliveryHistory(activeQuote.quote_id)}
                  disabled={isDeliveryHistoryLoading || !apiReady}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-bg px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted transition hover:border-orange hover:text-orange disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isDeliveryHistoryLoading ? "Refreshing..." : "Refresh status"}
                </button>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-[0.16em] text-muted" htmlFor="delivery-channel">
                    Channel
                  </label>
                  <select
                    id="delivery-channel"
                    value={deliveryChannel}
                    onChange={(event) =>
                      setDeliveryChannel(event.target.value as "whatsapp" | "sms" | "email")
                    }
                    className="mt-2 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition focus:border-orange"
                  >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="sms">SMS</option>
                    <option value="email">Email</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs uppercase tracking-[0.16em] text-muted" htmlFor="delivery-destination">
                    {deliveryDestinationLabel}
                  </label>
                  <input
                    id="delivery-destination"
                    type={deliveryChannel === "email" ? "email" : "text"}
                    value={deliveryDestination}
                    onChange={(event) => setDeliveryDestination(event.target.value)}
                    placeholder={deliveryDestinationPlaceholder}
                    className="mt-2 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition focus:border-orange"
                  />
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-[0.16em] text-muted" htmlFor="delivery-name">
                    Client name (optional)
                  </label>
                  <input
                    id="delivery-name"
                    type="text"
                    value={deliveryRecipientName}
                    onChange={(event) => setDeliveryRecipientName(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition focus:border-orange"
                  />
                </div>

                <div>
                  <label className="text-xs uppercase tracking-[0.16em] text-muted" htmlFor="delivery-override">
                    Custom message (optional)
                  </label>
                  <input
                    id="delivery-override"
                    type="text"
                    value={deliveryMessageOverride}
                    onChange={(event) => setDeliveryMessageOverride(event.target.value)}
                    placeholder="Leave blank to use default quote message"
                    className="mt-2 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition focus:border-orange"
                  />
                </div>
              </div>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => directDeliveryMutation.mutate()}
                  disabled={directDeliveryMutation.isPending || !apiReady}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-green px-4 py-2 text-sm font-medium text-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {directDeliveryMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span>{directDeliveryMutation.isPending ? "Sending..." : "Send to client now"}</span>
                </button>
              </div>

              {deliveryMessage ? (
                <div className="mt-3 rounded-xl border border-green/40 bg-green/10 px-4 py-3 text-sm text-green">
                  {deliveryMessage}
                </div>
              ) : null}

              <div className="mt-4 rounded-xl border border-border bg-bg px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Delivery status</p>
                  <p className="text-xs text-muted">
                    {deliveryHistory.length > 0 ? `${deliveryHistory.length} attempt(s)` : "No sends yet"}
                  </p>
                </div>

                {isDeliveryHistoryLoading ? (
                  <p className="mt-3 text-sm text-muted">Refreshing latest delivery state...</p>
                ) : deliveryHistory.length === 0 ? (
                  <p className="mt-3 text-sm text-muted">
                    No delivery attempts recorded yet. Once you send the quote, status will show here.
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {deliveryHistory.map((attempt) => (
                      <div
                        key={attempt.delivery_id}
                        className="rounded-xl border border-border bg-surface px-3 py-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-text">
                              {attempt.channel.toUpperCase()} to {attempt.recipient || attempt.destination}
                            </p>
                            <p className="mt-1 text-xs text-muted">
                              {attempt.destination} • {formatDeliveryTimestamp(attempt.sent_at)}
                            </p>
                          </div>
                          <span
                            className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${deliveryStatusTone(attempt.status)}`}
                          >
                            {attempt.status}
                          </span>
                        </div>

                        {attempt.error_message ? (
                          <p className="mt-2 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-100">
                            {attempt.error_message}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {activeQuote.rendered_quote ? (
              <div className="rounded-2xl border border-border bg-surface p-4 shadow-lg shadow-black/20">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Rendered preview</p>
                <pre className="mt-3 whitespace-pre-wrap font-mono text-xs leading-6 text-text/90">
                  {activeQuote.rendered_quote}
                </pre>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
