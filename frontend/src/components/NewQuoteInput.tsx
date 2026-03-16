import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { FileText, Mic, Paperclip, Plus, Square, X } from "lucide-react";

export type NewQuoteInputMode = "voice" | "photo" | "pdf" | null;

type NewQuoteInputProps = {
  notes: string;
  onNotesChange: (value: string) => void;
  activeMode: NewQuoteInputMode;
  onActivateMode: (mode: Exclude<NewQuoteInputMode, null>) => void;
  onDismissMode: () => void;
  selectedUploadFile: File | null;
  onUploadSelected: (file: File | null, mode: "photo" | "pdf") => void;
  onClearUpload: () => void;
  onBeginRecording: () => void;
  onStopRecording: () => void;
  isRecording: boolean;
  voiceSupported: boolean;
  helperText: string;
  readinessLabel: string;
  onGenerate: () => void;
  generateLabel: string;
  generateDisabled: boolean;
  isBusy: boolean;
};

function useIsDarkPopoverTheme(): boolean {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const media =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;
    const apply = () => {
      const html = document.documentElement;
      setIsDark(
        html.classList.contains("dark") ||
          html.dataset.theme === "dark" ||
          Boolean(media?.matches)
      );
    };

    apply();
    if (!media) {
      return;
    }
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  return isDark;
}

