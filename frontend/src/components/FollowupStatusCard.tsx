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
    return "border border-emerald-200 bg-emerald-50";
  }
  if (status === "stopped") {
    return "border border-orange-200 bg-orange-50";
  }
  if (status === "pending_destination") {
    return "border border-slate-200 bg-slate-50";
  }
  if (status === "loading") {
    return "border border-slate-200 bg-slate-50";
  }
  return "border border-slate-200 bg-slate-50";
}

function summaryText(followup: QuoteFollowupState | null | undefined): string {
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

function statusLabel(followup: QuoteFollowupState | null | undefined): string {
  if (!followup) {
    return "Reminders";
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
  return "No reminders";
}

function stopReasonText(reason: string | null): string {
  const normalized = (reason ?? "").trim().toLowerCase();
  if (!normalized) {
    return "Stopped by the current quote status.";
  }
  if (normalized === "max_reminders_reached") {
    return "Two follow-through reminders have already been sent.";
  }
  if (normalized === "manual_stop") {
    return "You paused automatic follow-through for this quote.";
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
  title = "Customer Follow-through",
  onStop = null,
  isStopping = false,
}: FollowupStatusCardProps) {
  if (isLoading) {
    return (
      <div className={clsx("surface-panel-subtle px-4 py-4", toneClass("loading"))}>
        <div className="flex items-center justify-between gap-3">
          <p className="kicker">{title}</p>
          <span className="terminal-mini-chip border-slate-200 bg-white text-slate-500">
            Loading
          </span>
        </div>
        <p className="mt-3 text-sm text-slate-500">Checking the latest reminder schedule...</p>
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
    <div className={clsx("surface-panel-subtle px-4 py-4", toneClass(effective.status))}>
      <div className="flex items-center justify-between gap-3">
        <p className="kicker">{title}</p>
        <div className="flex items-center gap-2">
          {canStop ? (
            <button
              type="button"
              onClick={onStop ?? undefined}
              disabled={isStopping}
              className="action-button-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isStopping ? "Stopping..." : "Stop reminders"}
            </button>
          ) : null}
          <span className="terminal-mini-chip border-slate-200 bg-white text-slate-700">
            {statusLabel(effective)}
          </span>
        </div>
      </div>

      <p className="mt-3 max-w-2xl text-sm leading-6 text-text">{summaryText(effective)}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="data-label">Next reminder</p>
          <p className="mt-1 text-sm text-text">
            {effective.status === "scheduled" || effective.status === "pending_destination"
              ? formatTimestamp(effective.next_due_at)
              : "Not scheduled"}
          </p>
        </div>
        <div>
          <p className="data-label">Reminders sent</p>
          <p className="mt-1 text-sm text-text">{effective.reminder_count}</p>
        </div>
        <div>
          <p className="data-label">Last reminder</p>
          <p className="mt-1 text-sm text-text">{formatTimestamp(effective.last_reminder_at)}</p>
        </div>
        <div>
          <p className="data-label">Channel</p>
          <p className="mt-1 text-sm text-text">{channelLabel(effective.channel)}</p>
        </div>
      </div>

      {effective.status === "stopped" ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-3 py-3">
          <p className="data-label">Why it stopped</p>
          <p className="mt-1 text-sm text-text">{stopReasonText(effective.stop_reason)}</p>
          {effective.stopped_at ? (
            <p className="mt-1 text-xs text-slate-500">Stopped {formatTimestamp(effective.stopped_at)}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

