import clsx from "clsx";

import type { QuoteFollowupState } from "../types";

type FollowupStatusCardProps = {
  followup: QuoteFollowupState | null | undefined;
  isLoading?: boolean;
  title?: string;
  onStop?: (() => void) | null;
  isStopping?: boolean;
};

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "Not recorded yet";
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

function toneClass(status: QuoteFollowupState["status"] | "loading"): string {
  if (status === "scheduled") {
    return "border-green/40 bg-green/10";
  }
  if (status === "stopped") {
    return "border-red-400/40 bg-red-400/10";
  }
  if (status === "pending_destination") {
    return "border-yellow/50 bg-yellow/10";
  }
  if (status === "loading") {
    return "border-border bg-bg";
  }
  return "border-border bg-bg";
}

function summaryText(followup: QuoteFollowupState | null | undefined): string {
  if (!followup || followup.status === "none") {
    return "No reminder is scheduled for this quote yet.";
  }
  if (followup.status === "pending_destination") {
    return "Send the quote to the customer first so GC Agent knows where to follow up.";
  }
  if (followup.status === "stopped") {
    return "Automatic follow-up is paused for this quote.";
  }
  return "GC Agent will keep the reminder on the calendar until it is stopped or completed.";
}

function statusLabel(followup: QuoteFollowupState | null | undefined): string {
  if (!followup) {
    return "Follow-up";
  }
  if (followup.status === "scheduled") {
    return "Scheduled";
  }
  if (followup.status === "stopped") {
    return "Stopped";
  }
  if (followup.status === "pending_destination") {
    return "Pending destination";
  }
  return "No follow-up";
}

function stopReasonText(reason: string | null): string {
  const normalized = (reason ?? "").trim().toLowerCase();
  if (!normalized) {
    return "Stopped by the current quote status.";
  }
  if (normalized === "max_reminders_reached") {
    return "Two reminders have already been sent.";
  }
  if (normalized === "manual_stop") {
    return "You paused automatic follow-up for this quote.";
  }
  if (normalized === "quote_discarded") {
    return "This quote was discarded.";
  }
  if (normalized === "quote_expired") {
    return "This quote is marked expired.";
  }
  if (normalized === "quote_closed" || normalized === "quote_converted" || normalized === "quote_accepted") {
    return "This quote is already closed out.";
  }
  return normalized.replace(/_/g, " ");
}

function channelLabel(channel: string | null): string {
  const normalized = (channel ?? "").trim().toLowerCase();
  if (!normalized) {
    return "Not chosen yet";
  }
  if (normalized === "sms") {
    return "SMS";
  }
  if (normalized === "whatsapp") {
    return "WhatsApp";
  }
  if (normalized === "email") {
    return "Email";
  }
  return normalized;
}

export function FollowupStatusCard({
  followup,
  isLoading = false,
  title = "Follow-up",
  onStop = null,
  isStopping = false,
}: FollowupStatusCardProps) {
  if (isLoading) {
    return (
      <div className={clsx("rounded-2xl border p-4", toneClass("loading"))}>
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">{title}</p>
          <span className="rounded-full border border-border bg-surface px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            Loading
          </span>
        </div>
        <p className="mt-3 text-sm text-muted">Checking the latest reminder state...</p>
      </div>
    );
  }

  const effective = followup ?? {
    open_item_id: null,
    quote_id: null,
    job_id: null,
    status: "none" as const,
    next_due_at: null,
    reminder_count: 0,
    last_reminder_at: null,
    stopped_at: null,
    stop_reason: null,
    channel: null,
  };
  const canStop =
    typeof onStop === "function" &&
    (effective.status === "scheduled" || effective.status === "pending_destination");

  return (
    <div className={clsx("rounded-2xl border p-4", toneClass(effective.status))}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">{title}</p>
        <div className="flex items-center gap-2">
          {canStop ? (
            <button
              type="button"
              onClick={onStop ?? undefined}
              disabled={isStopping}
              className="inline-flex min-h-9 items-center justify-center rounded-xl border border-border bg-surface px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition hover:border-orange hover:text-orange disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isStopping ? "Stopping..." : "Stop follow-up"}
            </button>
          ) : null}
          <span className="rounded-full border border-border bg-surface px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-text/90">
            {statusLabel(effective)}
          </span>
        </div>
      </div>

      <p className="mt-3 text-sm text-text">{summaryText(effective)}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Next reminder</p>
          <p className="mt-1 text-sm text-text">
            {effective.status === "scheduled" || effective.status === "pending_destination"
              ? formatTimestamp(effective.next_due_at)
              : "Not scheduled"}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Reminders sent</p>
          <p className="mt-1 text-sm text-text">{effective.reminder_count}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Last reminder</p>
          <p className="mt-1 text-sm text-text">{formatTimestamp(effective.last_reminder_at)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Channel</p>
          <p className="mt-1 text-sm text-text">{channelLabel(effective.channel)}</p>
        </div>
      </div>

      {effective.status === "stopped" ? (
        <div className="mt-4 rounded-xl border border-border bg-surface px-3 py-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Why it stopped</p>
          <p className="mt-1 text-sm text-text">{stopReasonText(effective.stop_reason)}</p>
          {effective.stopped_at ? (
            <p className="mt-1 text-xs text-muted">Stopped {formatTimestamp(effective.stopped_at)}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
