import { BOOK_DEMO_HREF } from '../components/siteLinks'
import { SmartLink } from '../components/SmartLink'

const steps = [
  {
    number: 'STEP 01',
    title: 'Capture',
    body: 'Inbound lands - a call transcript, a voice note, a text, a document upload. Fieldr ingests it automatically. Nothing manual.',
  },
  {
    number: 'STEP 02',
    title: 'Extract',
    body: 'The agent reads every input and pulls out what matters - scope changes, commitments, open questions, pricing signals. Structured, not summarized.',
  },
  {
    number: 'STEP 03',
    title: 'Queue',
    body: 'Extracted items surface in your review queue with context. What changed, what it affects, what needs to happen. You approve, edit, or dismiss.',
  },
  {
    number: 'STEP 04',
    title: 'Execute + Learn',
    body: 'Approved items become draft quotes, tracked changes, follow-through, or job history. Every approval writes back to memory. The next job is faster.',
  },
]

export default function HowItWorks() {
  return (
    <>
      <style>{`
        .fieldr-how {
          min-height: 100vh;
          padding-top: 56px;
        }

        .fieldr-how__page-header {
          padding: 120px 40px 60px;
          border-bottom: 1px solid var(--rule);
        }

        .fieldr-how__inner {
          max-width: 1240px;
          margin: 0 auto;
        }

        .fieldr-how__eyebrow {
          margin: 0;
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--sienna-lt);
        }

        .fieldr-how__headline {
          margin: 14px 0 0;
          font-family: var(--serif);
          font-size: clamp(40px, 6vw, 54px);
          line-height: 1.06;
          letter-spacing: -1px;
          color: var(--bright);
        }

        .fieldr-how__subhead {
          margin: 16px 0 0;
          max-width: 480px;
          font-size: 16px;
          line-height: 1.7;
          font-weight: 300;
          color: var(--dim);
        }

        .fieldr-how__steps {
          border-bottom: 1px solid var(--rule);
        }

        .fieldr-how__steps-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .fieldr-how__step {
          position: relative;
          padding: 48px 36px;
          border-right: 1px solid var(--rule);
        }

        .fieldr-how__step:last-child {
          border-right: 0;
        }

        .fieldr-how__step::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          height: 2px;
          background: var(--sienna);
        }

        .fieldr-how__step-number {
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--sienna-lt);
        }

        .fieldr-how__step-title {
          margin-top: 12px;
          font-family: var(--serif);
          font-size: 22px;
          font-weight: 500;
          line-height: 1.2;
          color: var(--bright);
        }

        .fieldr-how__step-body {
          margin-top: 10px;
          font-size: 13px;
          line-height: 1.7;
          font-weight: 300;
          color: var(--dim);
        }

        .fieldr-how__cta {
          padding: 80px 40px;
          border-top: 1px solid var(--rule);
          text-align: center;
        }

        .fieldr-how__cta-title {
          margin: 0;
          font-family: var(--serif);
          font-size: clamp(34px, 5vw, 42px);
          line-height: 1.15;
          font-style: italic;
          color: var(--bright);
        }

        .fieldr-how__cta-button {
          margin-top: 24px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 5px;
          padding: 13px 28px;
          background: var(--sienna);
          color: var(--bright);
          font-family: var(--sans);
          font-size: 14px;
          font-weight: 500;
          line-height: 1;
          cursor: pointer;
          text-decoration: none;
        }

        .fieldr-how__cta-note {
          margin-top: 18px;
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--muted);
        }

        @media (max-width: 1080px) {
          .fieldr-how__steps-grid {
            grid-template-columns: 1fr;
          }

          .fieldr-how__step {
            border-right: 0;
            border-bottom: 1px solid var(--rule);
          }

          .fieldr-how__step:last-child {
            border-bottom: 0;
          }
        }

        @media (max-width: 640px) {
          .fieldr-how__page-header,
          .fieldr-how__cta {
            padding-left: 20px;
            padding-right: 20px;
          }

          .fieldr-how__page-header {
            padding-top: 104px;
            padding-bottom: 48px;
          }

          .fieldr-how__step {
            padding: 36px 20px;
          }

          .fieldr-how__cta-button {
            width: min(100%, 280px);
            justify-content: center;
            text-align: center;
          }
        }
      `}</style>

      <main className="fieldr-how" aria-label="Fieldr how it works page">
        <section className="fieldr-how__page-header">
          <div className="fieldr-how__inner">
            <p className="fieldr-how__eyebrow">System architecture</p>
            <h1 className="fieldr-how__headline">How the agent works.</h1>
            <p className="fieldr-how__subhead">
              Fieldr runs a continuous capture and review loop. No new workflow. No app for your crew to learn. It watches what already comes in and closes the gap before it widens.
            </p>
          </div>
        </section>

        <section className="fieldr-how__steps">
          <div className="fieldr-how__steps-grid">
            {steps.map((step) => (
              <article key={step.number} className="fieldr-how__step">
                <div className="fieldr-how__step-number">{step.number}</div>
                <div className="fieldr-how__step-title">{step.title}</div>
                <div className="fieldr-how__step-body">{step.body}</div>
              </article>
            ))}
          </div>
        </section>

        <section className="fieldr-how__cta">
          <div className="fieldr-how__inner">
            <h2 className="fieldr-how__cta-title">Ready to close the gap?</h2>
            <SmartLink to={BOOK_DEMO_HREF} className="fieldr-how__cta-button">
              Book a Demo
            </SmartLink>
            <div className="fieldr-how__cta-note">20 minutes &middot; No commitment &middot; Chattanooga, TN</div>
          </div>
        </section>
      </main>
    </>
  )
}
