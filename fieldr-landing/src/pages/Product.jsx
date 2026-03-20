import { useLayoutEffect, useRef } from 'react'
import { gsap } from 'gsap'
import agentPreview from '../assets/agent-preview.svg'
import { BOOK_DEMO_HREF } from '../components/siteLinks'
import { SmartLink } from '../components/SmartLink'

const ownerRows = [
  {
    label: 'Field updates land here',
    copy: 'Calls, texts, and uploads stop living in inboxes and start showing up where the office can actually act on them.',
  },
  {
    label: 'The next step is prepared',
    copy: 'When the work changes, the quote draft and follow-up are already lined up before the billing window closes.',
  },
  {
    label: 'Everything stays with the job',
    copy: 'Approvals, notes, and pricing memory stay tied to the work so the owner is not relying on memory to close it out.',
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
        .from('[data-product-reveal="headline"]', { y: 26, opacity: 0, duration: 0.7 }, '-=0.16')
        .from('[data-product-reveal="subhead"]', { y: 18, opacity: 0, duration: 0.5 }, '-=0.42')
        .from('[data-product-reveal="proof"]', { y: 14, opacity: 0, duration: 0.4 }, '-=0.28')
        .from('[data-product-reveal="cta"]', { y: 14, opacity: 0, duration: 0.4 }, '-=0.26')
        .from('.fieldr-product__hero-card', { y: 24, opacity: 0, duration: 0.56 }, '-=0.44')
        .from('.fieldr-product__hero-card-row', { y: 10, opacity: 0, duration: 0.34, stagger: 0.06 }, '-=0.28')
        .from('.fieldr-product__frame', { y: 34, opacity: 0, scale: 0.988, duration: 0.7 }, '-=0.26')
        .from('.fieldr-product__frame-meta', { y: 12, opacity: 0, duration: 0.36 }, '-=0.34')
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
          padding: 104px 40px 112px;
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
          gap: 48px;
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
          max-width: 520px;
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
          max-width: 320px;
          font-size: 18px;
          line-height: 1.35;
          color: var(--bright);
        }

        .fieldr-product__hero-card-copy {
          margin-top: 10px;
          font-size: 13px;
          line-height: 1.7;
          color: var(--body);
        }

        .fieldr-product__hero-card-row {
          display: grid;
          grid-template-columns: 138px minmax(0, 1fr);
          gap: 18px;
          padding: 16px 20px;
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
          line-height: 1.7;
          color: var(--body);
        }

        .fieldr-product__frame-wrap {
          max-width: 1180px;
          margin: 0 auto;
          margin-top: -58px;
          padding: 0 40px 92px;
        }

        .fieldr-product__frame {
          overflow: hidden;
          border: 1px solid var(--rule2);
          border-radius: 16px;
          background: var(--surface);
          box-shadow: 0 40px 100px rgba(0,0,0,0.56);
        }

        .fieldr-product__windowbar {
          display: grid;
          grid-template-columns: 88px 1fr 88px;
          align-items: center;
          height: 36px;
          padding: 0 14px;
          background: var(--surface);
          border-bottom: 1px solid var(--rule);
        }

        .fieldr-product__dots {
          display: flex;
          gap: 7px;
          align-items: center;
        }

        .fieldr-product__dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
        }

        .fieldr-product__urlbar {
          justify-self: center;
          min-width: 220px;
          max-width: 320px;
          width: 100%;
          border: 1px solid var(--rule2);
          border-radius: 999px;
          padding: 7px 14px;
          background: var(--surface2);
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.08em;
          text-align: center;
          color: var(--muted);
        }

        .fieldr-product__frame-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 18px 22px 16px;
          border-bottom: 1px solid var(--rule);
          background: linear-gradient(180deg, rgba(28,26,23,0.65) 0%, rgba(22,20,18,0.94) 100%);
        }

        .fieldr-product__frame-kicker {
          font-family: var(--mono);
          font-size: 8px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--sienna-lt);
        }

        .fieldr-product__frame-title {
          margin-top: 8px;
          font-size: 15px;
          color: var(--bright);
        }

        .fieldr-product__frame-copy {
          margin-top: 6px;
          font-size: 13px;
          line-height: 1.65;
          color: var(--body);
        }

        .fieldr-product__drag-note {
          display: none;
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--muted);
          white-space: nowrap;
        }

        .fieldr-product__screen {
          overflow: hidden;
          background: #0E0D0C;
        }

        .fieldr-product__screen-scroll {
          overflow-x: hidden;
        }

        .fieldr-product__screen-image {
          display: block;
          width: 100%;
          height: auto;
          background: #0E0D0C;
        }

        .fieldr-product__caption {
          padding: 14px 22px 18px;
          border-top: 1px solid var(--rule);
          font-size: 12px;
          line-height: 1.7;
          color: var(--dim);
          background: rgba(17,15,13,0.96);
        }

        .fieldr-product__caption strong {
          color: var(--bright);
          font-weight: 500;
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
          .fieldr-product__header-grid {
            grid-template-columns: 1fr;
          }

          .fieldr-product__hero-card {
            max-width: 640px;
          }
        }

        @media (max-width: 860px) {
          .fieldr-product__header,
          .fieldr-product__frame-wrap,
          .fieldr-product__cta {
            padding-left: 20px;
            padding-right: 20px;
          }

          .fieldr-product__header {
            padding-top: 96px;
            padding-bottom: 84px;
          }

          .fieldr-product__hero-card-row {
            grid-template-columns: 1fr;
            gap: 10px;
          }

          .fieldr-product__demo,
          .fieldr-product__cta-button {
            width: min(100%, 280px);
          }

          .fieldr-product__frame-wrap {
            margin-top: -34px;
            padding-bottom: 80px;
          }

          .fieldr-product__frame-meta {
            align-items: flex-start;
            flex-direction: column;
          }

          .fieldr-product__drag-note {
            display: block;
          }

          .fieldr-product__screen-scroll {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }

          .fieldr-product__screen-image {
            width: 1120px;
            max-width: none;
          }

          .fieldr-product__caption {
            padding-top: 12px;
          }
        }
      `}</style>

      <main ref={rootRef} className="fieldr-product" aria-label="Fieldr product page">
        <section className="fieldr-product__header">
          <div className="fieldr-product__inner fieldr-product__header-grid">
            <div>
              <p className="fieldr-product__eyebrow" data-product-reveal="eyebrow">
                Actual product
              </p>
              <h1 className="fieldr-product__headline" data-product-reveal="headline">
                This is what the office sees when something changes.
              </h1>
              <p className="fieldr-product__subhead" data-product-reveal="subhead">
                Calls, texts, uploads, and follow-ups land in one place. The agent catches what changed, prepares the
                next step, and leaves it ready for review before money slips through.
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
                  No one has to chase the thread to figure out what happened.
                </div>
                <div className="fieldr-product__hero-card-copy">
                  The agent keeps the office on the current version of the job. It catches the update, prepares the
                  next move, and leaves a record behind.
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

        <section className="fieldr-product__frame-wrap">
          <div className="fieldr-product__frame">
            <div className="fieldr-product__windowbar">
              <div className="fieldr-product__dots" aria-hidden="true">
                <span className="fieldr-product__dot" style={{ background: 'rgb(255,95,87)' }} />
                <span className="fieldr-product__dot" style={{ background: 'rgb(254,188,46)' }} />
                <span className="fieldr-product__dot" style={{ background: 'rgb(40,200,64)' }} />
              </div>
              <div className="fieldr-product__urlbar">app.fieldr.io</div>
              <div />
            </div>

            <div className="fieldr-product__frame-meta">
              <div>
                <div className="fieldr-product__frame-kicker">Actual workspace shown</div>
                <div className="fieldr-product__frame-title">Today view with queue pressure, quote activity, and live agent work.</div>
                <div className="fieldr-product__frame-copy">
                  This is the office surface. The field sends the update. The agent catches it, puts it in front of the GC,
                  and keeps the job record moving.
                </div>
              </div>
              <div className="fieldr-product__drag-note">Drag to inspect on phone</div>
            </div>

            <div className="fieldr-product__screen">
              <div className="fieldr-product__screen-scroll">
                <img
                  className="fieldr-product__screen-image"
                  src={agentPreview}
                  alt="Fieldr agent workspace showing the Today view with queue items, metrics, agent feed, recent jobs, and activity log."
                />
              </div>
            </div>

            <div className="fieldr-product__caption">
              <strong>Why this matters:</strong> the office does not need another inbox. It needs one place that shows what changed,
              what is waiting, and what needs approval before the job moves on.
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
