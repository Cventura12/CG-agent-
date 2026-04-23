import type { CSSProperties } from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronUp,
  Clock3,
  FileText,
  ListTodo,
} from "lucide-react";

import "./TodayView.css";

export interface DashboardUser {
  name: string;
  initials: string;
  role: string;
}

export interface QueueItem {
  id: string;
  description: string;
  source: "CALL" | "SMS" | "EMAIL" | "UPLOAD";
  timestamp: string;
  urgent: boolean;
}

export interface TodayViewProps {
  user: DashboardUser;
  date: string;
  queueItems: QueueItem[];
  activeQuotes: number;
  followUpsDue: number;
  setupStepsCompleted: number;
}

type NavItem = {
  label: string;
  icon: typeof CalendarDays;
  active?: boolean;
  badge?: string | null;
};

function formatTodayLabel(value: string): string {
  const normalized = value.trim();
  const parsed = normalized ? new Date(normalized) : new Date();
  if (Number.isNaN(parsed.getTime())) {
    return normalized || new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(new Date());
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(parsed);
}

function formatRelativeTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const deltaMs = Date.now() - parsed.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (deltaMs < minute) {
    return "Just now";
  }
  if (deltaMs < hour) {
    const minutes = Math.max(1, Math.floor(deltaMs / minute));
    return `${minutes}m ago`;
  }
  if (deltaMs < day) {
    const hours = Math.max(1, Math.floor(deltaMs / hour));
    return `${hours}h ago`;
  }
  if (deltaMs < day * 2) {
    return "Yesterday";
  }
  const days = Math.max(1, Math.floor(deltaMs / day));
  return `${days}d ago`;
}

function statBorderColor(kind: "neutral" | "urgent" | "ok"): string {
  if (kind === "urgent") {
    return "var(--warn)";
  }
  if (kind === "ok") {
    return "var(--ok-border)";
  }
  return "var(--border)";
}

function sourceTagTone(source: QueueItem["source"]): string {
  if (source === "CALL") return "bg-[var(--warn-bg)] text-[var(--warn)]";
  if (source === "SMS") return "bg-[var(--accent-light)] text-[var(--accent-text)]";
  if (source === "EMAIL") return "bg-[var(--surface-2)] text-[var(--ink-2)]";
  return "bg-[var(--surface-2)] text-[var(--ink-3)]";
}

function stepDescription(index: number): { title: string; description: string } {
  if (index === 0) {
    return {
      title: "Connect a number",
      description: "Route calls or forward voicemails to Arbor Agent",
    };
  }
  if (index === 1) {
    return {
      title: "Review the queue",
      description: "AI extracts actions, changes, and commitments",
    };
  }
  return {
    title: "Send a quote",
    description: "Approve drafts and track customer response.",
  };
}

