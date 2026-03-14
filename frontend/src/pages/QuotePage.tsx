import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { Mic, Square, TriangleAlert } from "lucide-react";

import { fetchTranscriptQuotePrefill } from "../api/transcripts";
import {
  approveQuote,
  discardQuote,
  editQuote,
  fetchQuoteDelivery,
  fetchQuoteFollowup,
  fetchQuotePdf,
  fetchQuoteXlsx,
  hasBetaApiCredentials,
  sendQuoteToClient,
  stopQuoteFollowup,
  submitQuote,
  submitQuoteUpload,
} from "../api/quote";
import type {
  QuoteApprovalStatus,
  QuoteDeliveryAttempt,
  QuoteFollowupState,
  QuoteLineItem,
  QuoteResponse,
  TranscriptQuotePrefill,
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
  file: File | null;
  transcriptId: string;
  jobId: string;
};

const QUOTE_NOTES_STORAGE_KEY = "gc-agent:quote:notes:v1";
const QUOTE_OFFLINE_QUEUE_STORAGE_KEY = "gc-agent:quote:offline-queue:v1";
const ACTIVE_QUOTE_STORAGE_KEY = "gc-agent:quote:active:v1";
const ACCEPTED_UPLOAD_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

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
  if (normalized === "delivered") return "tg";
  if (normalized === "sent" || normalized === "queued" || normalized === "accepted") return "ta";
  if (normalized === "pending" || normalized === "scheduled") return "ts";
  return "tr";
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

function followupStatusLabel(followup: QuoteFollowupState | null): string {
  if (!followup) return "No follow-up";
  if (followup.status === "scheduled") return "Scheduled";
  if (followup.status === "stopped") return "Stopped";
  if (followup.status === "pending_destination") return "Pending destination";
  return "No follow-up";
}

function followupTone(followup: QuoteFollowupState | null): string {
  if (!followup) return "ts";
  if (followup.status === "scheduled") return "ta";
  if (followup.status === "stopped") return "tr";
  if (followup.status === "pending_destination") return "ts";
  return "ts";
}

function followupSummary(followup: QuoteFollowupState | null): string {
  if (!followup || followup.status === "none") {
    return "No reminder is scheduled for this quote yet.";
  }
  if (followup.status === "pending_destination") {
    return "Send the quote to the customer first so reminders know where to follow through.";
  }
  if (followup.status === "stopped") {
    return "Automatic follow-through is paused for this quote.";
  }
  return "The reminder stays on the calendar until someone stops it or the quote closes.";
}

function followupStopReason(reason: string | null): string {
  const normalized = (reason ?? "").trim().toLowerCase();
  if (!normalized) return "Stopped by the current quote status.";
  if (normalized === "max_reminders_reached") return "Two follow-through reminders have already been sent.";
  if (normalized === "manual_stop") return "You paused automatic follow-through for this quote.";
  if (normalized === "quote_discarded") return "This quote was discarded.";
  if (normalized === "quote_expired") return "This quote is marked expired.";
  if (
    normalized === "quote_closed" ||
    normalized === "quote_converted" ||
    normalized === "quote_accepted"
  ) {
    return "This quote is already closed out.";
  }
  return normalized.replace(/_/g, " ");
}

function followupChannel(channel: string | null): string {
  const normalized = (channel ?? "").trim().toLowerCase();
  if (!normalized) return "Not chosen yet";
  if (normalized === "sms") return "SMS";
  if (normalized === "whatsapp") return "WhatsApp";
  if (normalized === "email") return "Email";
  return normalized;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function downloadBlobFile(blob: Blob, filename: string): void {
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => {
    window.URL.revokeObjectURL(objectUrl);
  }, 60000);
}

function transcriptClassificationLabel(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "unknown";
  return normalized.replace(/_/g, " ");
}

