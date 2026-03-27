import { useEffect, useMemo, useState } from "react";

import { useAppStore } from "../../store/appStore";
import type { QueueItem } from "../../types";

const STORAGE_KEY = "arbor_onboarding_complete";

type Step = 0 | 1 | 2 | 3;

type StepCopy = {
  eyebrow: string;
  title: string;
  body: string;
  primaryLabel: string;
};

const steps: StepCopy[] = [
  {
    eyebrow: "Step 1 · The hookup",
    title: "Connect the number your field already uses.",
    body: "No workflow change. Arbor just listens for the updates you currently miss.",
    primaryLabel: "Connect number",
  },
  {
    eyebrow: "Step 2 · Ghost call",
    title: "Record a 20‑second mock change order.",
    body: "Say: “Add 4 recessed lights at the Smith job, add $600.” Watch the transcript land with the $600 already extracted.",
    primaryLabel: "Record mock change",
  },
  {
    eyebrow: "Step 3 · Queue flip",
    title: "Approve it once. See the draft appear instantly.",
    body: "Arbor moves the approved change into a draft quote or follow‑up without the office typing a word.",
    primaryLabel: "Open queue",
  },
  {
    eyebrow: "Step 4 · Memory sync",
    title: "The job record updates itself.",
    body: "Your history shows the $600 entry — office, quote, and job file stay in sync.",
    primaryLabel: "Open job history",
  },
];

function resolveMockQueue(queueItems: QueueItem[], id: string | null) {
  return id ? queueItems.find((item) => item.id === id) ?? null : null;
}

export function ZeroDragOnboarding() {
  const queueItems = useAppStore((state) => state.queueItems);
  const seedGhostCall = useAppStore((state) => state.seedGhostCallQueueItem);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const setSelectedQueueItem = useAppStore((state) => state.setSelectedQueueItem);
  const setActiveJob = useAppStore((state) => state.setActiveJob);

  const [step, setStep] = useState<Step>(0);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [ghostItemId, setGhostItemId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [visible, setVisible] = useState(() => !localStorage.getItem(STORAGE_KEY));

  const activeStep = steps[step]!;
  const ghostItem = useMemo(() => resolveMockQueue(queueItems, ghostItemId), [queueItems, ghostItemId]);

  useEffect(() => {
    if (step === 2 && ghostItem?.status === "approved") {
      setStep(3);
    }
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
      const result = seedGhostCall(phoneNumber);
      if (result) {
        setGhostItemId(result.queueItemId);
        setJobId(result.jobId);
      }
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
      if (jobId) {
        setActiveJob(jobId);
      }
      setActiveView("jobs");
      finishOnboarding();
    }
  };

  const finishOnboarding = () => {
    localStorage.setItem(STORAGE_KEY, "1");
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
            <div className="text-[11px] text-[var(--t3)]">Arbor simulates a transcript so you can see the agent loop instantly.</div>
          ) : null}
          {step === 2 && ghostItem?.status !== "approved" ? (
            <div className="text-[11px] text-[var(--amber)]">
              Approve the mock item in Queue to complete this step.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
