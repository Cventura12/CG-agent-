import { useEffect, useMemo, useState } from "react";

import { useAppStore } from "../../store/appStore";
import type { QueueItem } from "../../types";

const STORAGE_KEY = "arbor_onboarding_complete";
const CALL_STORAGE_KEY = "arbor_onboarding_call_started";

function safeLocalStorageGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
}

type Step = 0 | 1 | 2 | 3;

type StepCopy = {
  eyebrow: string;
  title: string;
  body: string;
  primaryLabel: string;
};

const steps: StepCopy[] = [
  {
    eyebrow: "Step 1 - The hookup",
    title: "Connect the number your field already uses.",
    body: "No workflow change. Arbor just listens for the updates you currently miss.",
    primaryLabel: "Connect number",
  },
  {
    eyebrow: "Step 2 - Ghost call",
    title: "Record a 20-second mock change order.",
    body: "Call the Arbor demo line and say: \"Add 4 recessed lights at the Smith job, add $600.\" The transcript will appear with the $600 already extracted.",
    primaryLabel: "I made the call",
  },
  {
    eyebrow: "Step 3 - Queue flip",
    title: "Approve it once. See the draft appear instantly.",
    body: "Arbor moves the approved change into a draft quote or follow-up without the office typing a word.",
    primaryLabel: "Open queue",
  },
  {
    eyebrow: "Step 4 - Memory sync",
    title: "The job record updates itself.",
    body: "Your history shows the $600 entry - office, quote, and job file stay in sync.",
    primaryLabel: "Open job history",
  },
];

function resolveGhostQueue(queueItems: QueueItem[], since: number | null) {
  if (!since) return null;
  const match = queueItems.find((item) => {
    if (!item.createdAt) return false;
    const createdAt = new Date(item.createdAt).getTime();
    return item.source === "CALL" && createdAt >= since;
  });
  return match ?? null;
}

