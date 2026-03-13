import { Link } from "react-router-dom";

const CORE_ACTIONS = [
  {
    title: "Capture what happened",
    body: "Bring in calls, notes, uploads, transcripts, and field updates without forcing the team into a brand-new workflow.",
  },
  {
    title: "Show what changed",
    body: "Detect estimate requests, unresolved issues, owner asks, follow-up responses, and financially important scope changes.",
  },
  {
    title: "Create the next step",
    body: "Turn communication into queue actions, quote drafts, follow-up drafts, and job activity instead of letting it die in calls and texts.",
  },
  {
    title: "Keep follow-through visible",
    body: "Track what was sent, what still needs review, and what is unresolved before it turns into rework or margin loss.",
  },
];

const WORKFLOW_STEPS = [
  {
    title: "Capture the mess",
    body: "Calls, texts, field notes, PDFs, photos, and superintendent updates come into one system.",
  },
  {
    title: "Structure what matters",
    body: "GC Agent summarizes what happened, flags missing information, surfaces risks, and links work to the right job when possible.",
  },
  {
    title: "Review before anything goes out",
    body: "Your team reviews quote drafts, update actions, and follow-up messages instead of trusting blind automation.",
  },
  {
    title: "Protect money and commitments",
    body: "Send quotes, track follow-up, log changes, and keep a clean history of what changed and what happened next.",
  },
];

const USE_CASES = [
  {
    title: "A customer calls with a scope change",
    body: "The conversation becomes a summary, a queue item, and a draft next step instead of a forgotten note.",
  },
  {
    title: "A field issue needs office action",
    body: "Updates from the field turn into tracked follow-through before they become a billing or schedule problem.",
  },
  {
    title: "A quote needs to move",
    body: "Generate, review, send, and follow up inside one workflow with delivery and reminder state attached.",
  },
  {
    title: "Your pricing still lives in spreadsheets",
    body: "Import the existing price book and use it to strengthen quote drafts without replacing the way your team already prices work.",
  },
];

const WHY_IT_MATTERS = [
  "Faster quote turnaround",
  "Less work lost in calls and texts",
  "Better visibility into unresolved scope and commitments",
  "Cleaner job history for field and office",
  "Better handling of communication that affects money",
  "A stronger link between what was said and what actually got done",
];

const TRUST_POINTS = [
  "Raw input captured",
  "Summary visible",
  "Queue action recorded",
  "Quote lineage preserved",
  "Delivery tracked",
  "Follow-up state visible",
  "Job history kept intact",
];

const PRODUCT_PROOF = [
  "Generate quote drafts from messy notes, uploads, and transcripts",
  "Review queue items and draft next actions before they slip",
  "Track transcript-driven job activity alongside updates and quote history",
  "Send quotes by SMS or email with visible delivery state",
  "Run follow-up reminders with clear stop conditions",
  "Import spreadsheet pricing and export clean quote workbooks",
];

