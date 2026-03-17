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
            background:
              "linear-gradient(180deg, rgba(12,18,34,0.98), rgba(15,24,43,0.96))",
            borderColor: "rgba(255,255,255,0.08)",
            boxShadow: "0 24px 54px rgba(3, 7, 18, 0.42)",
            color: "#f5f8ff",
          }
        : {
            background:
              "linear-gradient(180deg, rgba(12,18,34,0.98), rgba(15,24,43,0.96))",
            borderColor: "rgba(255,255,255,0.08)",
            boxShadow: "0 24px 54px rgba(6, 12, 26, 0.26)",
            color: "#f5f8ff",
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
    <div className="overflow-hidden rounded-[22px] border border-[var(--gc-line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(247,249,255,0.86))] shadow-[var(--gc-shadow)] backdrop-blur-[18px]">
      {activeMode ? (
        <div className="border-b border-[var(--gc-line)] bg-[rgba(49,95,255,0.03)] px-5 py-4">
          <div className="rounded-[16px] border border-[var(--gc-line)] bg-white/72 px-4 py-4 shadow-[0_10px_22px_rgba(15,22,38,0.04)]">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <div className="text-[13px] font-semibold text-[var(--gc-ink)]">{slotTitle}</div>
                <div className="mt-1 text-[12px] leading-6 text-[var(--gc-ink-soft)]">
                  {activeMode === "voice"
                    ? "Capture a voice note, then keep shaping the draft below before you generate the quote."
                    : activeMode === "pdf"
                      ? "Attach a scope PDF, then keep writing missing field context below."
                      : "Attach a photo or file, then keep writing the job request below."}
                </div>
              </div>
              <button
                type="button"
                onClick={dismissAttachment}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--gc-line)] bg-white/80 text-[var(--gc-ink-soft)] transition hover:border-[var(--gc-line-strong)] hover:text-[var(--gc-ink)]"
                aria-label={`Dismiss ${slotTitle.toLowerCase()}`}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            {activeMode === "voice" ? (
              <div className="flex flex-col items-center rounded-[16px] border border-dashed border-[var(--gc-line-strong)] bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(241,245,255,0.72))] px-4 py-6 text-center">
                <button
                  type="button"
                  onPointerDown={onBeginRecording}
                  onPointerUp={onStopRecording}
                  onPointerLeave={onStopRecording}
                  onPointerCancel={onStopRecording}
                  disabled={!voiceSupported || isBusy}
                  className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full border border-[#5f81ff]/24 bg-[linear-gradient(135deg,#5f81ff,#2f5dff)] text-white shadow-[0_18px_34px_rgba(49,95,255,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ touchAction: "none" }}
                >
                  {isRecording ? (
                    <Square className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <Mic className="h-5 w-5" aria-hidden="true" />
                  )}
                </button>
                <div className="text-[14px] font-semibold text-[var(--gc-ink)]">
                  {isRecording ? "Recording now" : "Hold to record"}
                </div>
                <div className="mt-2 max-w-xl text-[12px] leading-6 text-[var(--gc-ink-soft)]">{helperText}</div>
              </div>
            ) : (
              <div className="rounded-[16px] border border-dashed border-[var(--gc-line-strong)] bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(241,245,255,0.72))] px-4 py-4">
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
                <div className="mt-4 text-sm text-[var(--gc-ink-soft)]">
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

      <div className="px-5 py-5">
        <div className="mb-3 flex items-center justify-between gap-4">
          <label className="lbl" htmlFor="quote-notes">
            Transcript / field notes
          </label>
          <span className="text-[11px] text-[var(--gc-ink-muted)]">Describe the work like you would text the office</span>
        </div>
        <textarea
          id="quote-notes"
          className="txta !mt-0 min-h-[196px] rounded-[18px] !bg-white"
          rows={activeMode ? 6 : 8}
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          placeholder="Scope, measurements, materials, site conditions, customer requests..."
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--gc-line)] bg-[rgba(246,248,255,0.72)] px-5 py-3.5">
        <div className="relative flex items-center gap-3">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setIsMenuOpen((current) => !current)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--gc-line-strong)] bg-white/78 text-[var(--gc-ink-soft)] transition hover:border-[rgba(49,95,255,0.22)] hover:bg-white hover:text-[var(--gc-ink)]"
            aria-label="Add input"
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>

          <span className="gc-chip soft">{readinessLabel}</span>

          {isMenuOpen ? (
            <div
              ref={menuRef}
              role="menu"
              className="absolute bottom-[calc(100%+10px)] left-0 z-20 min-w-[240px] overflow-hidden rounded-[18px] border p-2"
              style={popoverStyle}
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-3 rounded-[14px] px-3 py-2 text-left text-sm transition hover:bg-white/10"
                onClick={openPhotoChooser}
              >
                <Paperclip className="h-4 w-4" aria-hidden="true" />
                <span>Add files or photos</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-3 rounded-[14px] px-3 py-2 text-left text-sm transition hover:bg-white/10"
                onClick={openVoiceMode}
              >
                <Mic className="h-4 w-4" aria-hidden="true" />
                <span>Voice memo</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-3 rounded-[14px] px-3 py-2 text-left text-sm transition hover:bg-white/10"
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
          className="cta min-w-[196px]"
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