export function ZeroDragOnboarding() {
  const queueItems = useAppStore((state) => state.queueItems);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const setSelectedQueueItem = useAppStore((state) => state.setSelectedQueueItem);
  const setActiveJob = useAppStore((state) => state.setActiveJob);
  const logOnboardingActivity = useAppStore((state) => state.logOnboardingActivity);
  const voiceSessions = useAppStore((state) => state.voiceSessions);
  const jobs = useAppStore((state) => state.jobs);
  const demoLine = (import.meta.env.VITE_ARBOR_DEMO_LINE as string | undefined)?.trim() ?? "";

  const [step, setStep] = useState<Step>(0);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [ghostItemId, setGhostItemId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [visible, setVisible] = useState(() => !safeLocalStorageGet(STORAGE_KEY));
  const [callStartedAt, setCallStartedAt] = useState<number | null>(() => {
    const raw = safeLocalStorageGet(CALL_STORAGE_KEY);
    return raw ? Number(raw) : null;
  });
  const [flashDraft, setFlashDraft] = useState(false);

  const activeStep = steps[step]!;
  const ghostItem = useMemo(() => resolveGhostQueue(queueItems, callStartedAt), [queueItems, callStartedAt]);
  const hasRealData = useMemo(() => {
    const realQueue = queueItems.some((item) => !item.description.toLowerCase().includes("mock"));
    const realJobs = jobs.some((job) => !job.tags?.includes("onboarding"));
    return realQueue || realJobs || voiceSessions.length > 0;
  }, [queueItems, jobs, voiceSessions]);

  useEffect(() => {
    if (hasRealData) {
      finishOnboarding();
    }
  }, [hasRealData]);

  useEffect(() => {
    if (step === 2 && ghostItem?.id) {
      setGhostItemId(ghostItem.id);
      if (ghostItem.jobId) {
        setJobId(ghostItem.jobId);
        logOnboardingActivity(ghostItem.jobId, "Ghost call captured from field line.", 600);
      }
    }
    if (step === 2 && ghostItem?.status === "approved") {
      setStep(3);
      setFlashDraft(true);
      if (ghostItem.jobId) {
        logOnboardingActivity(ghostItem.jobId, "Draft created from ghost call approval.", 600);
      }
      const timer = window.setTimeout(() => setFlashDraft(false), 1800);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [step, ghostItem]);

  if (!visible) {
    return null;
  }

  const handlePrimary = () => {
    if (step === 0) {
      setStep(1);
      return;
    }

    if (step === 1) {
      const now = Date.now();
      setCallStartedAt(now);
      safeLocalStorageSet(CALL_STORAGE_KEY, String(now));
      setStep(2);
      return;
    }

    if (step === 2) {
      if (ghostItemId) {
        setSelectedQueueItem(ghostItemId);
      }
      setActiveView("queue");
      return;
    }

    if (step === 3) {
      if (jobId) setActiveJob(jobId);
      setActiveView("jobs");
      finishOnboarding();
    }
  };

  const finishOnboarding = () => {
    safeLocalStorageSet(STORAGE_KEY, "1");
    setVisible(false);
  };

  return (
    <div className="mb-4 rounded-2xl border border-[var(--line-2)] bg-[var(--bg-2)] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.7px] text-[var(--accent-2)]">{activeStep.eyebrow}</div>
          <div className="mt-2 text-[18px] font-semibold tracking-[-0.02em] text-[var(--t1)]">{activeStep.title}</div>
          <div className="mt-2 text-[13px] leading-relaxed text-[var(--t2)]">{activeStep.body}</div>
        </div>
        <button
          type="button"
          className="rounded-lg border border-[var(--line-2)] px-3 py-1 text-[11px] text-[var(--t3)] transition hover:border-[var(--line-3)] hover:text-[var(--t1)]"
          onClick={finishOnboarding}
        >
          Skip
        </button>
      </div>

      {step === 0 ? (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            placeholder="Field phone number"
            className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--bg-3)] px-3 py-2 text-[12px] text-[var(--t1)]"
          />
          <button
            type="button"
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-[12px] font-semibold text-[var(--ink)] transition hover:brightness-110"
            onClick={handlePrimary}
          >
            {activeStep.primaryLabel}
          </button>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-[12px] font-semibold text-[var(--ink)] transition hover:brightness-110"
            onClick={handlePrimary}
          >
            {activeStep.primaryLabel}
          </button>
          {step === 1 ? (
            <div className="text-[11px] text-[var(--t3)]">
              {demoLine ? (
                <>
                  Call <a className="text-[var(--accent-2)] underline" href={`tel:${demoLine}`}>{demoLine}</a> and leave the mock change order.
                </>
              ) : (
                "Call your Arbor line and leave the mock change order."
              )}
            </div>
          ) : null}
          {step === 2 && ghostItem?.status !== "approved" ? (
            <div className="text-[11px] text-[var(--amber)]">
              Approve the new call item in Queue to complete this step.
            </div>
          ) : null}
        </div>
      )}

      {step === 2 && !ghostItem ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-[var(--line-2)] bg-[var(--bg-3)] px-3 py-2 text-[11px] text-[var(--t2)]">
          <span className="inline-flex h-2 w-2 rounded-full bg-[var(--green)] animate-pulse" />
          Listening for the ghost call... the transcript will appear here.
        </div>
      ) : null}

      {step === 2 && ghostItem?.rawTranscriptSnippet ? (
        <div className="mt-3 rounded-lg border border-[var(--line-2)] bg-[var(--bg-3)] p-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.7px] text-[var(--t3)]">Transcript preview</div>
          <div className="mt-2 text-[12px] leading-relaxed text-[var(--t1)]">{ghostItem.rawTranscriptSnippet}</div>
          <div className="mt-2 text-[11px] text-[var(--t3)]">Detected amount: $600 - Confidence 88%</div>
        </div>
      ) : null}

      {flashDraft ? (
        <div className="mt-3 rounded-lg border border-[var(--green)] bg-[var(--green-b)] px-3 py-2 text-[12px] text-[var(--t1)]">
          Draft created - review ready.
        </div>
      ) : null}
    </div>
  );
}
