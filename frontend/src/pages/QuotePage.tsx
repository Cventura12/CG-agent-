import { useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { UserButton, useClerk } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { Loader2, Mic, Send, Square, TriangleAlert } from "lucide-react";

import { fetchQuotePdf, getBetaContractorId, hasBetaApiCredentials, submitQuote } from "../api/quote";
import type { QuoteDraft, QuoteLineItem, QuoteResponse } from "../types";

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

export function QuotePage() {
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const autoSubmitRef = useRef(false);
  const latestTranscriptRef = useRef("");

  const [notes, setNotes] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [voiceSupported] = useState(() => Boolean(getSpeechRecognitionConstructor()));
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [activeQuote, setActiveQuote] = useState<QuoteResponse | null>(null);

  const { signOut } = useClerk();

  const quoteMutation = useMutation({
    mutationFn: async (input: string) => submitQuote(input),
    onSuccess: (payload) => {
      setActiveQuote(payload);
      setShareMessage(null);
      if (payload.errors.length > 0) {
        setCaptureError(payload.errors[0] ?? null);
      } else {
        setCaptureError(null);
      }
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Quote request failed. Check API key and contractor ID.";
      setCaptureError(message);
    },
  });

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

  const apiReady = hasBetaApiCredentials();

  const helperText = useMemo(() => {
    if (!voiceSupported) {
      return "Web Speech API is unavailable in this browser. Type field notes below and send manually.";
    }
    return isRecording
      ? "Listening now. Release to send the transcript."
      : "Press and hold to capture a voice note. Release to send.";
  }, [isRecording, voiceSupported]);

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
          quoteMutation.mutate(transcript);
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
    const trimmed = notes.trim();
    if (!trimmed || quoteMutation.isPending) {
      return;
    }
    setActiveQuote(null);
    setCaptureError(null);
    setShareMessage(null);
    latestTranscriptRef.current = trimmed;
    quoteMutation.mutate(trimmed);
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
            </div>
          </div>
        </header>

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

          <div className="mt-5">
            <button
              type="button"
              onPointerDown={beginRecording}
              onPointerUp={stopRecordingAndSend}
              onPointerLeave={stopRecordingAndSend}
              onPointerCancel={stopRecordingAndSend}
              disabled={!voiceSupported || !apiReady || quoteMutation.isPending}
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
              disabled={!apiReady || !notes.trim() || quoteMutation.isPending}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-green px-5 py-3 text-sm font-medium text-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {quoteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              <span>{quoteMutation.isPending ? "Running agent..." : "Send Notes"}</span>
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
            <QuotePreviewCard quote={activeQuote.quote_draft} />

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
