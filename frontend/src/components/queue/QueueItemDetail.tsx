import { X } from "lucide-react";
import { Link } from "react-router-dom";

import type { QueueItem } from "../../types";
import { formatTimestamp } from "../../lib/formatters";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { InputSourceIcon } from "../ui/InputSourceIcon";
import { SectionLabel } from "../ui/SectionLabel";
import { ActionChip } from "./ActionChip";

export interface QueueItemDetailProps {
  item: QueueItem;
  onClose: () => void;
  onApproveAll: () => void;
  onDismiss: () => void;
  onToggleAction: (actionId: string) => void;
}

function statusTone(status: QueueItem["status"]): "green" | "amber" | "red" | "purple" | "accent" | "muted" {
  if (status === "approved") return "green";
  if (status === "dismissed") return "red";
  if (status === "snoozed") return "purple";
  if (status === "manual_review") return "accent";
  return "muted";
}

function statusLabel(status: QueueItem["status"]): string {
  if (status === "manual_review") return "Manual review";
  return status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ");
}

export function QueueItemDetail({ item, onClose, onApproveAll, onDismiss, onToggleAction }: QueueItemDetailProps) {
  const canApprove = item.status === "pending" || item.status === "manual_review";
  const canDismiss = item.status === "pending" || item.status === "manual_review" || item.status === "snoozed";
  const generatedFollowUpCount = item.generatedFollowUpIds?.length ?? 0;
  const isTranscriptItem = item.backendKind === "transcript";
  const hasBackendArtifactErrors = (item.backendArtifactErrors?.length ?? 0) > 0;
  const lowConfidence = typeof item.confidenceScore === "number" && item.confidenceScore < 0.72;
  const hasEstimatedValue = item.extractedActions.some((action) => typeof action.estimatedValue === "number");
  const showAmountUncertain = lowConfidence && hasEstimatedValue;
  const approvedAt = item.approvedAt ? new Date(item.approvedAt).getTime() : null;
  const justApproved = approvedAt ? Date.now() - approvedAt < 90_000 : false;

  return (
    <div className="flex h-full w-full shrink-0 flex-col border-l border-[var(--line-2)] bg-[var(--bg-2)] sm:w-[380px] lg:w-[340px]">
      <div className="border-b border-[var(--line)] px-4 py-4">
        <div className="flex items-start gap-3">
          <InputSourceIcon source={item.source} />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-[var(--t1)]">{item.title}</div>
            <div className="mt-1 font-mono text-[10px] text-[var(--t3)]">{item.source} · {formatTimestamp(item.createdAt)}</div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {item.urgent ? <Badge label="Urgent" color="amber" /> : null}
              {item.status === "manual_review" && typeof item.confidenceScore === "number" ? (
                <Badge label={`${Math.round(item.confidenceScore * 100)}% confidence`} color="accent" />
              ) : null}
              <Badge label={statusLabel(item.status)} color={statusTone(item.status)} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-[24px] w-[24px] items-center justify-center rounded-md text-[var(--t3)] transition hover:bg-[var(--bg-4)] hover:text-[var(--t1)]"
          >
            <X className="h-[14px] w-[14px]" strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="scrollbar-none flex-1 overflow-y-auto px-4 py-4">
        {item.status === "manual_review" && item.manualReviewReason ? (
          <section className="rounded-lg border border-[var(--acl)] bg-[var(--acl-2)] p-3">
            <SectionLabel>Manual review</SectionLabel>
            <div className="mt-2 text-[12px] leading-relaxed text-[var(--t1)]">{item.manualReviewReason}</div>
            <div className="mt-2 text-[11px] text-[var(--t2)]">
              Arbor is keeping this in front of the office until a human confirms the next step.
            </div>
          </section>
        ) : null}

        {showAmountUncertain ? (
          <section className="mt-3 rounded-lg border border-[var(--amber-b)] bg-[var(--amber-b)] p-3">
            <SectionLabel>Confidence check</SectionLabel>
            <div className="mt-2 text-[12px] leading-relaxed text-[var(--t1)]">
              Extracted amount uncertain â please verify against the audio before sending.
            </div>
            {typeof item.confidenceScore === "number" ? (
              <div className="mt-2 text-[11px] text-[var(--amber)]">
                Confidence {Math.round(item.confidenceScore * 100)}%
              </div>
            ) : null}
          </section>
        ) : lowConfidence ? (
          <section className="mt-3 rounded-lg border border-[var(--line-2)] bg-[var(--bg-3)] p-3">
            <SectionLabel>Confidence check</SectionLabel>
            <div className="mt-2 text-[12px] leading-relaxed text-[var(--t2)]">
              Low-confidence capture â verify the details before approving.
            </div>
            {typeof item.confidenceScore === "number" ? (
              <div className="mt-2 text-[11px] text-[var(--t3)]">
                Confidence {Math.round(item.confidenceScore * 100)}%
              </div>
            ) : null}
          </section>
        ) : null}

        {item.rawTranscriptSnippet ? (
          <section className="border-b border-[var(--line)] pb-4 pt-4 first:pt-0">
            <SectionLabel>Transcript excerpt</SectionLabel>
            <div className="mt-2 rounded-lg border border-[var(--line-2)] bg-[var(--bg-3)] p-3 font-mono text-[11px] leading-relaxed text-[var(--t2)]">
              {item.rawTranscriptSnippet}
            </div>
          </section>
        ) : null}

        <section className="pt-4">
          <SectionLabel>Agent extracted</SectionLabel>
          <div className="mt-2">
            {item.extractedActions.map((action) => (
              <ActionChip key={action.id} action={action} onToggle={() => onToggleAction(action.id)} />
            ))}
          </div>
        </section>

        {isTranscriptItem && item.transcriptId ? (
          <section className="border-t border-[var(--line)] pt-4">
            <SectionLabel>Transcript tools</SectionLabel>
            <div className="mt-3 space-y-2">
              <Link
                to={`/quotes?compose=1&transcriptId=${encodeURIComponent(item.transcriptId)}${item.jobId ? `&jobId=${encodeURIComponent(item.jobId)}` : ""}`}
                onClick={onClose}
                className="flex items-center justify-between rounded-lg border border-[var(--line-2)] bg-[var(--bg-3)] px-3 py-2 text-[12px] text-[var(--t1)] transition hover:border-[var(--line-4)] hover:bg-[var(--bg-4)]"
              >
                <span>Prepare draft quote from transcript</span>
                <span className="font-mono text-[10px] text-[var(--blue)]">Prefill ready</span>
              </Link>
            </div>
          </section>
        ) : null}

        {isTranscriptItem && (item.linkedQuoteId || (item.relatedQueueItemIds?.length ?? 0) > 0) ? (
          <section className="border-t border-[var(--line)] pt-4">
            <SectionLabel>Linked context</SectionLabel>
            <div className="mt-3 space-y-2">
              {item.linkedQuoteId ? (
                <Link
                  to={`/quotes/${item.linkedQuoteId}`}
                  onClick={onClose}
                  className="flex items-center justify-between rounded-lg border border-[var(--line-2)] bg-[var(--bg-3)] px-3 py-2 text-[12px] text-[var(--t1)] transition hover:border-[var(--line-4)] hover:bg-[var(--bg-4)]"
                >
                  <span>Open linked quote</span>
                  <span className="font-mono text-[10px] text-[var(--accent-2)]">Quote {item.linkedQuoteId}</span>
                </Link>
              ) : null}
              {item.relatedQueueItemIds?.[0] ? (
                <Link
                  to={`/queue/${item.relatedQueueItemIds[0]}`}
                  onClick={onClose}
                  className="flex items-center justify-between rounded-lg border border-[var(--line-2)] bg-[var(--bg-3)] px-3 py-2 text-[12px] text-[var(--t1)] transition hover:border-[var(--line-4)] hover:bg-[var(--bg-4)]"
                >
                  <span>Open routed queue draft</span>
                  <span className="font-mono text-[10px] text-[var(--amber)]">
                    {item.relatedQueueItemIds.length} queued step{item.relatedQueueItemIds.length === 1 ? "" : "s"}
                  </span>
                </Link>
              ) : null}
            </div>
          </section>
        ) : null}

        {item.generatedQuoteId || generatedFollowUpCount > 0 ? (
          <section className="border-t border-[var(--line)] pt-4">
            <div className="flex items-center justify-between">
              <SectionLabel>Generated from review</SectionLabel>
              {justApproved ? (
                <span className="rounded-full border border-[var(--green)] bg-[var(--green-b)] px-2 py-[2px] text-[10px] font-medium text-[var(--green)]">
                  Draft created
                </span>
              ) : null}
            </div>
            <div className="mt-3 space-y-2">
              {item.generatedQuoteId ? (
                <Link
                  to={`/quotes/${item.generatedQuoteId}`}
                  onClick={onClose}
                  className={`flex items-center justify-between rounded-lg border border-[var(--line-2)] bg-[var(--bg-3)] px-3 py-2 text-[12px] text-[var(--t1)] transition hover:border-[var(--line-4)] hover:bg-[var(--bg-4)] ${
                    justApproved ? "shadow-[0_0_0_1px_rgba(90,148,105,0.4)]" : ""
                  }`}
                >
                  <span>Open draft quote</span>
                  <span className="font-mono text-[10px] text-[var(--accent-2)]">Quote ready</span>
                </Link>
              ) : null}
              {generatedFollowUpCount > 0 ? (
                <Link
                  to={item.jobId ? `/jobs/${item.jobId}?tab=followups` : "/jobs"}
                  onClick={onClose}
                  className="flex items-center justify-between rounded-lg border border-[var(--line-2)] bg-[var(--bg-3)] px-3 py-2 text-[12px] text-[var(--t1)] transition hover:border-[var(--line-4)] hover:bg-[var(--bg-4)]"
                >
                  <span>Open job follow-through</span>
                  <span className="font-mono text-[10px] text-[var(--amber)]">{generatedFollowUpCount} follow-up{generatedFollowUpCount === 1 ? "" : "s"}</span>
                </Link>
              ) : null}
              {item.confirmationStatus ? (
                <div className="rounded-lg border border-[var(--line-2)] bg-[var(--bg-3)] px-3 py-2 text-[11px] text-[var(--t2)]">
                  {item.confirmationStatus === "sent"
                    ? `Confirmation sent to ${item.confirmationTo ?? "field contact"}${item.confirmationChannel ? ` via ${item.confirmationChannel}` : ""}.`
                    : item.confirmationStatus === "failed"
                      ? `Confirmation failed${item.confirmationError ? `: ${item.confirmationError}` : "."}`
                      : "Confirmation skipped."}
                </div>
              ) : null}
              {item.approvedAt ? <div className="font-mono text-[10px] text-[var(--t3)]">Approved {formatTimestamp(item.approvedAt)}</div> : null}
            </div>
          </section>
        ) : null}

        {hasBackendArtifactErrors ? (
          <section className="border-t border-[var(--line)] pt-4">
            <SectionLabel>Backend needs attention</SectionLabel>
            <div className="mt-3 rounded-lg border border-[var(--amber-b)] bg-[var(--amber-b)] p-3">
              <div className="text-[12px] leading-relaxed text-[var(--t1)]">
                The review completed, but one or more backend artifact steps came back incomplete.
              </div>
              <div className="mt-3 space-y-2">
                {item.backendArtifactErrors?.map((error) => (
                  <div key={error} className="rounded-md border border-[var(--line-2)] bg-[var(--bg-3)] px-3 py-2 text-[11px] leading-relaxed text-[var(--amber)]">
                    {error}
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </div>

      <div className="border-t border-[var(--line)] p-4">
        {canApprove || canDismiss ? (
          <div className="flex flex-col gap-2">
            {canApprove ? (
              <Button variant="accent" className="w-full justify-center" onClick={onApproveAll}>
                {isTranscriptItem
                  ? "Mark reviewed"
                  : item.status === "manual_review"
                    ? "Approve review & create next step"
                    : "Approve & create next step"}
              </Button>
            ) : null}
            {canDismiss ? (
              <Button variant="ghost" className="w-full justify-center" onClick={onDismiss}>
                {isTranscriptItem ? "Discard transcript" : "Dismiss"}
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="text-[11px] text-[var(--t3)]">This item has already been reviewed. Open the generated artifacts above to keep moving.</div>
        )}
      </div>
    </div>
  );
}