export function LandingPage() {
  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <section className="surface-panel page-hero overflow-hidden">
          <div className="border-b border-slate-200 px-6 py-4 sm:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Execution-side communication control</p>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  GC Agent is built for general contractors who need field communication to become office action.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a href="#how-it-works" className="action-button-secondary">
                  See What Needs Attention
                </a>
                <Link to="/onboarding" className="action-button-primary">
                  Create Your First Quote
                </Link>
              </div>
            </div>
          </div>
          <div className="grid gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:items-center">
            <div>
              <h1 className="text-[clamp(2.75rem,5vw,4.5rem)] font-bold leading-[0.94] tracking-[-0.06em] text-slate-950">
                Keep control of messy project communication before it costs you money
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
                GC Agent turns calls, texts, field notes, uploads, and job updates into tracked actions, quote drafts,
                follow-up, and job history for general contractors.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link to="/onboarding" className="action-button-primary">
                  Create Your First Quote
                </Link>
                <a href="#what-gc-agent-does" className="action-button-secondary">
                  How It Works
                </a>
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    label: "Inputs",
                    value: "Calls, notes, uploads",
                    detail: "Bring in what the field already uses.",
                  },
                  {
                    label: "Outputs",
                    value: "Quotes, queue, follow-up",
                    detail: "Everything becomes reviewable action.",
                  },
                  {
                    label: "Control",
                    value: "Unresolved work surfaced",
                    detail: "See what changed and what still needs action.",
                  },
                  {
                    label: "Trust",
                    value: "Tracked history",
                    detail: "Nothing important disappears into texts and calls.",
                  },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="data-label">{item.label}</p>
                    <p className="mt-3 text-lg font-semibold text-slate-950">{item.value}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="surface-panel">
            <div className="surface-card-header">
              <div>
                <p className="eyebrow">The problem</p>
                <h2 className="text-3xl font-bold tracking-[-0.04em] text-slate-950">
                  The field moves fast. The office pays for what gets missed.
                </h2>
              </div>
            </div>
            <div className="surface-card-body">
              <div className="grid gap-3">
                {[
                  "Scope changes show up in calls.",
                  "Owner requests live in texts.",
                  "Superintendent updates never make it into the system.",
                  "Quotes get sent, but follow-up slips.",
                  "Financial exposure starts before documentation catches up.",
                ].map((line) => (
                  <div key={line} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <span className="mt-1 h-2.5 w-2.5 rounded-full bg-orange-500" />
                    <p className="text-[15px] leading-7 text-slate-700">{line}</p>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-[15px] leading-7 text-slate-600">
                GC Agent helps your team capture what happened, track what changed, and act before it gets lost.
              </p>
            </div>
          </div>

          <div className="surface-panel-subtle">
            <div className="surface-card-header">
              <div>
                <p className="eyebrow">Why contractors use it</p>
                <h2 className="text-3xl font-bold tracking-[-0.04em] text-slate-950">Control, not generic AI</h2>
              </div>
            </div>
            <div className="surface-card-body">
              <div className="grid gap-3">
                {WHY_IT_MATTERS.map((item) => (
                  <div key={item} className="rounded-2xl border border-blue-100 bg-white px-4 py-3 text-[15px] font-medium text-slate-700">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="what-gc-agent-does" className="mt-8">
          <div className="mb-5">
            <p className="eyebrow">What GC Agent does</p>
            <h2 className="text-3xl font-bold tracking-[-0.04em] text-slate-950">
              Turn communication into tracked operational action
            </h2>
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {CORE_ACTIONS.map((item) => (
              <div key={item.title} className="surface-panel">
                <div className="surface-card-body">
                  <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-sm font-semibold text-[#2453d4]">
                    {item.title.split(" ")[0]}
                  </div>
                  <h3 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">{item.title}</h3>
                  <p className="mt-3 text-[15px] leading-7 text-slate-600">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="mt-8 surface-panel">
          <div className="surface-card-header">
            <div>
              <p className="eyebrow">How it works</p>
              <h2 className="text-3xl font-bold tracking-[-0.04em] text-slate-950">
                Built around the way contractors already work
              </h2>
            </div>
          </div>
          <div className="surface-card-body">
            <div className="grid gap-4 lg:grid-cols-2">
              {WORKFLOW_STEPS.map((step, index) => (
                <div key={step.title} className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2453d4] text-sm font-semibold text-white">
                      {index + 1}
                    </div>
                    <h3 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">{step.title}</h3>
                  </div>
                  <p className="mt-4 text-[15px] leading-7 text-slate-600">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
          <div className="surface-panel">
            <div className="surface-card-header">
              <div>
                <p className="eyebrow">Use cases</p>
                <h2 className="text-3xl font-bold tracking-[-0.04em] text-slate-950">Where GC Agent helps most</h2>
              </div>
            </div>
            <div className="surface-card-body">
              <div className="grid gap-4 md:grid-cols-2">
                {USE_CASES.map((item) => (
                  <div key={item.title} className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-5">
                    <span className="tag tb">Workflow</span>
                    <h3 className="mt-4 text-xl font-semibold tracking-[-0.03em] text-slate-950">{item.title}</h3>
                    <p className="mt-3 text-[15px] leading-7 text-slate-600">{item.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="surface-panel-subtle">
            <div className="surface-card-header">
              <div>
                <p className="eyebrow">Trust and auditability</p>
                <h2 className="text-3xl font-bold tracking-[-0.04em] text-slate-950">Nothing important disappears</h2>
              </div>
            </div>
            <div className="surface-card-body">
              <p className="text-[15px] leading-7 text-slate-600">
                Every important step stays visible for the office and the field.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {TRUST_POINTS.map((item) => (
                  <span key={item} className="tag ts">
                    {item}
                  </span>
                ))}
              </div>
              <div className="mt-6 rounded-[24px] border border-orange-100 bg-orange-50 px-5 py-5">
                <h3 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">
                  Execution-side control, not just intelligence
                </h3>
                <p className="mt-3 text-[15px] leading-7 text-slate-600">
                  GC Agent is not a generic chatbot or a preconstruction review tool. It is an execution-side system
                  that helps contractors keep control of communication, changes, and follow-through while jobs are
                  moving.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 surface-panel">
          <div className="surface-card-header">
            <div>
              <p className="eyebrow">Product proof</p>
              <h2 className="text-3xl font-bold tracking-[-0.04em] text-slate-950">
                What GC Agent already helps teams do
              </h2>
            </div>
          </div>
          <div className="surface-card-body">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {PRODUCT_PROOF.map((item) => (
                <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-[15px] leading-7 text-slate-700">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-[32px] border border-slate-200 bg-gradient-to-r from-white to-blue-50 px-6 py-8 shadow-sm sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <p className="eyebrow">Final call to action</p>
              <h2 className="text-3xl font-bold tracking-[-0.04em] text-slate-950">
                Don&apos;t lose scope, follow-through, or money in project communication
              </h2>
              <p className="mt-3 max-w-2xl text-[15px] leading-7 text-slate-600">
                Start with the communication you already have. GC Agent helps turn it into action.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/onboarding" className="action-button-primary">
                Create Your First Quote
              </Link>
              <a href="#how-it-works" className="action-button-secondary">
                See What Needs Attention
              </a>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

