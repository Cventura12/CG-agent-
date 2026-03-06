import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { CheckCircle2, Loader2, Pencil, Trash2 } from "lucide-react";

import type { Draft, DraftType } from "../types";

type DraftCardProps = {
  draft: Draft;
  onApprove: (id: string) => void;
  onEdit: (id: string, content: string) => void;
  onDiscard: (id: string) => void;
  isLoading?: boolean;
  statusOverride?: Draft["status"];
  isExiting?: boolean;
  wasEdited?: boolean;
};

const CONTENT_PREVIEW_CHARS = 200;

type PendingAction = "approve" | "discard" | "save" | null;

function typeBadgeClass(type: DraftType): string {
  const mapping: Record<DraftType, string> = {
    CO: "border-yellow/60 bg-yellow/15 text-yellow",
    RFI: "border-green/60 bg-green/15 text-green",
    "sub-message": "border-orange/70 bg-orange/15 text-orange",
    "follow-up": "border-red-400/60 bg-red-400/10 text-red-300",
    "owner-update": "border-steel/60 bg-steel/15 text-steel",
    "material-order": "border-muted/60 bg-muted/15 text-muted",
  };
  return mapping[type];
}

function prettyType(type: DraftType): string {
  return type.replace("-", " ").toUpperCase();
}

function recipientLabel(type: DraftType): string {
  const mapping: Record<DraftType, string> = {
    CO: "Owner / billing",
    RFI: "Design team",
    "sub-message": "Subcontractor",
    "follow-up": "Customer / stakeholder",
    "owner-update": "Property owner",
    "material-order": "Supplier / vendor",
  };
  return mapping[type];
}

function sendByLabel(createdAt: string): string {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) {
    return "Send now";
  }

  const sendBy = new Date(created.getTime() + 2 * 60 * 60 * 1000);
  const timeText = sendBy.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  return `Send by ${timeText}`;
}

export function DraftCard({
  draft,
  onApprove,
  onEdit,
  onDiscard,
  isLoading = false,
  statusOverride,
  isExiting = false,
  wasEdited = false,
}: DraftCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(draft.content);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const effectiveStatus = statusOverride ?? draft.status;
  const isApproved = effectiveStatus === "approved" || effectiveStatus === "edited";
  const isDiscarded = effectiveStatus === "discarded";
  const isFinalState = isApproved || isDiscarded;

  const hasOverflow = draft.content.length > CONTENT_PREVIEW_CHARS;
  const previewText = useMemo(() => {
    if (isExpanded || !hasOverflow) {
      return draft.content;
    }
    return `${draft.content.slice(0, CONTENT_PREVIEW_CHARS)}...`;
  }, [draft.content, hasOverflow, isExpanded]);

  useEffect(() => {
    setEditValue(draft.content);
    setIsEditing(false);
  }, [draft.id, draft.content, draft.status]);

  useEffect(() => {
    if (!isLoading) {
      setPendingAction(null);
    }
  }, [isLoading]);

  const showApproveSpinner = isLoading && pendingAction === "approve";
  const showDiscardSpinner = isLoading && pendingAction === "discard";

  const handleApprove = () => {
    setPendingAction("approve");
    onApprove(draft.id);
  };

  const handleDiscard = () => {
    setPendingAction("discard");
    onDiscard(draft.id);
  };

  const handleSaveEdit = () => {
    const trimmed = editValue.trim();
    setPendingAction("save");
    onEdit(draft.id, trimmed.length > 0 ? trimmed : draft.content);
    setIsEditing(false);
  };

  return (
    <article
      className={clsx(
        "mx-auto w-full max-w-none rounded-[1.5rem] border border-border/80 bg-surface/88 p-4 shadow-[0_16px_36px_rgba(0,0,0,0.24)] transition-all duration-200",
        isApproved && "opacity-60",
        isDiscarded && "opacity-30",
        isExiting && "translate-y-2 scale-[0.98] opacity-0"
      )}
    >
      <header className="mb-3">
        <span
          className={clsx(
            "inline-flex items-center rounded-full border px-2 py-1 font-mono text-[11px] font-medium tracking-wider",
            typeBadgeClass(draft.type)
          )}
        >
          {prettyType(draft.type)}
        </span>
        <h3
          className={clsx(
            "mt-2 text-base font-semibold text-text transition-all duration-200",
            isDiscarded && "line-through"
          )}
        >
          {draft.title}
        </h3>
        <div className="mt-1 flex flex-col gap-1 text-xs text-muted sm:flex-row sm:items-center sm:gap-3">
          <span>{draft.job_name}</span>
          <span>Recipient: {recipientLabel(draft.type)}</span>
          <span>{sendByLabel(draft.created_at)}</span>
        </div>
      </header>

      <p className="mb-3 italic text-sm text-muted">{draft.why}</p>

      {isEditing ? (
        <div className="mb-4 space-y-3">
          <textarea
            aria-label="Edit draft content"
            value={editValue}
            onChange={(event) => setEditValue(event.target.value)}
            rows={8}
            className="field-textarea w-full font-mono"
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              aria-label="Save draft edits"
              onClick={handleSaveEdit}
              disabled={isLoading}
              className="rounded-xl bg-green px-3 py-2 text-sm font-medium text-bg transition-all duration-200 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save Changes
            </button>
            <button
              type="button"
              aria-label="Cancel draft edit"
              onClick={() => {
                setIsEditing(false);
                setEditValue(draft.content);
              }}
              disabled={isLoading}
              className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-text transition-all duration-200 hover:border-steel disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-4">
          {wasEdited ? (
            <div className="mb-3 rounded-xl border border-steel/40 bg-steel/10 px-3 py-2 text-xs text-steel">
              Edits saved. Review and approve when ready.
            </div>
          ) : null}
          <p className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-text/90">
            {previewText}
          </p>
          {hasOverflow ? (
            <button
              type="button"
              aria-label={isExpanded ? "Collapse draft content" : "Expand draft content"}
              onClick={() => setIsExpanded((current) => !current)}
              className="mt-2 font-mono text-xs uppercase tracking-wider text-orange transition-all duration-200 hover:text-text"
            >
              {isExpanded ? "Show less" : "Read more"}
            </button>
          ) : null}
        </div>
      )}

      {isApproved ? (
        <div className="inline-flex items-center gap-2 rounded-xl border border-green/50 bg-green/10 px-3 py-2 text-sm text-green">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          <span>Approved</span>
        </div>
      ) : null}

      {isDiscarded ? (
        <div className="inline-flex items-center gap-2 rounded-xl border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-300">
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          <span>Discarded</span>
        </div>
      ) : null}

      {!isFinalState ? (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            aria-label="Approve draft"
            onClick={handleApprove}
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-green px-3 py-2 text-sm font-medium text-bg transition-all duration-200 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {showApproveSpinner ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            <span>Approve</span>
          </button>

          <button
            type="button"
            aria-label="Edit draft"
            onClick={() => setIsEditing(true)}
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium text-text transition-all duration-200 hover:border-steel disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            <span>Edit</span>
          </button>

          <button
            type="button"
            aria-label="Discard draft"
            onClick={handleDiscard}
            disabled={isLoading}
            className="inline-flex items-center justify-center rounded-xl border border-transparent p-2 text-muted transition-all duration-200 hover:border-border hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
          >
            {showDiscardSpinner ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      ) : null}
    </article>
  );
}