export function QuotePage() {
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const autoSubmitRef = useRef(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const latestTranscriptRef = useRef("");
  const wasOnlineRef = useRef(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  const [notes, setNotes] = useState(() => loadStoredNotes());
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
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
  const [editMode, setEditMode] = useState(false);
  const [decisionStatus, setDecisionStatus] = useState<QuoteApprovalStatus | null>(null);
  const [decisionMessage, setDecisionMessage] = useState<string | null>(null);
  const [deliveryChannel, setDeliveryChannel] = useState<"whatsapp" | "sms" | "email">("whatsapp");
  const [deliveryDestination, setDeliveryDestination] = useState("");
  const [deliveryRecipientName, setDeliveryRecipientName] = useState("");
  const [deliveryMessageOverride, setDeliveryMessageOverride] = useState("");
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null);
  const [deliveryHistory, setDeliveryHistory] = useState<QuoteDeliveryAttempt[]>([]);
  const [isDeliveryHistoryLoading, setIsDeliveryHistoryLoading] = useState(false);
  const [followupState, setFollowupState] = useState<QuoteFollowupState | null>(null);
  const [isFollowupLoading, setIsFollowupLoading] = useState(false);
  const [followupMessage, setFollowupMessage] = useState<string | null>(null);
  const [transcriptPrefill, setTranscriptPrefill] = useState<TranscriptQuotePrefill | null>(null);
  const [isTranscriptPrefillLoading, setIsTranscriptPrefillLoading] = useState(false);
  const [transcriptPrefillError, setTranscriptPrefillError] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<"voice" | "text" | "pdf" | "photo">("voice");
  const location = useLocation();
  const navigate = useNavigate();
  const apiReady = hasBetaApiCredentials();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const firstSessionMode = useMemo(() => {
    return searchParams.get("first_session") === "1";
  }, [searchParams]);
  const transcriptId = useMemo(() => {
    return searchParams.get("transcript_id")?.trim() ?? "";
  }, [searchParams]);

  const applyQuoteSuccess = useCallback((payload: QuoteResponse) => {
    setActiveQuote(payload);
    setSelectedUploadFile(null);
    if (uploadInputRef.current) {
      uploadInputRef.current.value = "";
    }
    setEditedScopeOfWork(payload.quote_draft.scope_of_work ?? "");
    setEditedTotalPrice(String(payload.quote_draft.total_price ?? ""));
    setFeedbackNote("");
    setEditMode(false);
    setDecisionStatus(null);
    setDecisionMessage(null);
    setDeliveryDestination("");
    setDeliveryRecipientName(payload.quote_draft.customer_name ?? "");
    setDeliveryMessageOverride("");
    setDeliveryMessage(null);
    setDeliveryHistory([]);
    setFollowupState(null);
    setFollowupMessage(null);
    setShareMessage(null);
    setQueueMessage(null);
    if (payload.errors.length > 0) {
      setCaptureError(payload.errors[0] ?? null);
    } else {
      setCaptureError(null);
    }
  }, []);

  const loadTranscriptPrefill = useCallback(
    async (nextTranscriptId: string) => {
      const transcriptValue = nextTranscriptId.trim();
      if (!transcriptValue) {
        setTranscriptPrefill(null);
        setTranscriptPrefillError(null);
        setIsTranscriptPrefillLoading(false);
        return;
      }

      setIsTranscriptPrefillLoading(true);
      setTranscriptPrefillError(null);
      try {
        const payload = await fetchTranscriptQuotePrefill(transcriptValue);
        setTranscriptPrefill(payload);
        setActiveQuote(null);
        setEditMode(false);
        setDecisionStatus(null);
        setDecisionMessage(null);
        setDeliveryMessage(null);
        setFollowupState(null);
        setFollowupMessage(null);
        setNotes(payload.quote_input);
        setInputMode("text");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Could not load call transcript context.";
        setTranscriptPrefill(null);
        setTranscriptPrefillError(message);
      } finally {
        setIsTranscriptPrefillLoading(false);
      }
    },
    []
  );

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

  const loadFollowupState = useCallback(
    async (quoteId: string) => {
      if (!apiReady || !quoteId.trim()) {
        setFollowupState(null);
        return;
      }

      setIsFollowupLoading(true);
      try {
        const payload = await fetchQuoteFollowup(quoteId);
        setFollowupState(payload.followup ?? null);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Could not refresh reminder status.";
        setCaptureError(message);
      } finally {
        setIsFollowupLoading(false);
      }
    },
    [apiReady]
  );

  const quoteMutation = useMutation({
    mutationFn: async ({ input, file, transcriptId: nextTranscriptId, jobId }: QuoteSubmissionRequest) =>
      file
        ? submitQuoteUpload(input, file, { transcriptId: nextTranscriptId, jobId })
        : submitQuote(input, { transcriptId: nextTranscriptId, jobId }),
    onSuccess: applyQuoteSuccess,
    onError: (error, variables) => {
      const currentlyOnline =
        typeof navigator === "undefined" ? true : navigator.onLine;
      if (!currentlyOnline && !variables.file) {
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
    (input: string, source: QuoteInputSource, file: File | null = null) => {
      const trimmed = input.trim();
      const hasFile = Boolean(file);
      if ((!trimmed && !hasFile) || quoteMutation.isPending || isQueueSyncing) {
        return;
      }

      setActiveQuote(null);
      setCaptureError(null);
      setShareMessage(null);
      setDecisionStatus(null);
      setDecisionMessage(null);
      setDeliveryMessage(null);
      setDeliveryHistory([]);
      setFollowupState(null);
      setFollowupMessage(null);
      setQueueMessage(null);
      latestTranscriptRef.current = trimmed;

      if (!isOnline) {
        if (hasFile) {
          setCaptureError("Uploads need a connection before we can read the file.");
          return;
        }
        enqueueOfflineQuote(trimmed, source);
        return;
      }

      quoteMutation.mutate({
        input: trimmed,
        source,
        file,
        transcriptId,
        jobId: transcriptPrefill?.linked_job_id ?? "",
      });
    },
    [enqueueOfflineQuote, isOnline, isQueueSyncing, quoteMutation, transcriptId, transcriptPrefill]
  );

  useEffect(() => {
    if (!transcriptId) {
      setTranscriptPrefill(null);
      setTranscriptPrefillError(null);
      setIsTranscriptPrefillLoading(false);
      return;
    }
    void loadTranscriptPrefill(transcriptId);
  }, [loadTranscriptPrefill, transcriptId]);

  useEffect(() => {
    if (!activeQuote) {
      saveStoredActiveQuote(null);
      setFollowupState(null);
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
    if (!activeQuote?.quote_id) {
      setFollowupState(null);
      return;
    }
    if (!apiReady) {
      return;
    }
    void loadFollowupState(activeQuote.quote_id);
  }, [activeQuote?.quote_id, apiReady, loadFollowupState]);

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
      void loadFollowupState(payload.quote_id);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Could not send quote to customer.";
      setCaptureError(message);
      setDeliveryMessage(null);
    },
  });

  const exportXlsxMutation = useMutation({
    mutationFn: async (quote: QuoteResponse) => {
      const xlsxBlob = await fetchQuoteXlsx(quote.quote_id);
      const filename = `gc-agent-quote-${quote.quote_id}.xlsx`;
      downloadBlobFile(xlsxBlob, filename);
      return "Quote spreadsheet exported for Excel or CSV workflow handoff.";
    },
    onSuccess: (message) => {
      setShareMessage(message);
      setCaptureError(null);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Could not export quote spreadsheet.";
      setCaptureError(message);
      setShareMessage(null);
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
          ? `Quote ${payload.approval_status}. Pricing and review signals were saved for future drafts.`
          : `Quote ${payload.approval_status}.`
      );
      if (activeQuote && payload.quote_draft) {
        setActiveQuote({
          ...activeQuote,
          quote_draft: payload.quote_draft,
          review_required: payload.approval_status === "discarded",
          send_blocked: payload.approval_status === "discarded",
          blocking_reasons:
            payload.approval_status === "discarded"
              ? ["Discarded quotes cannot be sent to the customer."]
              : [],
          estimate_confidence: {
            ...activeQuote.estimate_confidence,
            review_required: payload.approval_status === "discarded",
            send_blocked: payload.approval_status === "discarded",
            blocking_reasons:
              payload.approval_status === "discarded"
                ? ["Discarded quotes cannot be sent to the customer."]
                : [],
          },
        });
        setEditedScopeOfWork(payload.quote_draft.scope_of_work ?? "");
        setEditedTotalPrice(String(payload.quote_draft.total_price ?? ""));
        setEditMode(false);
      }
      setCaptureError(null);
      if (activeQuote) {
        void loadFollowupState(activeQuote.quote_id);
      }
      setFollowupMessage(null);
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Could not save quote decision.";
      setCaptureError(message);
      setDecisionMessage(null);
    },
  });

  const stopFollowupMutation = useMutation({
    mutationFn: async () => {
      if (!activeQuote) {
        throw new Error("No active quote to update.");
      }
      return stopQuoteFollowup(activeQuote.quote_id);
    },
    onSuccess: (payload) => {
      setFollowupState(payload.followup ?? null);
      setFollowupMessage("Automatic follow-through has been paused for this quote.");
      setCaptureError(null);
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Could not stop automatic follow-through.";
      setCaptureError(message);
      setFollowupMessage(null);
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

  const handleUploadSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setSelectedUploadFile(null);
      return;
    }

    if (!ACCEPTED_UPLOAD_TYPES.has(file.type)) {
      setCaptureError("Only PDF, JPG, and PNG uploads are supported.");
      setSelectedUploadFile(null);
      event.target.value = "";
      return;
    }

    setCaptureError(null);
    setSelectedUploadFile(file);
    setInputMode(file.type === "application/pdf" ? "pdf" : "photo");
  };

  const clearSelectedUpload = () => {
    setSelectedUploadFile(null);
    if (uploadInputRef.current) {
      uploadInputRef.current.value = "";
    }
  };

  const handleManualSubmit = () => {
    submitInput(notes, "manual", selectedUploadFile);
  };

  const phase = quoteMutation.isPending ? "gen" : activeQuote ? "review" : "input";
  const confidenceScore = activeQuote?.estimate_confidence.score ?? 0;
  const confidenceLevel = activeQuote?.estimate_confidence.level ?? "low";
  const confidenceClass =
    confidenceLevel === "high" ? "chi" : confidenceLevel === "medium" ? "cmd" : "clo";
  const confidenceFill =
    confidenceLevel === "high"
      ? "var(--green-hi)"
      : confidenceLevel === "medium"
        ? "var(--amber-hot)"
        : "var(--red-hi)";
  const memoryTrade = (activeQuote?.cold_start?.primary_trade ?? "general_construction")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
  const lineItems = activeQuote?.quote_draft.line_items ?? [];
  const assumptions = activeQuote?.assumptions ?? [];
  const clarificationQuestions = activeQuote?.clarification_questions ?? [];
  const exclusions = activeQuote?.quote_draft.exclusions ?? [];
  const canStopFollowup =
    followupState?.status === "scheduled" || followupState?.status === "pending_destination";
  const isPersistedReviewedQuote =
    decisionStatus === "approved" || decisionStatus === "edited";
  const quoteReviewRequired =
    activeQuote?.review_required ??
    activeQuote?.estimate_confidence.review_required ??
    !isPersistedReviewedQuote;
  const quoteSendBlocked =
    activeQuote?.send_blocked ??
    activeQuote?.estimate_confidence.send_blocked ??
    !isPersistedReviewedQuote;
  const quoteMissingInformation = uniqueStrings([
    ...(activeQuote?.missing_information ?? activeQuote?.estimate_confidence.missing_information ?? []),
    ...(transcriptPrefill?.missing_information ?? []),
  ]);
  const quoteEvidenceSignals = uniqueStrings(
    activeQuote?.evidence_signals ?? activeQuote?.estimate_confidence.evidence_signals ?? []
  );
  const quoteBlockingReasons = uniqueStrings(
    activeQuote?.blocking_reasons ?? activeQuote?.estimate_confidence.blocking_reasons ?? []
  );
  const estimateSignalSummary = useMemo(() => {
    if (activeQuote) {
      if (activeQuote.cold_start.active) {
        return "Baseline still warming";
      }
      if (quoteEvidenceSignals.length > 0) {
        return "Historical signals applied";
      }
      return "Baseline applied";
    }
    if (transcriptPrefill) {
      return transcriptPrefill.estimate_related
        ? "Transcript request ready"
        : "Transcript needs review";
    }
    return apiReady ? "Ready for first draft" : "API setup required";
  }, [activeQuote, apiReady, quoteEvidenceSignals.length, transcriptPrefill]);
  const estimateSignalTone = activeQuote?.cold_start.active
    ? "ta"
    : activeQuote
      ? "tg"
      : apiReady
        ? "ts"
        : "tr";
  const similarJobsLabel = useMemo(() => {
    if (quoteEvidenceSignals.some((signal) => /histor|similar|past job|prior job/i.test(signal))) {
      return "Similar jobs found";
    }
    if (activeQuote) {
      return activeQuote.cold_start.active ? "Not enough history yet" : "Learning from this draft";
    }
    return "History builds after approved jobs";
  }, [activeQuote, quoteEvidenceSignals]);
  const readinessHeadline = isOnline
    ? offlineQueue.length > 0
      ? `${offlineQueue.length} draft${offlineQueue.length === 1 ? "" : "s"} queued to sync`
      : "Ready to generate"
    : `Offline mode · ${offlineQueue.length} queued`;
  const readinessDetail = isOnline
    ? "Add scope, measurements, materials, and any customer deadline."
    : "You can keep capturing notes now and sync them when the connection returns.";
  const preflightChecklist = transcriptPrefill?.missing_information.length
    ? transcriptPrefill.missing_information
    : ["Measurements or quantities", "Material preference or grade", "Any site access or schedule constraint"];
  const readinessSignals = quoteEvidenceSignals.slice(0, 3);
  const reviewStatusLabel =
    decisionStatus === "discarded"
      ? "Discarded"
      : decisionStatus === "approved"
        ? "Approved"
        : decisionStatus === "edited"
          ? "Edited"
          : quoteReviewRequired
            ? "Review required"
            : "Ready";

  return (
    <div className="pw">
      <div className="ph">
        <div className="eyebrow">Communication To Quote</div>
        <div className="ptitle">New Quote</div>
        <div className="psub">Turn messy job details into a reviewable quote draft, then send and track follow-through.</div>
      </div>

      {firstSessionMode ? (
        <div className="alert ainfo" style={{ marginBottom: 14 }}>
          <span>◈</span>
          <div>
            <strong style={{ fontFamily: "'Syne Mono', monospace", fontSize: 8, letterSpacing: "1px" }}>
              FIRST SESSION TARGET
            </strong>
            <div style={{ marginTop: 3 }}>
              Get one real quote draft out in under ten minutes. Approve or edit it so future drafts start closer to how you actually price work.
            </div>
          </div>
        </div>
      ) : null}

      {!apiReady ? (
        <div className="alert awarn" style={{ marginBottom: 14 }}>
          <span>
            <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>Set VITE_BETA_API_KEY and VITE_BETA_CONTRACTOR_ID before sending quotes through the public contractor API.</div>
        </div>
      ) : null}

      <div className="tcol">
        <div className="vs">
          {phase === "input" ? (
            <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-7 py-6">
                <div className="text-[18px] font-semibold text-slate-950">Input Context</div>
                <div className="mt-2 text-[16px] text-slate-500">How do you want to provide the job details?</div>
              </div>

              <div className="px-7 py-7">
                <div className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div>
                    <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-slate-500">Estimate readiness</div>
                    <div className="mt-1 text-[15px] text-slate-800">{readinessHeadline}</div>
                    <div className="mt-1 text-sm text-slate-500">{readinessDetail}</div>
                  </div>
                  <button
                    type="button"
                    className="btn bw sm"
                    onClick={() => void syncQueuedNotes()}
                    disabled={
                      !apiReady ||
                      !isOnline ||
                      offlineQueue.length === 0 ||
                      isQueueSyncing ||
                      quoteMutation.isPending
                    }
                  >
                    {isQueueSyncing ? "Syncing..." : offlineQueue.length > 0 ? "Sync queued" : "Ready"}
                  </button>
                </div>

                {queueMessage ? (
                  <div className="alert aok" style={{ marginBottom: 12 }}>
                    <span>✓</span>
                    <div>{queueMessage}</div>
                  </div>
                ) : null}

                {isTranscriptPrefillLoading ? (
                  <div className="alert ainfo" style={{ marginBottom: 12 }}>
                    <span>◈</span>
                    <div>Loading call context for this quote...</div>
                  </div>
                ) : null}

                {transcriptPrefillError ? (
                  <div className="alert awarn" style={{ marginBottom: 12 }}>
                    <span>⚠</span>
                    <div>{transcriptPrefillError}</div>
                  </div>
                ) : null}

                {transcriptPrefill ? (
                  <div className="alert ainfo" style={{ marginBottom: 16 }}>
                    <span>◈</span>
                    <div>
                      <div className="lbl" style={{ marginBottom: 6 }}>Call Transcript Context</div>
                      <strong style={{ fontSize: 13 }}>{transcriptPrefill.summary}</strong>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className={`tag ${transcriptPrefill.estimate_related ? "tb" : "ts"}`}>
                          {transcriptPrefill.estimate_related ? "Estimate request" : transcriptClassificationLabel(transcriptPrefill.classification)}
                        </span>
                        {transcriptPrefill.linked_job_id ? <span className="tag ts">{transcriptPrefill.linked_job_id}</span> : null}
                        {transcriptPrefill.scope_items.slice(0, 3).map((item) => (
                          <span key={`${transcriptPrefill.transcript_id}-${item}`} className="tag tb">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-100 p-1">
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { id: "voice", label: "Voice" },
                      { id: "text", label: "Text" },
                      { id: "pdf", label: "PDF" },
                      { id: "photo", label: "Photo" },
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setInputMode(mode.id as "voice" | "text" | "pdf" | "photo")}
                        className={`h-10 rounded-xl text-[15px] font-semibold transition ${
                          inputMode === mode.id ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900"
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10">
                  {inputMode === "voice" ? (
                    <div className="flex flex-col items-center text-center">
                      <button
                        type="button"
                        onPointerDown={beginRecording}
                        onPointerUp={stopRecordingAndSend}
                        onPointerLeave={stopRecordingAndSend}
                        onPointerCancel={stopRecordingAndSend}
                        disabled={!voiceSupported || !apiReady || quoteMutation.isPending || isQueueSyncing}
                        className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full bg-[#2453d4] text-white transition hover:bg-[#1f46b3] disabled:cursor-not-allowed disabled:bg-slate-300"
                        style={{ touchAction: "none" }}
                      >
                        {isRecording ? <Square className="h-8 w-8" aria-hidden="true" /> : <Mic className="h-8 w-8" aria-hidden="true" />}
                      </button>
                      <div className="text-[16px] font-semibold text-slate-950">
                        {isRecording ? "Recording now" : "Click and hold to start recording"}
                      </div>
                      <div className="mt-3 max-w-2xl text-[15px] leading-7 text-slate-500">
                        Speak naturally. Mention the client name, what needs to be done, measurements if you have them, and any specific materials.
                      </div>
                    </div>
                  ) : null}

                  {inputMode === "text" ? (
                    <div>
                      <label className="lbl" htmlFor="quote-notes">
                        Transcript / field notes
                      </label>
                      <textarea
                        id="quote-notes"
                        className="txta"
                        rows={8}
                        value={notes}
                        onChange={(event) => {
                          const value = event.target.value;
                          latestTranscriptRef.current = value;
                          setNotes(value);
                        }}
                        placeholder="Scope, measurements, materials, site conditions, customer requests..."
                      />
                    </div>
                  ) : null}

                  {(inputMode === "pdf" || inputMode === "photo") ? (
                    <div>
                      <div className="mb-4 text-[16px] font-semibold text-slate-950">
                        {inputMode === "pdf" ? "Upload a PDF scope sheet" : "Upload a jobsite photo"}
                      </div>
                      <div className="mb-4 text-[15px] leading-7 text-slate-500">
                        We will read this together with your notes. You can still add text details below before you generate the draft.
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <label htmlFor="quote-upload" className="btn bw">
                          {selectedUploadFile ? "Replace file" : `Choose ${inputMode === "pdf" ? "PDF" : "photo"}`}
                        </label>
                        {selectedUploadFile ? (
                          <button type="button" className="btn bw" onClick={clearSelectedUpload}>
                            Remove
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-4 text-[15px] text-slate-500">
                        {selectedUploadFile ? `Attached: ${selectedUploadFile.name}` : "No file attached yet."}
                      </div>
                    </div>
                  ) : null}
                </div>

                <input
                  ref={uploadInputRef}
                  id="quote-upload"
                  type="file"
                  accept=".pdf,image/png,image/jpeg,application/pdf"
                  onChange={handleUploadSelection}
                  className="sr-only"
                />

                {inputMode !== "text" ? (
                  <div className="mt-6">
                    <label className="lbl" htmlFor="quote-notes">
                      Transcript / field notes
                    </label>
                    <textarea
                      id="quote-notes"
                      className="txta"
                      rows={5}
                      value={notes}
                      onChange={(event) => {
                        const value = event.target.value;
                        latestTranscriptRef.current = value;
                        setNotes(value);
                      }}
                      placeholder="Add any extra scope, measurements, customer requests, or job constraints..."
                    />
                  </div>
                ) : null}

                <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                  <div className="rounded-2xl bg-slate-50 p-5">
                    <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-slate-500">What helps this estimate</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {preflightChecklist.map((item) => (
                        <span key={`preflight-${item}`} className="tag ts">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="cta min-w-[320px]"
                      onClick={handleManualSubmit}
                      disabled={
                        !apiReady ||
                        (!notes.trim() && !selectedUploadFile) ||
                        (!isOnline && Boolean(selectedUploadFile)) ||
                        quoteMutation.isPending ||
                        isQueueSyncing
                      }
                    >
                      {quoteMutation.isPending
                        ? "Building draft..."
                        : !isOnline && selectedUploadFile
                          ? "Upload needs connection"
                          : "Extract Scope & Generate Draft"}
                    </button>
                  </div>
                </div>

                <div className="mt-4 text-sm text-slate-500">{helperText}</div>

                {captureError ? (
                  <div className="alert awarn" style={{ marginTop: 16 }}>
                    <span>⚠</span>
                    <div>{captureError}</div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {phase === "gen" ? (
            <div className="panel ani" style={{ textAlign: "center", padding: "48px 24px" }}>
              <div className="spin" style={{ margin: "0 auto 16px" }} />
              <div
                style={{
                  fontFamily: "'Oswald', sans-serif",
                  fontSize: 17,
                  letterSpacing: "2px",
                  color: "var(--cream)",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Processing Input
              </div>
              <div
                style={{
                  fontFamily: "'Syne Mono', monospace",
                  fontSize: 8,
                  color: "var(--fog)",
                  letterSpacing: "1.2px",
                  lineHeight: 1.8,
                }}
              >
                STRUCTURING LINE ITEMS · APPLYING PRICING BASELINE · FLAGGING ASSUMPTIONS
              </div>
            </div>
          ) : null}

          {phase === "review" && activeQuote ? (
            <div className="vs ani">
              <div className="panel">
                <div className="ph2 sp">
                  <div className="hs">
                    <span className="ptl">Quote Draft</span>
                    <span className="tag ts" style={{ fontSize: 8 }}>
                      {activeQuote.quote_id}
                    </span>
                  </div>
                  <div className="hs" style={{ gap: 10 }}>
                    <span className={`cnum ${confidenceClass}`}>
                      {confidenceScore}
                      <span style={{ fontSize: 8, opacity: 0.6 }}>%</span>
                    </span>
                    <div className="ctrack" style={{ width: 88 }}>
                      <div className="cfill" style={{ width: `${confidenceScore}%`, background: confidenceFill }} />
                    </div>
                    <span
                      className={`tag td ${
                        decisionStatus === "discarded"
                          ? "tr"
                          : quoteReviewRequired
                            ? "ta"
                            : "tg"
                      }`}
                    >
                      {reviewStatusLabel}
                    </span>
                  </div>
                </div>

                <div className="pb lg">
                  <div className={`alert ${quoteReviewRequired ? "awarn" : "aok"}`} style={{ marginBottom: 14 }}>
                    <span>{quoteReviewRequired ? "!" : "✓"}</span>
                    <div>
                      <strong style={{ fontFamily: "'Syne Mono', monospace", fontSize: 8, letterSpacing: "1px" }}>
                        {confidenceScore}% CONFIDENCE · PRICING BASELINE {activeQuote.cold_start.active ? "PARTIAL" : "APPLIED"}
                      </strong>
                      <div style={{ marginTop: 3, fontSize: 12 }}>
                        {quoteReviewRequired
                          ? "Review is required before this quote can be sent."
                          : clarificationQuestions.length > 0
                            ? `${clarificationQuestions.length} clarification item${clarificationQuestions.length === 1 ? "" : "s"} flagged below.`
                            : "Quote is ready for delivery or export."}
                      </div>
                    </div>
                  </div>

                  {quoteMissingInformation.length ? (
                    <div className="alert awarn" style={{ marginBottom: 14 }}>
                      <span>!</span>
                      <div>
                        <strong style={{ fontFamily: "'Syne Mono', monospace", fontSize: 8, letterSpacing: "1px" }}>
                          MISSING INFORMATION TO CONFIRM
                        </strong>
                        <div className="hs" style={{ flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                          {quoteMissingInformation.map((item) => (
                            <span key={`quote-missing-${item}`} className="tag ts">
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {quoteEvidenceSignals.length ? (
                    <div className="alert ainfo" style={{ marginBottom: 14 }}>
                      <span>◈</span>
                      <div>
                        <strong style={{ fontFamily: "'Syne Mono', monospace", fontSize: 8, letterSpacing: "1px" }}>
                          WHAT THIS DRAFT IS BASED ON
                        </strong>
                        <div style={{ marginTop: 6 }} className="vs">
                          {quoteEvidenceSignals.map((signal) => (
                            <div key={signal} style={{ fontSize: 12, color: "var(--cream)" }}>
                              {signal}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div style={{ marginBottom: 14 }}>
                    <div className="sh">Project</div>
                    <div style={{ fontSize: 12, color: "var(--cream)" }}>
                      {activeQuote.quote_draft.project_address || "Project address pending"}
                    </div>
                    <div
                      style={{
                        marginTop: 2,
                        fontFamily: "'Syne Mono', monospace",
                        fontSize: 8,
                        color: "var(--fog)",
                        letterSpacing: "0.6px",
                      }}
                    >
                      {activeQuote.quote_draft.customer_name || "CUSTOMER PENDING"}
                    </div>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <div className="sh">Scope</div>
                    <div style={{ fontSize: 12, color: "var(--steel)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                      {activeQuote.quote_draft.scope_of_work}
                    </div>
                  </div>

                  <div className="sh">Line Items</div>
                  <table className="lit">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th>Qty</th>
                        <th style={{ textAlign: "right" }}>Unit</th>
                        <th style={{ textAlign: "right" }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.length > 0 ? (
                        lineItems.map((item, index) => (
                          <tr key={`${lineItemLabel(item)}-${index}`}>
                            <td>{lineItemLabel(item)}</td>
                            <td style={{ fontFamily: "'Syne Mono', monospace", fontSize: 9, color: "var(--fog)" }}>
                              {item.quantity ?? 0} {item.unit ?? "unit"}
                            </td>
                            <td style={{ textAlign: "right", fontFamily: "'Syne Mono', monospace", fontSize: 9, color: "var(--fog)" }}>
                              {typeof item.unit_cost === "number" && Number.isFinite(item.unit_cost)
                                ? formatCurrency(item.unit_cost)
                                : "--"}
                            </td>
                            <td>{formatCurrency(lineItemTotal(item))}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} style={{ textAlign: "left", color: "var(--fog)" }}>
                            No material line items were returned.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 12, gap: 8, alignItems: "baseline" }}>
                    <span style={{ fontFamily: "'Syne Mono', monospace", fontSize: 8, color: "var(--fog)", letterSpacing: "1.2px" }}>
                      TOTAL
                    </span>
                    <span
                      style={{
                        fontFamily: "'Oswald', sans-serif",
                        fontSize: 26,
                        fontWeight: 600,
                        color: "var(--amber-hot)",
                        letterSpacing: "0.5px",
                      }}
                    >
                      {formatCurrency(activeQuote.quote_draft.total_price)}
                    </span>
                  </div>
                </div>

                <div style={{ borderTop: "1px solid var(--wire)", padding: "12px 14px" }}>
                  <div className="sh">Assumptions</div>
                  <div className="vs">
                    {assumptions.length > 0 ? (
                      assumptions.map((assumption) => (
                        <div key={assumption} className="alert awarn" style={{ fontSize: 12 }}>
                          <span style={{ flexShrink: 0 }}>⚠</span>
                          <div>{assumption}</div>
                        </div>
                      ))
                    ) : (
                      <div style={{ fontSize: 12, color: "var(--fog)" }}>No explicit assumptions were returned.</div>
                    )}

                    {clarificationQuestions.length > 0 ? (
                      <div className="alert ainfo" style={{ fontSize: 12 }}>
                        <span>◈</span>
                        <div>
                          <strong style={{ fontFamily: "'Syne Mono', monospace", fontSize: 8, letterSpacing: "1px" }}>
                            CLARIFICATION NEEDED
                          </strong>
                          <div style={{ marginTop: 4 }}>
                            {clarificationQuestions.map((question) => (
                              <div key={question}>{question}</div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {exclusions.length > 0 ? (
                      <div style={{ paddingTop: 6 }}>
                        <div className="sh">Exclusions</div>
                        <div className="vs">
                          {exclusions.map((item) => (
                            <div key={item} style={{ fontSize: 12, color: "var(--steel)" }}>
                              {item}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div style={{ borderTop: "1px solid var(--wire)", padding: "10px 14px", display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn bg"
                    onClick={() => decisionMutation.mutate("approve")}
                    disabled={decisionMutation.isPending || !apiReady}
                  >
                    {decisionMutation.isPending && decisionMutation.variables === "approve" ? "Saving..." : "✓ Approve"}
                  </button>
                  <button
                    type="button"
                    className="btn bw"
                    onClick={() => setEditMode((current) => !current)}
                    disabled={decisionMutation.isPending || !apiReady}
                  >
                    ✎ Edit
                  </button>
                  <button
                    type="button"
                    className="btn brd"
                    onClick={() => decisionMutation.mutate("discard")}
                    disabled={decisionMutation.isPending || !apiReady}
                  >
                    {decisionMutation.isPending && decisionMutation.variables === "discard" ? "Saving..." : "✕ Discard"}
                  </button>
                </div>
              </div>

              {decisionMessage ? (
                <div className="alert aok">
                  <span>✓</span>
                  <div>{decisionMessage}</div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="vs him">
          {phase === "review" && activeQuote ? (
            <>
              <div className="panel ani">
                <div className="ph2">
                  <span className="ptl">Delivery</span>
                  <button
                    type="button"
                    className="btn bw sm"
                    onClick={() => void loadDeliveryHistory(activeQuote.quote_id)}
                    disabled={isDeliveryHistoryLoading || !apiReady}
                  >
                    {isDeliveryHistoryLoading ? "Refreshing..." : "Refresh"}
                  </button>
                </div>
                <div className="pb vs" style={{ gap: 10 }}>
                  <div>
                    <div className="lbl">Send via</div>
                    <div className="hs" style={{ flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                      {[
                        { key: "sms", label: "📱 SMS" },
                        { key: "whatsapp", label: "💬 WhatsApp" },
                        { key: "email", label: "📧 Email" },
                      ].map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          className={`btn sm ${deliveryChannel === option.key ? "ba" : "bw"}`}
                          onClick={() =>
                            setDeliveryChannel(option.key as "whatsapp" | "sms" | "email")
                          }
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="lbl" htmlFor="delivery-destination">
                      {deliveryDestinationLabel}
                    </label>
                    <input
                      id="delivery-destination"
                      className="inp"
                      type={deliveryChannel === "email" ? "email" : "text"}
                      value={deliveryDestination}
                      onChange={(event) => setDeliveryDestination(event.target.value)}
                      placeholder={deliveryDestinationPlaceholder}
                    />
                  </div>

                  <div>
                    <label className="lbl" htmlFor="delivery-name">
                      Client name
                    </label>
                    <input
                      id="delivery-name"
                      className="inp"
                      value={deliveryRecipientName}
                      onChange={(event) => setDeliveryRecipientName(event.target.value)}
                      placeholder="Optional"
                    />
                  </div>

                  <div>
                    <label className="lbl" htmlFor="delivery-override">
                      Message override
                    </label>
                    <input
                      id="delivery-override"
                      className="inp"
                      value={deliveryMessageOverride}
                      onChange={(event) => setDeliveryMessageOverride(event.target.value)}
                      placeholder="Leave blank to use the default message"
                    />
                  </div>

                  <button
                    type="button"
                    className="cta"
                    style={{ width: "100%", textAlign: "center", display: "block" }}
                    onClick={() => directDeliveryMutation.mutate()}
                    disabled={directDeliveryMutation.isPending || !apiReady || quoteSendBlocked}
                  >
                    {directDeliveryMutation.isPending
                      ? "SENDING..."
                      : quoteSendBlocked
                        ? "REVIEW REQUIRED BEFORE SEND"
                        : "SEND QUOTE"}
                  </button>

                  {quoteSendBlocked ? (
                    <div className="alert awarn" style={{ fontSize: 12 }}>
                      <span>!</span>
                      <div>
                        <strong style={{ fontFamily: "'Syne Mono', monospace", fontSize: 8, letterSpacing: "1px" }}>
                          DELIVERY BLOCKED
                        </strong>
                        <div style={{ marginTop: 6 }} className="vs">
                          {quoteBlockingReasons.map((reason) => (
                            <div key={reason}>{reason}</div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    className="btn bw"
                    style={{ width: "100%", justifyContent: "center" }}
                    onClick={() => sendMutation.mutate(activeQuote)}
                    disabled={sendMutation.isPending || !apiReady}
                  >
                    {sendMutation.isPending ? "Generating PDF..." : "Open PDF"}
                  </button>

                  <button
                    type="button"
                    className="btn bw"
                    style={{ width: "100%", justifyContent: "center" }}
                    onClick={() => exportXlsxMutation.mutate(activeQuote)}
                    disabled={exportXlsxMutation.isPending || !apiReady}
                  >
                    {exportXlsxMutation.isPending ? "Exporting..." : "Export XLSX"}
                  </button>

                  {deliveryMessage ? (
                    <div className="alert aok" style={{ fontSize: 12 }}>
                      <span>✓</span>
                      <div>{deliveryMessage}</div>
                    </div>
                  ) : null}

                  {shareMessage ? (
                    <div className="alert ainfo" style={{ fontSize: 12 }}>
                      <span>◈</span>
                      <div>{shareMessage}</div>
                    </div>
                  ) : null}

                  <div style={{ paddingTop: 4 }}>
                    <div className="sh">Delivery Status</div>
                    {isDeliveryHistoryLoading ? (
                      <div style={{ fontSize: 12, color: "var(--fog)" }}>Refreshing latest delivery state...</div>
                    ) : deliveryHistory.length === 0 ? (
                      <div style={{ fontSize: 12, color: "var(--fog)" }}>
                        No delivery attempts recorded yet. Once you send the quote, status will show here.
                      </div>
                    ) : (
                      <div className="vs" style={{ gap: 6 }}>
                        {deliveryHistory.map((attempt) => (
                          <div
                            key={attempt.delivery_id}
                            style={{ border: "1px solid var(--wire)", padding: "8px 10px" }}
                          >
                            <div className="sp" style={{ marginBottom: 4, gap: 8 }}>
                              <div style={{ fontSize: 12, color: "var(--cream)" }}>
                                {attempt.channel.toUpperCase()} · {attempt.recipient || attempt.destination}
                              </div>
                              <span className={`tag ${deliveryStatusTone(attempt.status)}`}>{attempt.status}</span>
                            </div>
                            <div
                              style={{
                                fontFamily: "'Syne Mono', monospace",
                                fontSize: 8,
                                color: "var(--fog)",
                                letterSpacing: "0.5px",
                              }}
                            >
                              {attempt.destination} · {formatDeliveryTimestamp(attempt.sent_at)}
                            </div>
                            {attempt.error_message ? (
                              <div style={{ marginTop: 6, fontSize: 12, color: "var(--red-hi)" }}>
                                {attempt.error_message}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {editMode ? (
                <div className="panel ani a1">
                  <div className="ph2">
                    <span className="ptl">Contractor Edits</span>
                  </div>
                  <div className="pb vs">
                    <div>
                      <label className="lbl" htmlFor="edited-scope">
                        Scope edits
                      </label>
                      <textarea
                        id="edited-scope"
                        className="txta"
                        rows={6}
                        value={editedScopeOfWork}
                        onChange={(event) => setEditedScopeOfWork(event.target.value)}
                      />
                    </div>

                    <div>
                      <label className="lbl" htmlFor="edited-total">
                        Final total price
                      </label>
                      <input
                        id="edited-total"
                        className="inp"
                        type="number"
                        value={editedTotalPrice}
                        onChange={(event) => setEditedTotalPrice(event.target.value)}
                      />
                    </div>

                    <div>
                      <label className="lbl" htmlFor="feedback-note">
                        Feedback note
                      </label>
                      <input
                        id="feedback-note"
                        className="inp"
                        type="text"
                        value={feedbackNote}
                        onChange={(event) => setFeedbackNote(event.target.value)}
                        placeholder="Why this changed"
                      />
                    </div>

                    <button
                      type="button"
                      className="cta"
                      style={{ width: "100%", textAlign: "center", display: "block" }}
                      onClick={() => decisionMutation.mutate("edit")}
                      disabled={decisionMutation.isPending || !apiReady}
                    >
                      {decisionMutation.isPending && decisionMutation.variables === "edit"
                        ? "SAVING..."
                        : "SAVE EDITS + APPROVE"}
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="panel ani a1">
                <div className="ph2">
                  <span className="ptl">Customer Follow-through</span>
                </div>
                <div className="pb">
                  {isFollowupLoading ? (
                    <div style={{ fontSize: 12, color: "var(--fog)" }}>Checking the latest reminder schedule...</div>
                  ) : (
                    <>
                      <div className="sp" style={{ marginBottom: 8 }}>
                        <span style={{ fontSize: 12, color: "var(--steel)" }}>Auto reminders</span>
                        <div className="hs" style={{ gap: 8 }}>
                          {canStopFollowup ? (
                            <button
                              type="button"
                              className="btn bw sm"
                              onClick={() => stopFollowupMutation.mutate()}
                              disabled={stopFollowupMutation.isPending}
                            >
                              {stopFollowupMutation.isPending ? "Stopping..." : "Stop reminders"}
                            </button>
                          ) : null}
                          <span className={`tag ${followupTone(followupState)}`}>{followupStatusLabel(followupState)}</span>
                        </div>
                      </div>

                      <div style={{ fontSize: 12, color: "var(--cream)", marginBottom: 10 }}>
                        {followupSummary(followupState)}
                      </div>

                      <div className="ir">
                        <span className="ik">Next reminder</span>
                        <span className="iv">
                          {followupState && (followupState.status === "scheduled" || followupState.status === "pending_destination")
                            ? formatDeliveryTimestamp(followupState.next_due_at)
                            : "Not scheduled"}
                        </span>
                      </div>
                      <div className="ir">
                        <span className="ik">Reminders sent</span>
                        <span className="iv m">{followupState?.reminder_count ?? 0}</span>
                      </div>
                      <div className="ir">
                        <span className="ik">Last reminder</span>
                        <span className="iv">{formatDeliveryTimestamp(followupState?.last_reminder_at ?? null)}</span>
                      </div>
                      <div className="ir">
                        <span className="ik">Channel</span>
                        <span className="iv">{followupChannel(followupState?.channel ?? null)}</span>
                      </div>

                      {followupState?.status === "stopped" ? (
                        <div style={{ marginTop: 10, border: "1px solid var(--wire)", padding: "9px 10px" }}>
                          <div className="lbl" style={{ marginBottom: 2 }}>
                            Why it stopped
                          </div>
                          <div style={{ fontSize: 12, color: "var(--cream)" }}>
                            {followupStopReason(followupState.stop_reason)}
                          </div>
                          {followupState.stopped_at ? (
                            <div
                              style={{
                                marginTop: 4,
                                fontFamily: "'Syne Mono', monospace",
                                fontSize: 8,
                                color: "var(--fog)",
                              }}
                            >
                              STOPPED {formatDeliveryTimestamp(followupState.stopped_at).toUpperCase()}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </div>

              {followupMessage ? (
                <div className="alert aok">
                  <span>✓</span>
                  <div>{followupMessage}</div>
                </div>
              ) : null}
            </>
          ) : null}

          <div className="panel ani a2">
            <div className="ph2">
              <span className="ptl">Quote Context</span>
            </div>
            <div className="pb">
              {[
                ["Price book", estimateSignalSummary, true],
                ["Trade focus", memoryTrade, false],
                ["Similar jobs", similarJobsLabel, false],
                [
                  "Draft readiness",
                  activeQuote
                    ? `${confidenceScore}% confidence`
                    : transcriptPrefill
                      ? "Transcript context loaded"
                      : apiReady
                        ? "Waiting for first draft"
                        : "Configure API access",
                  false,
                ],
              ].map(([key, value, badge]) => (
                <div className="ir" key={String(key)}>
                  <span className="ik">{key}</span>
                  {badge ? (
                    <span className={`tag ${estimateSignalTone}`} style={{ marginLeft: "auto" }}>
                      {value}
                    </span>
                  ) : (
                    <span className="iv m">{value}</span>
                  )}
                </div>
              ))}
              <hr className="wd" />
              <button
                type="button"
                className="btn bw"
                style={{ width: "100%", justifyContent: "center", marginBottom: 10 }}
                onClick={() => navigate("/onboarding?pricing=1")}
              >
                Import price book
              </button>
              {readinessSignals.length ? (
                <div style={{ marginBottom: 10 }}>
                  <div className="lbl" style={{ marginBottom: 6 }}>
                    Draft evidence
                  </div>
                  <div className="hs" style={{ flexWrap: "wrap", gap: 6 }}>
                    {readinessSignals.map((signal) => (
                      <span key={`evidence-${signal}`} className="tag tb">
                        {signal}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div
                style={{
                  fontFamily: "'Syne Mono', monospace",
                  fontSize: 8,
                  color: "var(--fog)",
                  lineHeight: 1.8,
                  letterSpacing: "0.4px",
                }}
              >
                PRICE BOOKS AND APPROVED QUOTES SHAPE FUTURE DRAFTS
                <br />
                MISSING DETAILS KEEP THE DRAFT IN REVIEW BEFORE SEND
                <br />
                {bypassAuth ? "DEMO MODE ACTIVE" : apiReady ? "PUBLIC QUOTE DELIVERY CONNECTED" : "CONFIGURE PUBLIC API CREDENTIALS"}
              </div>
            </div>
          </div>

          {!activeQuote ? (
            <div className="panel ani a3">
              <div className="ph2">
                <span className="ptl">Before You Draft</span>
              </div>
              <div className="pb">
                <div className="vs" style={{ gap: 10 }}>
                  <div style={{ fontSize: 12, color: "var(--steel)", lineHeight: 1.7 }}>
                    Keep the request short and concrete. The draft does not need every answer yet, but thin input means more review before anything goes to the customer.
                  </div>
                  <div
                    style={{
                      fontFamily: "'Syne Mono', monospace",
                      fontSize: 8,
                      color: "var(--fog)",
                      lineHeight: 1.8,
                      letterSpacing: "0.4px",
                    }}
                  >
                    INCLUDE:
                    <br />
                    MEASUREMENTS · MATERIAL GRADE · SITE ACCESS · DEADLINE
                  </div>
                </div>
              </div>
            </div>
          ) : activeQuote.rendered_quote ? (
            <div className="panel ani a3">
              <div className="ph2">
                <span className="ptl">Rendered Preview</span>
              </div>
              <div className="pb">
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    fontFamily: "'Syne Mono', monospace",
                    fontSize: 10,
                    lineHeight: 1.8,
                    color: "var(--steel)",
                  }}
                >
                  {activeQuote.rendered_quote}
                </pre>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
