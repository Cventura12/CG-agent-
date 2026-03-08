import { Link } from "react-router-dom";

const HOW_IT_WORKS = [
  {
    title: "Capture the mess",
    body: "Upload a scope sheet, paste notes, ingest a call transcript, or enter field details from the jobsite.",
  },
  {
    title: "Generate structured work",
    body: "GC Agent turns inbound communication into quote drafts, queue actions, risk flags, and missing-information checklists.",
  },
  {
    title: "Review before anything goes out",
    body: "Contractors edit, approve, discard, or send with a clear audit trail instead of blind automation.",
  },
  {
    title: "Follow up automatically",
    body: "Delivery, reminders, stops, and responses stay tracked so follow-up stops being manual busywork.",
  },
  {
    title: "Learn from real outcomes",
    body: "Approved quotes, spreadsheet price books, and job history strengthen future estimates over time.",
  },
];

const WHY_IT_MATTERS = [
  "Faster quote turnaround",
  "Less work lost in calls and texts",
  "Cleaner job history",
  "Better follow-up discipline",
  "Pricing that gets smarter over time",
];

const DIFFERENTIATORS = [
  "Built for contractor workflows, not generic chat",
  "Human-in-the-loop review, not blind automation",
  "Handles transcripts, uploads, notes, and quotes in one system",
  "Tracks what was sent, what changed, and what happened next",
];

const USE_CASES = [
  "Quote requests from calls or notes",
  "Job updates that need review",
  "Client follow-up that should not be manual",
  "Spreadsheet price books that need to become usable estimating data",
];

export function LandingPage() {
  return (
    <main className="min-h-screen bg-bg text-text">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="panel ani" style={{ marginBottom: 16 }}>
          <div className="pb lg">
            <div className="eyebrow">Contractor Operations Agent</div>
            <div className="ph-row" style={{ gap: 24, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ maxWidth: 720 }}>
                <h1 className="ptitle" style={{ fontSize: 42, lineHeight: 0.95 }}>
                  GC Agent turns contractor calls, notes, uploads, and job updates into quotes, queue actions, and follow-up.
                </h1>
                <p className="psub" style={{ marginTop: 12, maxWidth: 640, fontSize: 14 }}>
                  Stop losing work in texts, calls, and paperwork. GC Agent converts messy inbound communication into structured,
                  reviewable operations for general contractors.
                </p>
              </div>
              <div className="hs" style={{ gap: 10, flexWrap: "wrap" }}>
                <Link to="/onboarding" className="cta">
                  Get your first quote draft
                </Link>
                <a href="#how-it-works" className="btn bw">
                  See how it works
                </a>
              </div>
            </div>
          </div>
        </header>

        <section className="sstrip c4 ani a1" style={{ marginBottom: 16 }}>
          {[
            ["Inputs", "Calls / uploads / notes", "Field intake normalized"],
            ["Outputs", "Quotes / drafts / follow-up", "Reviewable by default"],
            ["Trust", "Traceable lineage", "Nothing important disappears"],
            ["Learning", "Pricing memory", "Improves from approved outcomes"],
          ].map(([key, value, detail]) => (
            <div key={key} className="scell">
              <div className="sk">{key}</div>
              <div className="sv" style={{ fontSize: 24 }}>
                {value}
              </div>
              <div className="sd flat">{detail}</div>
            </div>
          ))}
        </section>

        <div className="g2" style={{ alignItems: "start", marginBottom: 16 }}>
          <section id="how-it-works" className="panel ani a2">
            <div className="ph2">
              <span className="ptl">How It Works</span>
            </div>
            <div className="pb lg vs">
              {HOW_IT_WORKS.map((item) => (
                <div key={item.title} className="tli">
                  <div className="tln a">o</div>
                  <div>
                    <div className="tll">{item.title}</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: "var(--steel)", lineHeight: 1.7 }}>{item.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="vs">
            <section className="panel ani a3">
              <div className="ph2">
                <span className="ptl">Why Contractors Care</span>
              </div>
              <div className="pb lg vs">
                {WHY_IT_MATTERS.map((item) => (
                  <div key={item} className="drow" style={{ cursor: "default" }}>
                    <span className="tag tg">Outcome</span>
                    <div style={{ fontSize: 13, color: "var(--cream)" }}>{item}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel ani a4">
              <div className="ph2">
                <span className="ptl">Trust</span>
              </div>
              <div className="pb lg">
                <div style={{ fontSize: 12, color: "var(--cream)", marginBottom: 10 }}>
                  Every important step is durable, reviewable, and traceable:
                </div>
                <div className="hs" style={{ flexWrap: "wrap", gap: 6 }}>
                  {[
                    "Raw input captured",
                    "AI summary visible",
                    "Queue action recorded",
                    "Quote lineage preserved",
                    "Delivery and follow-up tracked",
                  ].map((item) => (
                    <span key={item} className="tag tb">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>

        <div className="g2" style={{ alignItems: "start", marginBottom: 16 }}>
          <section className="panel ani a1">
            <div className="ph2">
              <span className="ptl">What Makes It Different</span>
            </div>
            <div className="pb lg vs">
              {DIFFERENTIATORS.map((item) => (
                <div key={item} className="drow" style={{ cursor: "default" }}>
                  <span className="tag ta">Operator</span>
                  <div style={{ fontSize: 13, color: "var(--cream)" }}>{item}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel ani a2">
            <div className="ph2">
              <span className="ptl">Use Cases</span>
            </div>
            <div className="pb lg vs">
              {USE_CASES.map((item) => (
                <div key={item} className="drow" style={{ cursor: "default" }}>
                  <span className="tag ts">Workflow</span>
                  <div style={{ fontSize: 13, color: "var(--cream)" }}>{item}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="panel ani a3">
          <div className="pb lg">
            <div className="ph-row" style={{ gap: 20, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <div className="eyebrow">Bring your existing workflow</div>
                <div className="ptitle" style={{ fontSize: 28 }}>
                  Keep the spreadsheets. Stop losing the work hidden inside them.
                </div>
              </div>
              <div className="hs" style={{ gap: 10, flexWrap: "wrap" }}>
                <Link to="/onboarding" className="cta">
                  Get your first quote draft
                </Link>
                <a href="#how-it-works" className="btn bw">
                  See how it works
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

