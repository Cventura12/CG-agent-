import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Clock3,
  Download,
  FileSpreadsheet,
  Mail,
  MessageSquareMore,
  Phone,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import { fetchTranscriptQuotePrefill } from "../api/transcripts";
import { NewQuoteInput, type NewQuoteInputMode } from "../components/NewQuoteInput";
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
  const latestTranscriptRef = useRef("");
  const voiceDraftBaseRef = useRef("");
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
  const [inputMode, setInputMode] = useState<NewQuoteInputMode>(null);
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
    setInputMode(null);
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
        setInputMode(null);
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
      setQueueMessage("Quote API not available. Contact your workspace administrator.");
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
          text: quote.quote_draft.project_address || "Arbor quote ready to send",
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
      return "Web Speech API is unavailable in this browser. Keep typing your notes and generate the quote manually.";
    }
    return isRecording
      ? "Listening now. Release to keep the voice memo in the draft."
      : "Press and hold to capture a voice memo. Release to keep it in the draft.";
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
          const baseNotes = voiceDraftBaseRef.current.trim();
          setNotes(baseNotes ? `${baseNotes}\n\n${normalized}` : normalized);
        }
      };

      recognition.onerror = (event) => {
        const message = event.error ? `Voice capture failed: ${event.error}` : "Voice capture failed.";
        setCaptureError(message);
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    }

    setCaptureError(null);
    setActiveQuote(null);
    voiceDraftBaseRef.current = notes.trim();
    latestTranscriptRef.current = "";
    setIsRecording(true);
    recognitionRef.current.start();
  };

  const stopRecording = () => {
    if (!recognitionRef.current || !isRecording) {
      return;
    }

    recognitionRef.current.stop();
  };

  const handleUploadSelection = (
    file: File | null,
    mode: Exclude<NewQuoteInputMode, "voice" | null>
  ) => {
    if (!file) {
      setSelectedUploadFile(null);
      return;
    }

    if (!ACCEPTED_UPLOAD_TYPES.has(file.type)) {
      setCaptureError("Only PDF, JPG, and PNG uploads are supported.");
      setSelectedUploadFile(null);
      return;
    }

    setCaptureError(null);
    setSelectedUploadFile(file);
    setInputMode(mode);
  };

  const clearSelectedUpload = () => {
    setSelectedUploadFile(null);
  };

  const handleActivateInputMode = (mode: Exclude<NewQuoteInputMode, null>) => {
    if (mode !== "voice" && isRecording) {
      recognitionRef.current?.stop();
    }
    if (mode === "voice") {
      clearSelectedUpload();
    }
    if (mode === "photo" && selectedUploadFile?.type === "application/pdf") {
      clearSelectedUpload();
    }
    if (mode === "pdf" && selectedUploadFile && selectedUploadFile.type !== "application/pdf") {
      clearSelectedUpload();
    }
    setCaptureError(null);
    setInputMode(mode);
  };

  const dismissInputMode = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
    }
    clearSelectedUpload();
    setInputMode(null);
  };

  const handleManualSubmit = () => {
    submitInput(notes, inputMode === "voice" ? "voice" : "manual", selectedUploadFile);
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
  const readinessBadgeLabel = !isOnline
    ? "Offline"
    : offlineQueue.length > 0
      ? `${offlineQueue.length} queued`
      : "Ready";
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
  const reviewStatusTone =
    decisionStatus === "discarded"
      ? "tr"
      : quoteReviewRequired
        ? "ta"
        : "tg";
  const deliveryChannelOptions = [
    { key: "sms", label: "SMS", icon: Phone },
    { key: "whatsapp", label: "WhatsApp", icon: MessageSquareMore },
    { key: "email", label: "Email", icon: Mail },
  ] as const;
  const latestDeliveryAttempt = deliveryHistory[0] ?? null;
  const deliveryStatusSummary = latestDeliveryAttempt
    ? `${latestDeliveryAttempt.channel.toUpperCase()} â¢ ${latestDeliveryAttempt.status}`
    : "No delivery attempt yet";
  const draftGuidePoints = activeQuote
    ? [
        "Approve when the pricing and scope are good enough for customer review.",
        "Use Send when you want the quote to move and reminders to start.",
        "Keep edits minimal and operational. This is a send surface, not a document builder.",
      ]
    : [
        "Keep the request tight. One concrete field note beats a paragraph of filler.",
        "Add measurements, material grade, schedule pressure, or access constraints when you have them.",
        "The goal is a draft you can review fast, not a perfect intake form.",
      ];

  return (
    <div className="pw gc-page">
      <section className="gc-command-card dark gc-fade-up">
        <div className="gc-command-body flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-[48rem]">
            <div className="gc-overline">Communication to quote</div>
            <div className="mt-2 text-[42px] font-semibold tracking-[-0.07em] text-white">New Quote</div>
            <div className="mt-3 max-w-[40rem] text-[14px] leading-7 text-white/62">
              Use one composer to turn messy field input into a draft you can actually review, price, send, and follow through.
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="gc-hero-status">{apiReady ? "Quote runtime connected" : "API credentials required"}</span>
              <span className="gc-micro-pill">{transcriptPrefill ? "Transcript attached" : "Manual intake"}</span>
              <span className="gc-micro-pill">{isOnline ? "Live sync" : "Offline cache"}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3.5 text-[12px] font-semibold text-white/86 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void syncQueuedNotes()}
              disabled={
                !apiReady ||
                !isOnline ||
                offlineQueue.length === 0 ||
                isQueueSyncing ||
                quoteMutation.isPending
              }
            >
              {isQueueSyncing ? "Syncing..." : offlineQueue.length > 0 ? "Sync queued notes" : "Ready"}
            </button>
          </div>
        </div>
      </section>

      {firstSessionMode ? (
        <div className="alert ainfo" style={{ marginBottom: 14 }}>
          <span>i</span>
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
          <div>Quote delivery is not yet configured. Contact your administrator to complete setup.</div>
        </div>
      ) : null}

      <div className="tcol" style={{ marginTop: 14 }}>
        <div className="vs">
          {phase === "input" ? (
            <div className="overflow-hidden rounded-[24px] border border-[var(--gc-line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(244,248,255,0.86))] shadow-[var(--gc-shadow)] backdrop-blur-[18px]">
              <div className="border-b border-[var(--gc-line)] bg-[linear-gradient(135deg,rgba(49,95,255,0.08),transparent_45%),rgba(255,255,255,0.56)] px-5 py-4">
                <div className="text-[15px] font-semibold text-[var(--gc-ink)]">Input context</div>
                <div className="mt-1.5 text-[13px] leading-6 text-[var(--gc-ink-soft)]">Capture what happened, tighten the request, and only then draft the quote.</div>
              </div>

              <div className="px-5 py-5">
                <div className="mb-4 flex items-center justify-between gap-4 rounded-[18px] border border-[var(--gc-line)] bg-[rgba(49,95,255,0.06)] px-4 py-3">
                  <div>
                    <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--gc-ink-muted)]">Estimate readiness</div>
                    <div className="mt-1 text-[14px] font-semibold text-[var(--gc-ink)]">{readinessHeadline}</div>
                    <div className="mt-1 text-[12px] text-[var(--gc-ink-soft)]">{readinessDetail}</div>
                  </div>
                  <span className={`gc-chip ${isOnline ? "info" : "warn"}`}>{isOnline ? "Live" : "Offline cache"}</span>
                </div>

                {queueMessage ? (
                  <div className="alert aok" style={{ marginBottom: 12 }}>
                    <span>OK</span>
                    <div>{queueMessage}</div>
                  </div>
                ) : null}

                {isTranscriptPrefillLoading ? (
                  <div className="alert ainfo" style={{ marginBottom: 12 }}>
                    <span>i</span>
                    <div>Loading call context for this quote...</div>
                  </div>
                ) : null}

                {transcriptPrefillError ? (
                  <div className="alert awarn" style={{ marginBottom: 12 }}>
                    <span>!</span>
                    <div>{transcriptPrefillError}</div>
                  </div>
                ) : null}

                {transcriptPrefill ? (
                  <div className="alert ainfo" style={{ marginBottom: 16 }}>
                    <span>i</span>
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

                <NewQuoteInput
                  notes={notes}
                  onNotesChange={(value) => {
                    latestTranscriptRef.current = value;
                    setNotes(value);
                  }}
                  activeMode={inputMode}
                  onActivateMode={handleActivateInputMode}
                  onDismissMode={dismissInputMode}
                  selectedUploadFile={selectedUploadFile}
                  onUploadSelected={handleUploadSelection}
                  onClearUpload={clearSelectedUpload}
                  onBeginRecording={beginRecording}
                  onStopRecording={stopRecording}
                  isRecording={isRecording}
                  voiceSupported={voiceSupported}
                  helperText={helperText}
                  readinessLabel={readinessBadgeLabel}
                  onGenerate={handleManualSubmit}
                  generateLabel={
                    quoteMutation.isPending
                      ? "Building quote..."
                      : !isOnline && selectedUploadFile
                        ? "Upload needs connection"
                        : "Generate quote"
                  }
                  generateDisabled={
                    !apiReady ||
                    (!notes.trim() && !selectedUploadFile) ||
                    (!isOnline && Boolean(selectedUploadFile)) ||
                    quoteMutation.isPending ||
                    isQueueSyncing
                  }
                  isBusy={quoteMutation.isPending || isQueueSyncing}
                />

                <div className="mt-4 rounded-[18px] border border-[var(--gc-line)] bg-[rgba(255,255,255,0.62)] p-4">
                  <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--gc-ink-muted)]">What sharpens the draft</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {preflightChecklist.map((item) => (
                      <span key={`preflight-${item}`} className="tag ts">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>

                {captureError ? (
                  <div className="alert awarn" style={{ marginTop: 16 }}>
                    <span>!</span>
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
              <section className="overflow-hidden rounded-[26px] border border-[var(--gc-line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(246,249,255,0.9))] shadow-[var(--gc-shadow)]">
                <div className="border-b border-white/8 bg-[radial-gradient(circle_at_top_right,rgba(49,95,255,0.18),transparent_34%),linear-gradient(135deg,rgba(9,14,26,0.96),rgba(15,24,42,0.94))] px-5 py-5 text-white">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                    <div className="max-w-[38rem]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="gc-overline !text-white/38">Quote draft</span>
                        <span className="gc-micro-pill">{activeQuote.quote_id}</span>
                      </div>
                      <div className="mt-3 text-[30px] font-semibold tracking-[-0.07em]">
                        {activeQuote.quote_draft.customer_name || "Customer pending"}
                      </div>
                      <div className="mt-1 text-[14px] leading-7 text-white/60">
                        {activeQuote.quote_draft.project_address || "Project address pending"}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className={`gc-chip ${reviewStatusTone}`}>{reviewStatusLabel}</span>
                        <span className={`gc-chip ${quoteSendBlocked ? "warn" : "success"}`}>
                          {quoteSendBlocked ? "Send blocked" : "Ready to deliver"}
                        </span>
                        <span className="gc-chip soft !border-white/10 !bg-white/[0.06] !text-white/80">
                          Pricing baseline {activeQuote.cold_start.active ? "partial" : "applied"}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-[20px] border border-white/10 bg-white/[0.05] px-5 py-4 text-right">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-white/40">Draft total</div>
                      <div className="mt-2 text-[34px] font-semibold tracking-[-0.07em]">{formatCurrency(activeQuote.quote_draft.total_price)}</div>
                      <div className="mt-1 text-[12px] text-white/54">
                        {confidenceScore}% confidence â¢ {quoteReviewRequired ? "Review before send" : "Customer-ready"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 px-5 py-5">
                  {quoteMissingInformation.length ? (
                    <div className="rounded-[18px] border border-[rgba(255,140,47,0.2)] bg-[rgba(255,140,47,0.08)] px-4 py-4">
                      <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-[#bc610b]">
                        <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                        Missing information to confirm
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {quoteMissingInformation.map((item) => (
                          <span key={`quote-missing-${item}`} className="tag ta">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {quoteEvidenceSignals.length ? (
                    <div className="rounded-[18px] border border-[rgba(49,95,255,0.14)] bg-[rgba(49,95,255,0.06)] px-4 py-4">
                      <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-[#214be0]">
                        <Sparkles className="h-4 w-4" aria-hidden="true" />
                        What this draft is reading from
                      </div>
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {quoteEvidenceSignals.map((signal) => (
                          <div
                            key={signal}
                            className="rounded-[14px] border border-[rgba(49,95,255,0.1)] bg-white/72 px-3 py-3 text-[13px] leading-6 text-[var(--gc-ink-soft)]"
                          >
                            {signal}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="rounded-[22px] border border-[var(--gc-line)] bg-white/72 p-4">
                      <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--gc-ink-muted)]">
                        Scope of work
                      </div>
                      <div className="mt-3 whitespace-pre-wrap text-[14px] leading-7 text-[var(--gc-ink-soft)]">
                        {activeQuote.quote_draft.scope_of_work}
                      </div>
                    </div>

                    <div className="rounded-[22px] border border-[var(--gc-line)] bg-[rgba(249,251,255,0.9)] p-4">
                      <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--gc-ink-muted)]">
                        Draft posture
                      </div>
                      <div className="mt-3 space-y-3">
                        <div className="rounded-[16px] border border-[var(--gc-line)] bg-white/80 px-3 py-3">
                          <div className="text-[11px] uppercase tracking-[0.1em] text-[var(--gc-ink-muted)]">Confidence</div>
                          <div className="mt-1 flex items-end justify-between gap-3">
                            <div className={`text-[28px] font-semibold tracking-[-0.06em] ${confidenceClass}`}>{confidenceScore}%</div>
                            <div className="h-2 w-[96px] overflow-hidden rounded-full bg-[rgba(24,45,99,0.08)]">
                              <div className="h-full rounded-full" style={{ width: `${confidenceScore}%`, background: confidenceFill }} />
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-2">
                          {[
                            ["Price book", estimateSignalSummary],
                            ["Trade focus", memoryTrade],
                            ["Similar jobs", similarJobsLabel],
                          ].map(([label, value]) => (
                            <div key={label} className="flex items-start justify-between gap-3 rounded-[14px] border border-[var(--gc-line)] bg-white/76 px-3 py-3">
                              <div className="text-[12px] text-[var(--gc-ink-muted)]">{label}</div>
                              <div className="max-w-[11rem] text-right font-mono text-[12px] text-[var(--gc-blue)]">{value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-[var(--gc-line)] bg-white/76 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--gc-ink-muted)]">
                        Line items
                      </div>
                      <div className="text-[11px] text-[var(--gc-ink-muted)]">
                        {lineItems.length > 0 ? `${lineItems.length} priced item${lineItems.length === 1 ? "" : "s"}` : "No line items returned"}
                      </div>
                    </div>

                    <div className="mt-3 divide-y divide-[rgba(24,45,99,0.08)]">
                      {lineItems.length > 0 ? (
                        lineItems.map((item, index) => (
                          <div key={`${lineItemLabel(item)}-${index}`} className="grid gap-2 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                            <div>
                              <div className="text-[14px] font-semibold text-[var(--gc-ink)]">{lineItemLabel(item)}</div>
                              <div className="mt-1 text-[12px] leading-6 text-[var(--gc-ink-soft)]">
                                {item.quantity ?? 0} {item.unit ?? "unit"}
                                {typeof item.unit_cost === "number" && Number.isFinite(item.unit_cost)
                                  ? ` â¢ ${formatCurrency(item.unit_cost)} each`
                                  : ""}
                              </div>
                            </div>
                            <div className="text-right text-[16px] font-semibold tracking-[-0.03em] text-[var(--gc-ink)]">
                              {formatCurrency(lineItemTotal(item))}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="py-3 text-[13px] text-[var(--gc-ink-soft)]">
                          No material line items were returned.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-[22px] border border-[var(--gc-line)] bg-white/72 p-4">
                      <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--gc-ink-muted)]">
                        Assumptions & clarification
                      </div>
                      <div className="mt-3 space-y-2">
                        {assumptions.length > 0 ? (
                          assumptions.map((assumption) => (
                            <div key={assumption} className="rounded-[14px] border border-[rgba(255,140,47,0.16)] bg-[rgba(255,140,47,0.08)] px-3 py-3 text-[13px] leading-6 text-[var(--gc-ink-soft)]">
                              {assumption}
                            </div>
                          ))
                        ) : (
                          <div className="rounded-[14px] border border-[var(--gc-line)] bg-white/70 px-3 py-3 text-[13px] text-[var(--gc-ink-soft)]">
                            No explicit assumptions returned.
                          </div>
                        )}

                        {clarificationQuestions.length > 0 ? (
                          <div className="rounded-[14px] border border-[rgba(49,95,255,0.16)] bg-[rgba(49,95,255,0.07)] px-3 py-3">
                            <div className="text-[11px] uppercase tracking-[0.12em] text-[#214be0]">Clarification needed</div>
                            <div className="mt-2 space-y-2 text-[13px] leading-6 text-[var(--gc-ink-soft)]">
                              {clarificationQuestions.map((question) => (
                                <div key={question}>{question}</div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-[22px] border border-[var(--gc-line)] bg-white/72 p-4">
                      <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--gc-ink-muted)]">
                        Exclusions & send posture
                      </div>
                      <div className="mt-3 space-y-3">
                        <div className="rounded-[14px] border border-[var(--gc-line)] bg-white/70 px-3 py-3 text-[13px] leading-6 text-[var(--gc-ink-soft)]">
                          {quoteReviewRequired
                            ? "This draft still needs contractor review before anything goes to the customer."
                            : "This draft is staged for delivery. The right rail controls send and customer follow-through."}
                        </div>

                        {exclusions.length > 0 ? (
                          <div className="space-y-2">
                            {exclusions.map((item) => (
                              <div key={item} className="rounded-[14px] border border-[var(--gc-line)] bg-white/70 px-3 py-3 text-[13px] leading-6 text-[var(--gc-ink-soft)]">
                                {item}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-[14px] border border-[var(--gc-line)] bg-white/70 px-3 py-3 text-[13px] text-[var(--gc-ink-soft)]">
                            No exclusions were returned on this draft.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--gc-line)] bg-[rgba(248,250,255,0.72)] px-5 py-4">
                  <div className="text-[12px] leading-6 text-[var(--gc-ink-soft)]">
                    {quoteReviewRequired
                      ? "Approve or edit the draft first. Send stays blocked until the review state is clean."
                      : "The draft is ready to move. Use the rail to send, export, or let reminders take over."}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn bg"
                      onClick={() => decisionMutation.mutate("approve")}
                      disabled={decisionMutation.isPending || !apiReady}
                    >
                      {decisionMutation.isPending && decisionMutation.variables === "approve" ? "Saving..." : "Approve"}
                    </button>
                    <button
                      type="button"
                      className="btn bw"
                      onClick={() => setEditMode((current) => !current)}
                      disabled={decisionMutation.isPending || !apiReady}
                    >
                      {editMode ? "Close edits" : "Edit draft"}
                    </button>
                    <button
                      type="button"
                      className="btn brd"
                      onClick={() => decisionMutation.mutate("discard")}
                      disabled={decisionMutation.isPending || !apiReady}
                    >
                      {decisionMutation.isPending && decisionMutation.variables === "discard" ? "Saving..." : "Discard"}
                    </button>
                  </div>
                </div>
              </section>

              {decisionMessage ? (
                <div className="alert aok">
                  <span>OK</span>
                  <div>{decisionMessage}</div>
                </div>
              ) : null}

              {editMode ? (
                <section className="overflow-hidden rounded-[24px] border border-[var(--gc-line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(246,249,255,0.86))] shadow-[var(--gc-shadow)]">
                  <div className="border-b border-[var(--gc-line)] bg-[linear-gradient(135deg,rgba(49,95,255,0.08),transparent_45%),rgba(255,255,255,0.56)] px-5 py-4">
                    <div className="text-[15px] font-semibold text-[var(--gc-ink)]">Contractor edits</div>
                    <div className="mt-1 text-[13px] leading-6 text-[var(--gc-ink-soft)]">
                      Tighten scope and price here, then save the edits back into the approved draft.
                    </div>
                  </div>
                  <div className="space-y-4 px-5 py-5">
                    <div>
                      <label className="lbl" htmlFor="edited-scope">
                        Scope edits
                      </label>
                      <textarea
                        id="edited-scope"
                        className="txta"
                        rows={7}
                        value={editedScopeOfWork}
                        onChange={(event) => setEditedScopeOfWork(event.target.value)}
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
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
                    </div>

                    <button
                      type="button"
                      className="cta"
                      style={{ width: "100%", textAlign: "center", display: "block" }}
                      onClick={() => decisionMutation.mutate("edit")}
                      disabled={decisionMutation.isPending || !apiReady}
                    >
                      {decisionMutation.isPending && decisionMutation.variables === "edit"
                        ? "Saving edits..."
                        : "Save edits + approve"}
                    </button>
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="vs him">
          {phase === "review" && activeQuote ? (
            <>
              <section className="overflow-hidden rounded-[24px] border border-[var(--gc-line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,248,255,0.88))] shadow-[var(--gc-shadow)]">
                <div className="border-b border-[var(--gc-line)] bg-[linear-gradient(135deg,rgba(49,95,255,0.08),transparent_45%),rgba(255,255,255,0.56)] px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[15px] font-semibold text-[var(--gc-ink)]">Send & delivery</div>
                      <div className="mt-1 text-[13px] text-[var(--gc-ink-soft)]">Move the quote out, then watch response and delivery here.</div>
                    </div>
                    <button
                      type="button"
                      className="btn bw sm"
                      onClick={() => void loadDeliveryHistory(activeQuote.quote_id)}
                      disabled={isDeliveryHistoryLoading || !apiReady}
                    >
                      {isDeliveryHistoryLoading ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>
                </div>

                <div className="space-y-4 px-5 py-5">
                  <div className="grid gap-2 sm:grid-cols-3">
                    {deliveryChannelOptions.map((option) => {
                      const Icon = option.icon;
                      const active = deliveryChannel === option.key;
                      return (
                        <button
                          key={option.key}
                          type="button"
                          className={`flex h-10 items-center justify-center gap-2 rounded-[14px] border px-3 text-[12px] font-semibold transition ${
                            active
                              ? "border-[rgba(49,95,255,0.2)] bg-[rgba(49,95,255,0.12)] text-[var(--gc-blue)] shadow-[0_8px_20px_rgba(49,95,255,0.12)]"
                              : "border-[var(--gc-line)] bg-white/74 text-[var(--gc-ink-soft)] hover:border-[rgba(49,95,255,0.18)] hover:text-[var(--gc-ink)]"
                          }`}
                          onClick={() => setDeliveryChannel(option.key)}
                        >
                          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                          {option.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid gap-4">
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
                  </div>

                  <button
                    type="button"
                    className="cta"
                    style={{ width: "100%", textAlign: "center", display: "block" }}
                    onClick={() => directDeliveryMutation.mutate()}
                    disabled={directDeliveryMutation.isPending || !apiReady || quoteSendBlocked}
                  >
                    {directDeliveryMutation.isPending
                      ? "Sending quote..."
                      : quoteSendBlocked
                        ? "Review required before send"
                        : "Send quote"}
                  </button>

                  {quoteSendBlocked ? (
                    <div className="rounded-[16px] border border-[rgba(255,140,47,0.18)] bg-[rgba(255,140,47,0.09)] px-4 py-4">
                      <div className="text-[11px] uppercase tracking-[0.12em] text-[#bc610b]">Delivery blocked</div>
                      <div className="mt-2 space-y-2 text-[13px] leading-6 text-[var(--gc-ink-soft)]">
                        {quoteBlockingReasons.map((reason) => (
                          <div key={reason}>{reason}</div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {deliveryMessage ? (
                    <div className="alert aok" style={{ fontSize: 12 }}>
                      <span>OK</span>
                      <div>{deliveryMessage}</div>
                    </div>
                  ) : null}

                  {shareMessage ? (
                    <div className="alert ainfo" style={{ fontSize: 12 }}>
                      <span>i</span>
                      <div>{shareMessage}</div>
                    </div>
                  ) : null}

                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      className="btn bw"
                      style={{ width: "100%", justifyContent: "center" }}
                      onClick={() => sendMutation.mutate(activeQuote)}
                      disabled={sendMutation.isPending || !apiReady}
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      {sendMutation.isPending ? "Generating PDF..." : "Open PDF"}
                    </button>

                    <button
                      type="button"
                      className="btn bw"
                      style={{ width: "100%", justifyContent: "center" }}
                      onClick={() => exportXlsxMutation.mutate(activeQuote)}
                      disabled={exportXlsxMutation.isPending || !apiReady}
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
                      {exportXlsxMutation.isPending ? "Exporting..." : "Export XLSX"}
                    </button>
                  </div>

                  <div className="rounded-[18px] border border-[var(--gc-line)] bg-white/74 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--gc-ink-muted)]">
                        Delivery status
                      </div>
                      <span className={`tag ${latestDeliveryAttempt ? deliveryStatusTone(latestDeliveryAttempt.status) : "ts"}`}>
                        {latestDeliveryAttempt ? latestDeliveryAttempt.status : "Idle"}
                      </span>
                    </div>
                    <div className="mt-2 text-[13px] leading-6 text-[var(--gc-ink-soft)]">
                      {deliveryStatusSummary}
                    </div>
                    <div className="mt-3 space-y-2">
                      {isDeliveryHistoryLoading ? (
                        <div className="text-[12px] text-[var(--gc-ink-soft)]">Refreshing latest delivery state...</div>
                      ) : deliveryHistory.length === 0 ? (
                        <div className="text-[12px] text-[var(--gc-ink-soft)]">
                          No delivery attempts recorded yet. Once you send the quote, status will show here.
                        </div>
                      ) : (
                        deliveryHistory.map((attempt) => (
                          <div
                            key={attempt.delivery_id}
                            className="rounded-[14px] border border-[var(--gc-line)] bg-[rgba(248,250,255,0.86)] px-3 py-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-[13px] font-semibold text-[var(--gc-ink)]">
                                  {attempt.channel.toUpperCase()} â¢ {attempt.recipient || attempt.destination}
                                </div>
                                <div className="mt-1 font-mono text-[11px] text-[var(--gc-ink-muted)]">
                                  {attempt.destination} â¢ {formatDeliveryTimestamp(attempt.sent_at)}
                                </div>
                              </div>
                              <span className={`tag ${deliveryStatusTone(attempt.status)}`}>{attempt.status}</span>
                            </div>
                            {attempt.error_message ? (
                              <div className="mt-2 text-[12px] leading-6 text-[var(--red-hi)]">{attempt.error_message}</div>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section className="overflow-hidden rounded-[24px] border border-[var(--gc-line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,248,255,0.88))] shadow-[var(--gc-shadow)]">
                <div className="border-b border-[var(--gc-line)] bg-[linear-gradient(135deg,rgba(49,95,255,0.08),transparent_45%),rgba(255,255,255,0.56)] px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[15px] font-semibold text-[var(--gc-ink)]">Customer follow-through</div>
                      <div className="mt-1 text-[13px] text-[var(--gc-ink-soft)]">This is where the office keeps momentum after the draft leaves review.</div>
                    </div>
                    <span className={`gc-chip ${followupTone(followupState)}`}>{followupStatusLabel(followupState)}</span>
                  </div>
                </div>
                <div className="space-y-4 px-5 py-5">
                  {isFollowupLoading ? (
                    <div className="text-[12px] text-[var(--gc-ink-soft)]">Checking the latest reminder schedule...</div>
                  ) : (
                    <>
                      <div className="rounded-[16px] border border-[var(--gc-line)] bg-white/74 px-4 py-4 text-[13px] leading-6 text-[var(--gc-ink-soft)]">
                        {followupSummary(followupState)}
                      </div>

                      <div className="grid gap-2">
                        {[
                          [
                            "Next reminder",
                            followupState &&
                            (followupState.status === "scheduled" || followupState.status === "pending_destination")
                              ? formatDeliveryTimestamp(followupState.next_due_at)
                              : "Not scheduled",
                          ],
                          ["Reminders sent", String(followupState?.reminder_count ?? 0)],
                          ["Last reminder", formatDeliveryTimestamp(followupState?.last_reminder_at ?? null)],
                          ["Channel", followupChannel(followupState?.channel ?? null)],
                        ].map(([label, value]) => (
                          <div key={label} className="flex items-center justify-between gap-3 rounded-[14px] border border-[var(--gc-line)] bg-white/70 px-3 py-3">
                            <div className="text-[12px] text-[var(--gc-ink-muted)]">{label}</div>
                            <div className="text-right text-[12px] font-medium text-[var(--gc-ink)]">{value}</div>
                          </div>
                        ))}
                      </div>

                      {followupState?.status === "stopped" ? (
                        <div className="rounded-[16px] border border-[rgba(255,140,47,0.16)] bg-[rgba(255,140,47,0.08)] px-4 py-4">
                          <div className="text-[11px] uppercase tracking-[0.12em] text-[#bc610b]">Why it stopped</div>
                          <div className="mt-2 text-[13px] leading-6 text-[var(--gc-ink-soft)]">
                            {followupStopReason(followupState.stop_reason)}
                          </div>
                          {followupState.stopped_at ? (
                            <div className="mt-2 font-mono text-[11px] text-[var(--gc-ink-muted)]">
                              STOPPED {formatDeliveryTimestamp(followupState.stopped_at).toUpperCase()}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {canStopFollowup ? (
                        <button
                          type="button"
                          className="btn bw"
                          onClick={() => stopFollowupMutation.mutate()}
                          disabled={stopFollowupMutation.isPending}
                        >
                          {stopFollowupMutation.isPending ? "Stopping..." : "Stop reminders"}
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              </section>

              {followupMessage ? (
                <div className="alert aok">
                  <span>OK</span>
                  <div>{followupMessage}</div>
                </div>
              ) : null}
            </>
          ) : null}

          <section className="overflow-hidden rounded-[24px] border border-[var(--gc-line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,248,255,0.88))] shadow-[var(--gc-shadow)]">
            <div className="border-b border-[var(--gc-line)] bg-[linear-gradient(135deg,rgba(49,95,255,0.08),transparent_45%),rgba(255,255,255,0.56)] px-5 py-4">
              <div className="text-[15px] font-semibold text-[var(--gc-ink)]">
                {activeQuote ? "Draft context" : "Quote context"}
              </div>
              <div className="mt-1 text-[13px] text-[var(--gc-ink-soft)]">
                Pricing memory, intake signal, and the constraints shaping the current draft.
              </div>
            </div>
            <div className="space-y-3 px-5 py-5">
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
                <div key={String(key)} className="flex items-start justify-between gap-3 rounded-[14px] border border-[var(--gc-line)] bg-white/74 px-3 py-3">
                  <div className="text-[12px] text-[var(--gc-ink-muted)]">{key}</div>
                  {badge ? (
                    <span className={`tag ${estimateSignalTone}`}>{value}</span>
                  ) : (
                    <span className="max-w-[11rem] text-right font-mono text-[12px] text-[var(--gc-blue)]">{value}</span>
                  )}
                </div>
              ))}

              <button
                type="button"
                className="btn bw"
                style={{ width: "100%", justifyContent: "center" }}
                onClick={() => navigate("/onboarding?pricing=1")}
              >
                Import price book
              </button>

              {readinessSignals.length ? (
                <div>
                  <div className="mb-2 text-[11px] uppercase tracking-[0.12em] text-[var(--gc-ink-muted)]">Draft evidence</div>
                  <div className="flex flex-wrap gap-2">
                    {readinessSignals.map((signal) => (
                      <span key={`evidence-${signal}`} className="tag tb">
                        {signal}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="rounded-[16px] border border-[var(--gc-line)] bg-[rgba(9,14,26,0.96)] px-4 py-4 text-white shadow-[var(--gc-shadow-strong)]">
                <div className="text-[11px] uppercase tracking-[0.12em] text-white/38">Runtime note</div>
                <div className="mt-2 text-[13px] leading-6 text-white/62">
                  {apiReady
                    ? "Public quote delivery is connected. Missing details still keep the draft in review before send."
                    : "Quote delivery is not configured. Contact your administrator to complete setup."}
                </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-[24px] border border-[var(--gc-line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,248,255,0.88))] shadow-[var(--gc-shadow)]">
            <div className="border-b border-[var(--gc-line)] bg-[linear-gradient(135deg,rgba(49,95,255,0.08),transparent_45%),rgba(255,255,255,0.56)] px-5 py-4">
              <div className="text-[15px] font-semibold text-[var(--gc-ink)]">
                {activeQuote && activeQuote.rendered_quote ? "Rendered preview" : "Before you draft"}
              </div>
              <div className="mt-1 text-[13px] text-[var(--gc-ink-soft)]">
                {activeQuote && activeQuote.rendered_quote
                  ? "This is the customer-facing render the delivery tools will send or export."
                  : "A fast draft beats a bloated intake form. Use this panel to keep the ask sharp."}
              </div>
            </div>
            <div className="px-5 py-5">
              {activeQuote && activeQuote.rendered_quote ? (
                <pre className="max-h-[26rem] overflow-auto whitespace-pre-wrap rounded-[18px] border border-[var(--gc-line)] bg-[rgba(247,249,255,0.92)] px-4 py-4 font-mono text-[11px] leading-7 text-[var(--gc-ink-soft)]">
                  {activeQuote.rendered_quote}
                </pre>
              ) : (
                <div className="space-y-3">
                  {draftGuidePoints.map((point) => (
                    <div key={point} className="flex gap-3 rounded-[14px] border border-[var(--gc-line)] bg-white/74 px-3 py-3">
                      <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[rgba(49,95,255,0.1)] text-[var(--gc-blue)]">
                        <Clock3 className="h-3 w-3" aria-hidden="true" />
                      </span>
                      <div className="text-[13px] leading-6 text-[var(--gc-ink-soft)]">{point}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}