export function TodayView({
  user,
  date,
  queueItems,
  activeQuotes,
  followUpsDue,
  setupStepsCompleted,
}: TodayViewProps) {
  const hasUrgentQueue = queueItems.some((item) => item.urgent);
  const queueBadge = queueItems.length > 0 ? String(queueItems.length) : null;
  const formattedDate = formatTodayLabel(date);

  const navSections: { label?: string; items: NavItem[] }[] = [
    {
      items: [
        { label: "Today", icon: CalendarDays, active: true },
        { label: "Queue", icon: ListTodo, badge: queueBadge },
        { label: "Quotes", icon: FileText },
        { label: "Jobs", icon: BriefcaseBusiness },
      ],
    },
    {
      label: "Reporting",
      items: [{ label: "Analytics", icon: BarChart3 }],
    },
  ];

  const queueHint = queueItems.length === 0 ? "All clear" : hasUrgentQueue ? "Urgent items in queue" : "Needs review";
  const activeQuoteHint = activeQuotes === 0 ? "None sent yet" : "In motion";
  const followUpHint = followUpsDue === 0 ? "Nothing scheduled" : "Needs follow-through";

  const showSetupPanel = setupStepsCompleted < 3;
  const panelGridClass = showSetupPanel ? "grid-cols-[minmax(0,1fr)_280px]" : "grid-cols-1";

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--surface-2)] text-[var(--ink)]">
      <aside className="flex h-full w-[200px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] px-[18px] py-[16px]">
          <div className="flex items-center gap-[10px]">
            <div className="flex h-[22px] w-[22px] items-center justify-center rounded-[6px] bg-[var(--accent)]">
              <ChevronUp className="h-[12px] w-[12px] text-white" strokeWidth={2.3} />
            </div>
            <div className="text-[13px] font-medium tracking-[-0.1px] text-[var(--ink)]">
              Arbor Agent
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-between overflow-hidden">
          <div className="flex-1 px-[8px] py-[10px]">
            {navSections.map((section, sectionIndex) => (
              <div
                key={section.label ?? `main-${sectionIndex}`}
                className={sectionIndex > 0 ? "mt-[18px]" : ""}
              >
                {section.label ? (
                  <div className="px-[8px] pb-[6px] text-[10px] font-medium uppercase tracking-[0.8px] text-[var(--ink-3)]">
                    {section.label}
                  </div>
                ) : null}

                <div className="flex flex-col gap-px">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.label}
                        type="button"
                        className={`flex items-center justify-between rounded-[6px] px-[8px] py-[7px] text-left transition ${
                          item.active
                            ? "bg-[var(--accent-light)] text-[var(--accent-text)]"
                            : "text-[var(--ink-2)] hover:bg-[var(--surface-2)]"
                        }`}
                      >
                        <span className="flex items-center gap-[8px]">
                          <Icon
                            className={`h-[15px] w-[15px] ${item.active ? "opacity-100" : "opacity-55"}`}
                            strokeWidth={1.9}
                          />
                          <span className={`text-[13px] ${item.active ? "font-medium" : "font-normal"}`}>
                            {item.label}
                          </span>
                        </span>
                        {item.badge ? (
                          <span className="font-dm-mono rounded-[4px] bg-[var(--warn-bg)] px-[5px] py-[2px] text-[10px] text-[var(--warn)]">
                            {item.badge}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-[var(--border)] p-[10px]">
            <button
              type="button"
              className="flex w-full items-center gap-[10px] rounded-[6px] px-[8px] py-[8px] text-left transition hover:bg-[var(--surface-2)]"
            >
              <div className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-medium text-white">
                {user.initials}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[12px] font-medium text-[var(--ink)]">{user.name}</div>
                <div className="truncate text-[11px] text-[var(--ink-3)]">{user.role}</div>
              </div>
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-10 flex h-[52px] shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-[24px]">
          <div className="text-[14px] font-medium tracking-[-0.2px] text-[var(--ink)]">
            {formattedDate}
          </div>
          <div className="flex items-center gap-[8px]">
            <button
              type="button"
              className="rounded-[6px] border border-[var(--border-strong)] px-[12px] py-[5px] text-[12px] font-medium text-[var(--ink-2)] transition hover:bg-[var(--surface-2)]"
            >
              Import transcript
            </button>
            <button
              type="button"
              className="rounded-[6px] bg-[var(--accent)] px-[13px] py-[6px] text-[12px] font-medium text-white transition hover:opacity-90"
            >
              + New quote
            </button>
          </div>
        </header>

        <main className="today-scroll min-h-0 flex-1 overflow-y-auto px-[24px] py-[18px]">
          <div className="grid grid-cols-3 gap-[10px]">
            {[
              {
                key: "queue",
                label: "Queue",
                value: queueItems.length,
                hint: queueHint,
                borderTone: hasUrgentQueue ? "urgent" : "ok",
                hintClass:
                  queueItems.length === 0
                    ? "text-[var(--success)]"
                    : hasUrgentQueue
                      ? "text-[var(--warn)]"
                      : "text-[var(--ink-3)]",
                delay: "50ms",
              },
              {
                key: "quotes",
                label: "Active quotes",
                value: activeQuotes,
                hint: activeQuoteHint,
                borderTone: "neutral",
                hintClass: "text-[var(--ink-3)]",
                delay: "100ms",
              },
              {
                key: "followups",
                label: "Follow-ups due",
                value: followUpsDue,
                hint: followUpHint,
                borderTone: "neutral",
                hintClass: followUpsDue > 0 ? "text-[var(--warn)]" : "text-[var(--ink-3)]",
                delay: "150ms",
              },
            ].map((card) => (
              <section
                key={card.key}
                className="today-fade-up rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-[16px] py-[14px]"
                style={
                  {
                    borderTopWidth: "2px",
                    borderTopColor: statBorderColor(card.borderTone as "neutral" | "urgent" | "ok"),
                    ["--fade-delay" as string]: card.delay,
                  } as CSSProperties
                }
              >
                <div className="mb-[8px] text-[11px] font-medium uppercase tracking-[0.4px] text-[var(--ink-3)]">
                  {card.label}
                </div>
                <div className="font-dm-mono text-[26px] font-normal tracking-[-1px] text-[var(--ink)]">
                  {card.value}
                </div>
                <div className={`mt-[4px] text-[11px] ${card.hintClass}`}>{card.hint}</div>
              </section>
            ))}
          </div>

          <div
            className={`today-fade-up mt-[12px] grid ${panelGridClass} gap-[12px]`}
            style={{ ["--fade-delay" as string]: "200ms" } as CSSProperties}
          >
            <section className="flex min-h-[380px] flex-col overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)]">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-[16px] py-[13px]">
                <div className="text-[12px] font-medium text-[var(--ink)]">Needs action</div>
                <button
                  type="button"
                  className="text-[11px] font-medium text-[var(--accent-text)]"
                >
                  View queue ÃÂ¢Ã¢â¬Â Ã¢â¬â¢
                </button>
              </div>

              {queueItems.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center px-[20px] py-[24px] text-center">
                  <div className="flex h-[32px] w-[32px] items-center justify-center rounded-full border-[1.5px] border-dashed border-[var(--border-strong)]">
                    <Clock3 className="h-[15px] w-[15px] text-[var(--ink-3)]" strokeWidth={1.9} />
                  </div>
                  <div className="mt-[10px] text-[13px] font-medium text-[var(--ink)]">
                    Queue is empty
                  </div>
                  <div className="mt-[6px] max-w-[220px] text-[12px] leading-[1.5] text-[var(--ink-3)]">
                    Field updates, call transcripts, and unresolved items will surface
                    here automatically.
                  </div>
                  <button
                    type="button"
                    className="mt-[16px] rounded-[6px] border border-[var(--border-strong)] bg-[var(--surface-2)] px-[13px] py-[6px] text-[12px] font-medium text-[var(--ink-2)] transition hover:bg-[var(--surface-3)]"
                  >
                    How does this work?
                  </button>
                </div>
              ) : (
                <div className="flex flex-1 flex-col">
                  {queueItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-[12px] border-b border-[var(--border)] px-[16px] py-[12px] last:border-b-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-[10px]">
                          <span
                            className="mt-[5px] h-[8px] w-[8px] shrink-0 rounded-full"
                            style={{
                              backgroundColor: item.urgent ? "var(--warn)" : "var(--accent)",
                            }}
                          />
                          <div className="text-[13px] leading-[1.45] text-[var(--ink)]">
                            {item.description}
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-[6px]">
                        <span
                          className={`font-dm-mono rounded-[4px] px-[6px] py-[3px] text-[10px] ${sourceTagTone(item.source)}`}
                        >
                          {item.source}
                        </span>
                        <span className="font-dm-mono text-[10px] text-[var(--ink-3)]">
                          {formatRelativeTimestamp(item.timestamp)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {showSetupPanel ? (
              <section className="flex min-h-[380px] flex-col overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)]">
                <div className="border-b border-[var(--border)] px-[16px] py-[13px]">
                  <div className="text-[12px] font-medium text-[var(--ink)]">Getting started</div>
                </div>

                <div className="flex flex-1 flex-col px-[16px] py-[14px]">
                  {[0, 1, 2].map((index) => {
                    const completed = index < setupStepsCompleted;
                    const step = stepDescription(index);
                    return (
                      <div
                        key={step.title}
                        className={`flex gap-[12px] py-[10px] ${index < 2 ? "border-b border-[var(--border)]" : ""}`}
                      >
                        <div
                          className={`font-dm-mono flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border text-[10px] ${
                            completed
                              ? "border-[var(--success)] bg-[var(--success-bg)] text-[var(--success)]"
                              : "border-[var(--border-strong)] text-[var(--ink-3)]"
                          }`}
                        >
                          {completed ? <Check className="h-[10px] w-[10px]" strokeWidth={2.4} /> : index + 1}
                        </div>
                        <div className="min-w-0 text-[12px] leading-[1.5] text-[var(--ink-2)]">
                          <span className="mb-[1px] block font-medium text-[var(--ink)]">
                            {step.title}
                          </span>
                          {step.description}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-[var(--border)] px-[16px] py-[12px]">
                  <button
                    type="button"
                    className="w-full rounded-[6px] bg-[var(--accent-light)] px-[13px] py-[8px] text-[12px] font-medium text-[var(--accent-text)] transition hover:opacity-90"
                  >
                    Connect phone number ÃÂ¢Ã¢â¬Â Ã¢â¬â¢
                  </button>
                </div>
              </section>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}

