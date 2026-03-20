import { useLayoutEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { BOOK_DEMO_HREF } from '../components/siteLinks'
import { SmartLink } from '../components/SmartLink'

const ownerRows = [
  {
    label: 'Catches field updates',
    copy: 'Calls, texts, and uploads land in one review lane instead of getting buried across inboxes.',
  },
  {
    label: 'Prepares the next move',
    copy: 'When the work changes, the quote draft and follow-up are already lined up before the billing window closes.',
  },
  {
    label: 'Keeps the job record current',
    copy: 'Approvals, notes, and pricing memory stay with the work so the owner is not relying on memory to close it out.',
  },
]

const proofPills = ['Calls', 'Texts', 'Voice notes', 'Uploads']

export default function Product() {
  const rootRef = useRef(null)

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const timeline = gsap.timeline({ defaults: { ease: 'power2.out' } })

      timeline
        .from('[data-product-reveal="eyebrow"]', { y: 18, opacity: 0, duration: 0.42 })
        .from('[data-product-reveal="headline"]', { y: 26, opacity: 0, duration: 0.68 }, '-=0.16')
        .from('[data-product-reveal="subhead"]', { y: 18, opacity: 0, duration: 0.48 }, '-=0.4')
        .from('[data-product-reveal="proof"]', { y: 14, opacity: 0, duration: 0.38 }, '-=0.26')
        .from('[data-product-reveal="cta"]', { y: 14, opacity: 0, duration: 0.38 }, '-=0.24')
        .from('.fieldr-product__hero-card', { y: 24, opacity: 0, duration: 0.54 }, '-=0.42')
        .from('.fieldr-product__hero-card-row', { y: 10, opacity: 0, duration: 0.32, stagger: 0.06 }, '-=0.26')
        .from('.fieldr-product__summary', { y: 18, opacity: 0, duration: 0.44 }, '-=0.18')
        .from('.fieldr-product__summary-item', { y: 10, opacity: 0, duration: 0.28, stagger: 0.06 }, '-=0.2')
    }, rootRef)

    return () => ctx.revert()
  }, [])

  return (
    <>
      <style>{`
        .fieldr-product {
          min-height: 100vh;
          padding-top: 56px;
        }

        .fieldr-product__header {
          position: relative;
          overflow: hidden;
          padding: 100px 40px 72px;
          border-bottom: 1px solid var(--rule);
        }

        .fieldr-product__header::before {
          content: '';
          position: absolute;
          inset: -12% auto auto 0;
          width: 56%;
          height: 420px;
          background: radial-gradient(circle at 24% 28%, rgba(184,83,46,0.14), transparent 64%);
          pointer-events: none;
        }

        .fieldr-product__inner {
          max-width: 1180px;
          margin: 0 auto;
        }

        .fieldr-product__header-grid {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: minmax(0, 0.92fr) minmax(320px, 0.72fr);
          gap: 40px;
          align-items: end;
        }

        .fieldr-product__eyebrow {
          margin: 0;
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--sienna-lt);
        }

        .fieldr-product__headline {
          margin: 14px 0 0;
          max-width: 760px;
          font-family: var(--serif);
          font-size: clamp(40px, 6vw, 54px);
          line-height: 1.04;
          letter-spacing: -1px;
          color: var(--bright);
        }

        .fieldr-product__subhead {
          margin: 16px 0 0;
          max-width: 500px;
          font-size: 16px;
          line-height: 1.7;
          font-weight: 300;
          color: var(--body);
        }

        .fieldr-product__proof {
          margin-top: 18px;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .fieldr-product__pill {
          border: 1px solid var(--rule2);
          border-radius: 999px;
          padding: 7px 11px;
          background: var(--surface);
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--body);
        }

        .fieldr-product__demo,
        .fieldr-product__cta-button {
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
          text-decoration: none;
        }

        .fieldr-product__demo {
          margin-top: 24px;
        }

        .fieldr-product__hero-card {
          border: 1px solid var(--rule2);
          border-radius: 14px;
          overflow: hidden;
          background: linear-gradient(180deg, rgba(28,26,23,0.96) 0%, rgba(16,15,13,0.98) 100%);
          box-shadow: 0 24px 64px rgba(0,0,0,0.28);
        }

        .fieldr-product__hero-card-head {
          padding: 18px 20px 14px;
          border-bottom: 1px solid var(--rule);
        }

        .fieldr-product__hero-card-label {
          font-family: var(--mono);
          font-size: 8px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--sienna-lt);
        }

        .fieldr-product__hero-card-title {
          margin-top: 12px;
          max-width: 300px;
          font-size: 17px;
          line-height: 1.35;
          color: var(--bright);
        }

        .fieldr-product__hero-card-copy {
          margin-top: 10px;
          font-size: 12px;
          line-height: 1.65;
          color: var(--body);
        }

        .fieldr-product__hero-card-row {
          display: grid;
          grid-template-columns: 124px minmax(0, 1fr);
          gap: 16px;
          padding: 14px 20px;
          border-top: 1px solid var(--rule);
        }

        .fieldr-product__hero-card-kicker {
          font-family: var(--mono);
          font-size: 8px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--muted);
        }

        .fieldr-product__hero-card-rowcopy {
          font-size: 12px;
          line-height: 1.55;
          color: var(--body);
        }

        .fieldr-product__summary-wrap {
          padding: 0 40px 88px;
        }

        .fieldr-product__summary {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0;
          border: 1px solid var(--rule);
          border-radius: 16px;
          overflow: hidden;
          background: linear-gradient(180deg, rgba(24,22,19,0.98) 0%, rgba(17,15,13,0.98) 100%);
          box-shadow: 0 26px 70px rgba(0,0,0,0.24);
        }

        .fieldr-product__summary-item {
          padding: 22px 22px 24px;
          border-right: 1px solid var(--rule);
        }

        .fieldr-product__summary-item:last-child {
          border-right: 0;
        }

        .fieldr-product__summary-label {
          font-family: var(--mono);
          font-size: 8px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--sienna-lt);
        }

        .fieldr-product__summary-title {
          margin-top: 14px;
          font-size: 16px;
          line-height: 1.45;
          color: var(--bright);
        }

        .fieldr-product__summary-copy {
          margin-top: 8px;
          font-size: 13px;
          line-height: 1.65;
          color: var(--body);
        }

        .fieldr-product__cta {
          padding: 80px 40px;
          border-top: 1px solid var(--rule);
          text-align: center;
        }

        .fieldr-product__cta-title {
          margin: 0;
          font-family: var(--serif);
          font-size: clamp(34px, 5vw, 42px);
          line-height: 1.15;
          font-style: italic;
          color: var(--bright);
        }

        .fieldr-product__cta-note {
          margin-top: 18px;
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--muted);
        }

        @media (max-width: 1040px) {
          .fieldr-product__header-grid,
          .fieldr-product__summary {
            grid-template-columns: 1fr;
          }

          .fieldr-product__hero-card {
            max-width: 640px;
          }

          .fieldr-product__summary-item {
            border-right: 0;
            border-bottom: 1px solid var(--rule);
          }

          .fieldr-product__summary-item:last-child {
            border-bottom: 0;
          }
        }

        @media (max-width: 860px) {
          .fieldr-product__header,
          .fieldr-product__summary-wrap,
          .fieldr-product__cta {
            padding-left: 20px;
            padding-right: 20px;
          }

          .fieldr-product__header {
            padding-top: 96px;
            padding-bottom: 64px;
          }

          .fieldr-product__hero-card-row {
            grid-template-columns: 1fr;
            gap: 10px;
          }

          .fieldr-product__demo,
          .fieldr-product__cta-button {
            width: min(100%, 280px);
          }

          .fieldr-product__summary-wrap {
            padding-bottom: 72px;
          }
        }
      `}</style>

      <main ref={rootRef} className="fieldr-product" aria-label="Fieldr product page">
        <section className="fieldr-product__header">
          <div className="fieldr-product__inner fieldr-product__header-grid">
            <div>
              <p className="fieldr-product__eyebrow" data-product-reveal="eyebrow">
                Product
              </p>
              <h1 className="fieldr-product__headline" data-product-reveal="headline">
                The tool that keeps the office on the current version of the job.
              </h1>
              <p className="fieldr-product__subhead" data-product-reveal="subhead">
                Fieldr keeps field updates, quote pressure, and follow-through in one place so the owner can see what
                changed and decide what goes out next.
              </p>
              <div className="fieldr-product__proof" data-product-reveal="proof">
                {proofPills.map((pill) => (
                  <span key={pill} className="fieldr-product__pill">
                    {pill}
                  </span>
                ))}
              </div>
              <SmartLink to={BOOK_DEMO_HREF} className="fieldr-product__demo" data-product-reveal="cta">
                Book a Demo
              </SmartLink>
            </div>

            <aside className="fieldr-product__hero-card" aria-label="What owners care about">
              <div className="fieldr-product__hero-card-head">
                <div className="fieldr-product__hero-card-label">What owners care about</div>
                <div className="fieldr-product__hero-card-title">
                  The office can see what changed without chasing the thread.
                </div>
                <div className="fieldr-product__hero-card-copy">
                  The agent keeps the office on the current version of the job. It catches the update, prepares the next
                  move, and leaves a record behind.
                </div>
              </div>

              {ownerRows.map((row) => (
                <div key={row.label} className="fieldr-product__hero-card-row">
                  <div className="fieldr-product__hero-card-kicker">{row.label}</div>
                  <div className="fieldr-product__hero-card-rowcopy">{row.copy}</div>
                </div>
              ))}
            </aside>
          </div>
        </section>

        <section className="fieldr-product__summary-wrap">
          <div className="fieldr-product__inner">
            <div className="fieldr-product__summary">
              <div className="fieldr-product__summary-item">
                <div className="fieldr-product__summary-label">Queue</div>
                <div className="fieldr-product__summary-title">The office sees what needs review first.</div>
                <div className="fieldr-product__summary-copy">
                  New scope, stalled follow-ups, and unanswered customer pressure show up in one place instead of getting
                  lost in messages.
                </div>
              </div>
              <div className="fieldr-product__summary-item">
                <div className="fieldr-product__summary-label">Quotes</div>
                <div className="fieldr-product__summary-title">Changes are prepared before they go unbilled.</div>
                <div className="fieldr-product__summary-copy">
                  When the job changes, the draft number and next action are already lined up so the window does not
                  close first.
                </div>
              </div>
              <div className="fieldr-product__summary-item">
                <div className="fieldr-product__summary-label">Job history</div>
                <div className="fieldr-product__summary-title">Every approval leaves a clean trail behind.</div>
                <div className="fieldr-product__summary-copy">
                  Follow-through, pricing decisions, and job context stay with the work so the owner is not managing it
                  from memory.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="fieldr-product__cta">
          <div className="fieldr-product__inner">
            <h2 className="fieldr-product__cta-title">Ready to stop chasing missed details?</h2>
            <SmartLink to={BOOK_DEMO_HREF} className="fieldr-product__cta-button">
              Book a Demo
            </SmartLink>
            <div className="fieldr-product__cta-note">20 minutes · No commitment · Chattanooga, TN</div>
          </div>
        </section>
      </main>
    </>
  )
}
