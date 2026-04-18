import { FileText, Mic, Paperclip, Plus, Square, Upload, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { Job, QuoteDraftInput, QuoteIntakeSource, WorkspaceTranscriptQuotePrefill } from "../../types";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";

type QuoteComposerMode = "voice" | "photo" | "pdf" | null;

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
  results: {
    length: number;
    [index: number]: {
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

export interface QuoteComposerProps {
  initialJob?: Job | null;
  transcriptPrefill?: WorkspaceTranscriptQuotePrefill | null;
  isTranscriptPrefillLoading?: boolean;
  transcriptPrefillError?: string | null;
  onClose: () => void;
  onCreateDraft: (input: QuoteDraftInput) => void;
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") {
    return null;
  }

  const speechWindow = window as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function readinessLabel(notes: string, mode: QuoteComposerMode, selectedFile: File | null): { label: string; color: "accent" | "muted" | "blue" } {
  if (notes.trim().length > 0) {
    return { label: "Ready to draft", color: "accent" };
  }
  if (selectedFile || mode === "voice") {
    return { label: "Intake attached", color: "blue" };
  }
  return { label: "Needs intake", color: "muted" };
}

function sourceFromMode(mode: QuoteComposerMode, selectedFile: File | null): QuoteIntakeSource {
  if (mode === "voice") {
    return "voice";
  }
  if (mode === "pdf") {
    return "pdf";
  }
  if (mode === "photo" && selectedFile) {
    return "photo";
  }
  return "manual";
}

export function QuoteComposer({
  initialJob,
  transcriptPrefill,
  isTranscriptPrefillLoading = false,
  transcriptPrefillError = null,
  onClose,
  onCreateDraft,
}: QuoteComposerProps) {
  const [jobName, setJobName] = useState(initialJob?.name ?? "");
  const [customerName, setCustomerName] = useState(initialJob?.customerName ?? "");
  const [customerContact, setCustomerContact] = useState(initialJob?.customerContact ?? "");
  const [notes, setNotes] = useState("");
  const [activeMode, setActiveMode] = useState<QuoteComposerMode>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [captureMessage, setCaptureMessage] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [voiceSupported] = useState(() => Boolean(getSpeechRecognitionConstructor()));
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const baseDraftRef = useRef("");
  const appliedTranscriptPrefillIdRef = useRef<string | null>(null);

  const readiness = useMemo(() => readinessLabel(notes, activeMode, selectedFile), [activeMode, notes, selectedFile]);

  useEffect(() => {
    if (!transcriptPrefill?.transcript_id) {
      return;
    }
    if (appliedTranscriptPrefillIdRef.current === transcriptPrefill.transcript_id) {
      return;
    }

    appliedTranscriptPrefillIdRef.current = transcriptPrefill.transcript_id;
    setJobName((current) => current.trim() || initialJob?.name || "Transcript estimate request");
    setCustomerName((current) => current.trim() || transcriptPrefill.customer_name || transcriptPrefill.caller_name || "");
    setCustomerContact((current) => current.trim() || transcriptPrefill.caller_phone || "");
    setNotes(transcriptPrefill.quote_input || "");
    setActiveMode(null);
    setSelectedFile(null);
    setCaptureError(null);
    setCaptureMessage("Transcript context loaded into this draft.");
  }, [initialJob?.name, transcriptPrefill]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!isMenuOpen) {
        return;
      }

      const target = event.target as Node | null;
      if (target && (menuRef.current?.contains(target) || triggerRef.current?.contains(target))) {
        return;
      }
      setIsMenuOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isMenuOpen]);

  useEffect(() => {
    return () => {
      if (!recognitionRef.current) {
        return;
      }
      recognitionRef.current.onend = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onresult = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    };
  }, []);

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const beginRecording = useCallback(() => {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      setCaptureError("Voice memo is not available in this browser. You can still type or attach a file.");
      return;
    }

    if (isRecording) {
      stopRecording();
      return;
    }

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
      if (!normalized) {
        return;
      }

      setNotes(baseDraftRef.current ? `${baseDraftRef.current}\n\n${normalized}` : normalized);
    };
    recognition.onerror = (event) => {
      const message = event.error === "not-allowed" ? "Microphone permission was blocked." : "Voice memo stopped before it could finish.";
      setCaptureError(message);
      setCaptureMessage(null);
      setIsRecording(false);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setIsRecording(false);
      setCaptureMessage("Voice memo added to the draft.");
    };

    recognitionRef.current = recognition;
    baseDraftRef.current = notes.trim();
    setActiveMode("voice");
    setCaptureError(null);
    setCaptureMessage("Recording... tap again to stop.");
    setIsRecording(true);
    recognition.start();
  }, [isRecording, notes, stopRecording]);

  const handleUploadChange = useCallback(
    (mode: "photo" | "pdf") => (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      if (isRecording) {
        stopRecording();
      }
      setCaptureError(null);
      setCaptureMessage(null);

      if (!file) {
        setSelectedFile(null);
        return;
      }

      if (mode === "pdf" && file.type !== "application/pdf") {
        setCaptureError("Pick a PDF for that slot.");
        setSelectedFile(null);
        return;
      }

      if (mode === "photo" && !file.type.startsWith("image/")) {
        setCaptureError("Pick a photo or image file for that slot.");
        setSelectedFile(null);
        return;
      }

      setActiveMode(mode);
      setSelectedFile(file);
      setCaptureMessage(`${file.name} is attached to this draft.`);
    },
    [isRecording, stopRecording]
  );

  const dismissMode = useCallback(() => {
    if (isRecording) {
      stopRecording();
    }
    setActiveMode(null);
    setSelectedFile(null);
    setCaptureMessage(null);
    setCaptureError(null);
    if (photoInputRef.current) {
      photoInputRef.current.value = "";
    }
    if (pdfInputRef.current) {
      pdfInputRef.current.value = "";
    }
  }, [isRecording, stopRecording]);

  const handleCreateDraft = useCallback(() => {
    const trimmedNotes = notes.trim();
    if (!trimmedNotes) {
      setCaptureError("Add a quick scope note or record a voice memo before drafting.");
      return;
    }

    onCreateDraft({
      jobName,
      customerName,
      customerContact,
      notes: trimmedNotes,
      intakeSource: sourceFromMode(activeMode, selectedFile),
      attachmentName: selectedFile?.name,
    });
  }, [activeMode, customerContact, customerName, jobName, notes, onCreateDraft, selectedFile]);

  const modeTitle = activeMode === "voice" ? "Voice memo" : activeMode === "pdf" ? "PDF scope" : "Files or photos";

  return (
    <div className="absolute inset-0 z-30 bg-black/55 backdrop-blur-[2px]">
      <div className="flex h-full w-full items-stretch justify-end">
        <button type="button" className="hidden flex-1 lg:block" aria-label="Close new quote composer" onClick={onClose} />
        <section className="flex h-full w-full flex-col border-l border-[var(--line-2)] bg-[var(--bg-2)] sm:max-w-[560px]">
          <div className="border-b border-[var(--line)] px-4 py-4 sm:px-5">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--accent-2)]">New quote draft</div>
                <div className="mt-2 text-[16px] font-medium tracking-[-0.3px] text-[var(--t1)]">Capture the request, then let the agent shape the draft.</div>
                <div className="mt-2 max-w-[34rem] text-[12px] leading-relaxed text-[var(--t2)]">
                  Voice memo, typed notes, or a quick file drop all land in the same draft path. Nothing goes out until you review it.
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-[28px] w-[28px] items-center justify-center rounded-md border border-[var(--line-2)] text-[var(--t3)] transition hover:bg-[var(--bg-4)] hover:text-[var(--t1)]"
                aria-label="Close composer"
              >
                <X className="h-[14px] w-[14px]" strokeWidth={2} />
              </button>
            </div>
          </div>

          <div className="scrollbar-none flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
            <div className="space-y-4">
              <section className="rounded-[14px] border border-[var(--line-2)] bg-[var(--bg-3)] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-[12px] font-medium text-[var(--t1)]">Quote destination</div>
                  {initialJob ? <Badge label="FROM ACTIVE JOB" color="blue" /> : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <div className="mb-1.5 text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--t3)]">Job name</div>
                    <input
                      value={jobName}
                      onChange={(event) => setJobName(event.target.value)}
                      placeholder="Hartley reroof"
                      className="h-[40px] w-full rounded-md border border-[var(--line-2)] bg-[var(--bg)] px-3 text-[13px] text-[var(--t1)] outline-none transition placeholder:text-[var(--t3)] focus:border-[var(--line-4)]"
                    />
                  </label>
                  <label className="block">
                    <div className="mb-1.5 text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--t3)]">Customer</div>
                    <input
                      value={customerName}
                      onChange={(event) => setCustomerName(event.target.value)}
                      placeholder="Megan Hartley"
                      className="h-[40px] w-full rounded-md border border-[var(--line-2)] bg-[var(--bg)] px-3 text-[13px] text-[var(--t1)] outline-none transition placeholder:text-[var(--t3)] focus:border-[var(--line-4)]"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <div className="mb-1.5 text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--t3)]">Contact</div>
                    <input
                      value={customerContact}
                      onChange={(event) => setCustomerContact(event.target.value)}
                      placeholder="(423) 755-1546 or customer@example.com"
                      className="h-[40px] w-full rounded-md border border-[var(--line-2)] bg-[var(--bg)] px-3 text-[13px] text-[var(--t1)] outline-none transition placeholder:text-[var(--t3)] focus:border-[var(--line-4)]"
                    />
                  </label>
                </div>
              </section>

              <section className="overflow-hidden rounded-[16px] border border-[var(--line-2)] bg-[var(--bg-3)]">
                {isTranscriptPrefillLoading ? (
                  <div className="border-b border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-[12px] text-[var(--t2)]">
                    Loading transcript context into this draft...
                  </div>
                ) : null}

                {transcriptPrefillError ? (
                  <div className="border-b border-[var(--line)] bg-[var(--red-b)] px-4 py-3 text-[12px] text-[var(--red)]">
                    {transcriptPrefillError}
                  </div>
                ) : null}

                {transcriptPrefill ? (
                  <div className="border-b border-[var(--line)] bg-[var(--bg)] px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge label="TRANSCRIPT PREFILL" color="blue" />
                      <span className="font-mono text-[10px] text-[var(--t3)]">
                        {transcriptPrefill.classification.replace(/_/g, " ")}
                      </span>
                      {transcriptPrefill.linked_quote_id ? (
                        <span className="font-mono text-[10px] text-[var(--accent-2)]">
                          Linked quote {transcriptPrefill.linked_quote_id}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 text-[12px] leading-relaxed text-[var(--t1)]">{transcriptPrefill.summary}</div>
                  </div>
                ) : null}

                {activeMode ? (
                  <div className="border-b border-[var(--line)] px-4 py-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[12px] font-medium text-[var(--t1)]">{modeTitle}</div>
                      <div className="mt-1 text-[11px] leading-relaxed text-[var(--t2)]">
                          {activeMode === "voice"
                            ? "Use a quick voice memo to get the scope down fast. The transcript stays in the draft below."
                            : activeMode === "pdf"
                              ? "Attach the scope packet, then add the missing field context below."
                              : "Attach the site photo or file, then keep typing the job context below."}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={dismissMode}
                        className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-[var(--line-2)] text-[var(--t3)] transition hover:bg-[var(--bg-4)] hover:text-[var(--t1)]"
                        aria-label={`Dismiss ${modeTitle.toLowerCase()}`}
                      >
                        <X className="h-[12px] w-[12px]" strokeWidth={2} />
                      </button>
                    </div>

                    {activeMode === "voice" ? (
                      <div className="rounded-[12px] border border-[var(--line-2)] bg-[var(--bg)] p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="text-[13px] font-medium text-[var(--t1)]">{isRecording ? "Recording now" : "Voice memo ready"}</div>
                            <div className="mt-1 text-[11px] leading-relaxed text-[var(--t2)]">
                              {voiceSupported
                                ? isRecording
                                  ? "Tap again to stop. The transcript will stay in this draft."
                                  : "Tap to start recording. Works on phone and desktop when microphone permission is allowed."
                                : "This browser does not support speech capture. You can still type the scope below."}
                            </div>
                          </div>
                          <Button
                            variant={isRecording ? "outline-accent" : "accent"}
                            onClick={beginRecording}
                            disabled={!voiceSupported}
                            leftIcon={
                              isRecording ? (
                                <Square className="h-[14px] w-[14px]" strokeWidth={2} />
                              ) : (
                                <Mic className="h-[14px] w-[14px]" strokeWidth={2} />
                              )
                            }
                            className="h-[38px] w-full justify-center sm:w-auto sm:min-w-[158px]"
                          >
                            {isRecording ? "Stop recording" : "Start voice memo"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-[12px] border border-[var(--line-2)] bg-[var(--bg)] p-4">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <Button
                            variant="ghost"
                            onClick={() => (activeMode === "pdf" ? pdfInputRef.current?.click() : photoInputRef.current?.click())}
                            leftIcon={activeMode === "pdf" ? <FileText className="h-[14px] w-[14px]" strokeWidth={2} /> : <Upload className="h-[14px] w-[14px]" strokeWidth={2} />}
                          >
                            {selectedFile ? "Replace file" : activeMode === "pdf" ? "Choose PDF" : "Choose photo"}
                          </Button>
                          {selectedFile ? (
                            <Badge
                              label={selectedFile.name.length > 28 ? `${selectedFile.name.slice(0, 25)}...` : selectedFile.name}
                              color="blue"
                              className="max-w-full"
                            />
                          ) : (
                            <div className="text-[11px] text-[var(--t2)]">{activeMode === "pdf" ? "No PDF attached yet." : "No file attached yet."}</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="px-4 py-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--t3)]">Transcript / field notes</div>
                    <Badge label={readiness.label.toUpperCase()} color={readiness.color} />
                  </div>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={activeMode ? 7 : 9}
                    placeholder="Scope, measurements, materials, site constraints, customer asks..."
                    className="min-h-[220px] w-full resize-none rounded-[14px] border border-[var(--line-2)] bg-[var(--bg)] px-4 py-3 text-[13px] leading-relaxed text-[var(--t1)] outline-none transition placeholder:text-[var(--t3)] focus:border-[var(--line-4)]"
                  />
                </div>

                <div className="flex flex-col gap-3 border-t border-[var(--line)] bg-[var(--bg)] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="relative flex w-full flex-wrap items-center gap-3 sm:w-auto">
                    <button
                      ref={triggerRef}
                      type="button"
                      onClick={() => setIsMenuOpen((current) => !current)}
                      className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-[var(--line-3)] text-[var(--t2)] transition hover:bg-[var(--bg-4)] hover:text-[var(--t1)]"
                      aria-label="Add intake source"
                      aria-expanded={isMenuOpen}
                      aria-haspopup="menu"
                    >
                      <Plus className="h-[15px] w-[15px]" strokeWidth={2} />
                    </button>

                    {isMenuOpen ? (
                      <div
                        ref={menuRef}
                        role="menu"
                        className="absolute bottom-[calc(100%+10px)] left-0 z-10 rounded-[16px] border border-[var(--line-2)] bg-[var(--bg-4)] p-2 shadow-[0_20px_60px_rgba(0,0,0,0.42)] sm:min-w-[228px]"
                        style={{ width: "min(228px, calc(100vw - 56px))" }}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            if (isRecording) {
                              stopRecording();
                            }
                            setActiveMode("photo");
                            setSelectedFile(null);
                            setIsMenuOpen(false);
                            window.setTimeout(() => photoInputRef.current?.click(), 0);
                          }}
                          className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2 text-left text-[13px] text-[var(--t1)] transition hover:bg-[var(--bg-5)]"
                        >
                          <Paperclip className="h-[14px] w-[14px]" strokeWidth={2} />
                          Add files or photos
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            if (isRecording) {
                              stopRecording();
                            }
                            setActiveMode("voice");
                            setSelectedFile(null);
                            setIsMenuOpen(false);
                            setCaptureError(null);
                            setCaptureMessage(null);
                          }}
                          className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2 text-left text-[13px] text-[var(--t1)] transition hover:bg-[var(--bg-5)]"
                        >
                          <Mic className="h-[14px] w-[14px]" strokeWidth={2} />
                          Voice memo
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            if (isRecording) {
                              stopRecording();
                            }
                            setActiveMode("pdf");
                            setSelectedFile(null);
                            setIsMenuOpen(false);
                            window.setTimeout(() => pdfInputRef.current?.click(), 0);
                          }}
                          className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2 text-left text-[13px] text-[var(--t1)] transition hover:bg-[var(--bg-5)]"
                        >
                          <FileText className="h-[14px] w-[14px]" strokeWidth={2} />
                          Add PDF
                        </button>
                      </div>
                    ) : null}

                    <div className="text-[11px] leading-relaxed text-[var(--t2)] sm:max-w-[240px]">Only one intake mode stays active at a time.</div>
                  </div>

                  <Button variant="accent" onClick={handleCreateDraft} disabled={isRecording} className="h-[38px] w-full justify-center sm:w-auto sm:min-w-[168px]">
                    Generate quote
                  </Button>
                </div>
              </section>

              {captureError ? (
                <div className="rounded-[12px] border border-[var(--red-b)] bg-[var(--red-b)] px-4 py-3 text-[12px] leading-relaxed text-[var(--red)]">
                  {captureError}
                </div>
              ) : null}

              {captureMessage ? (
                <div className="rounded-[12px] border border-[var(--line-2)] bg-[var(--bg-3)] px-4 py-3 text-[12px] leading-relaxed text-[var(--t2)]">
                  {captureMessage}
                </div>
              ) : null}
            </div>
          </div>

          <input ref={photoInputRef} type="file" accept="image/*" className="sr-only" onChange={handleUploadChange("photo")} />
          <input ref={pdfInputRef} type="file" accept=".pdf,application/pdf" className="sr-only" onChange={handleUploadChange("pdf")} />
        </section>
      </div>
    </div>
  );
}