export function NewQuoteInput({
  notes,
  onNotesChange,
  activeMode,
  onActivateMode,
  onDismissMode,
  selectedUploadFile,
  onUploadSelected,
  onClearUpload,
  onBeginRecording,
  onStopRecording,
  isRecording,
  voiceSupported,
  helperText,
  readinessLabel,
  onGenerate,
  generateLabel,
  generateDisabled,
  isBusy,
}: NewQuoteInputProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const isDarkPopoverTheme = useIsDarkPopoverTheme();

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        (menuRef.current?.contains(target) || triggerRef.current?.contains(target))
      ) {
        return;
      }
      setIsMenuOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isMenuOpen]);

  const popoverStyle = useMemo(
    () =>
      isDarkPopoverTheme
        ? {
            backgroundColor: "#0f172a",
            borderColor: "rgba(148, 163, 184, 0.25)",
            boxShadow: "0 18px 48px rgba(2, 6, 23, 0.45)",
            color: "#e2e8f0",
          }
        : {
            backgroundColor: "#0f172a",
            borderColor: "rgba(148, 163, 184, 0.18)",
            boxShadow: "0 18px 48px rgba(15, 23, 42, 0.18)",
            color: "#f8fafc",
          },
    [isDarkPopoverTheme]
  );

  const handleUploadChange =
    (mode: "photo" | "pdf") => (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      onUploadSelected(file, mode);
    };

  const resetHiddenInputs = () => {
    if (photoInputRef.current) {
      photoInputRef.current.value = "";
    }
    if (pdfInputRef.current) {
      pdfInputRef.current.value = "";
    }
  };

  const openPhotoChooser = () => {
    setIsMenuOpen(false);
    onActivateMode("photo");
    window.setTimeout(() => {
      photoInputRef.current?.click();
    }, 0);
  };

  const openVoiceMode = () => {
    setIsMenuOpen(false);
    onActivateMode("voice");
  };

  const openPdfChooser = () => {
    setIsMenuOpen(false);
    onActivateMode("pdf");
    window.setTimeout(() => {
      pdfInputRef.current?.click();
    }, 0);
  };

  const dismissAttachment = () => {
    resetHiddenInputs();
    onDismissMode();
    setIsMenuOpen(false);
  };

  const slotTitle =
    activeMode === "voice"
      ? "Voice memo"
      : activeMode === "pdf"
        ? "PDF attachment"
        : "Files or photos";

  return (
    <div className="rounded-3xl border border-slate-200 bg-white">
      {activeMode ? (
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-[15px] font-semibold text-slate-950">{slotTitle}</div>
                <div className="mt-1 text-sm text-slate-500">
                  {activeMode === "voice"
                    ? "Capture a voice note, then keep editing the draft below before you generate the quote."
                    : activeMode === "pdf"
                      ? "Attach a PDF scope sheet and keep typing any missing scope details below."
                      : "Attach a photo or image file and keep typing any field notes below."}
                </div>
              </div>
              <button
                type="button"
                onClick={dismissAttachment}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
                aria-label={`Dismiss ${slotTitle.toLowerCase()}`}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {activeMode === "voice" ? (
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center">
                <button
                  type="button"
                  onPointerDown={onBeginRecording}
                  onPointerUp={onStopRecording}
                  onPointerLeave={onStopRecording}
                  onPointerCancel={onStopRecording}
                  disabled={!voiceSupported || isBusy}
                  className="mb-5 inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#2453d4] text-white transition hover:bg-[#1f46b3] disabled:cursor-not-allowed disabled:bg-slate-300"
                  style={{ touchAction: "none" }}
                >
                  {isRecording ? (
                    <Square className="h-6 w-6" aria-hidden="true" />
                  ) : (
                    <Mic className="h-6 w-6" aria-hidden="true" />
                  )}
                </button>
                <div className="text-[15px] font-semibold text-slate-950">
                  {isRecording ? "Recording now" : "Hold to record"}
                </div>
                <div className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
                  {helperText}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-5">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="btn bw"
                    onClick={() =>
                      activeMode === "pdf"
                        ? pdfInputRef.current?.click()
                        : photoInputRef.current?.click()
                    }
                  >
                    {selectedUploadFile
                      ? "Replace file"
                      : activeMode === "pdf"
                        ? "Choose PDF"
                        : "Choose file"}
                  </button>
                  {selectedUploadFile ? (
                    <button
                      type="button"
                      className="btn bw"
                      onClick={() => {
                        resetHiddenInputs();
                        onClearUpload();
                      }}
                    >
                      Remove file
                    </button>
                  ) : null}
                </div>
                <div className="mt-4 text-sm text-slate-500">
                  {selectedUploadFile
                    ? `Attached: ${selectedUploadFile.name}`
                    : activeMode === "pdf"
                      ? "No PDF attached yet."
                      : "No file or photo attached yet."}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <div className="px-6 py-6">
        <label className="lbl" htmlFor="quote-notes">
          Transcript / field notes
        </label>
        <textarea
          id="quote-notes"
          className="txta mt-3"
          rows={activeMode ? 6 : 8}
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          placeholder="Scope, measurements, materials, site conditions, customer requests..."
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
        <div className="relative flex items-center gap-3">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setIsMenuOpen((current) => !current)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-950"
            aria-label="Add input"
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>

          <span className="tag ts">{readinessLabel}</span>

          {isMenuOpen ? (
            <div
              ref={menuRef}
              role="menu"
              className="absolute bottom-[calc(100%+12px)] left-0 z-20 min-w-[240px] overflow-hidden rounded-2xl border p-2"
              style={popoverStyle}
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-white/10"
                onClick={openPhotoChooser}
              >
                <Paperclip className="h-4 w-4" aria-hidden="true" />
                <span>Add files or photos</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-white/10"
                onClick={openVoiceMode}
              >
                <Mic className="h-4 w-4" aria-hidden="true" />
                <span>Voice memo</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-white/10"
                onClick={openPdfChooser}
              >
                <FileText className="h-4 w-4" aria-hidden="true" />
                <span>Add PDF</span>
              </button>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="cta min-w-[220px]"
          onClick={onGenerate}
          disabled={generateDisabled}
        >
          {generateLabel}
        </button>
      </div>

      <input
        ref={photoInputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="sr-only"
        onChange={handleUploadChange("photo")}
      />
      <input
        ref={pdfInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="sr-only"
        onChange={handleUploadChange("pdf")}
      />
    </div>
  );
}
