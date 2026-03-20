import { useEffect, useRef, useState } from 'react'
import { BOOK_DEMO_HREF, APP_FLOW_HREF } from '../components/siteLinks'
import { SmartLink } from '../components/SmartLink'

const problemCards = [
  {
    number: '01',
    title: 'Field updates get buried',
    body: 'A sub calls in a change. An owner texts a revision. By the time the office surfaces it, the job has moved on and the margin is already gone.',
  },
  {
    number: '02',
    title: 'The extra work never gets billed',
    body: 'You know what changed on site. Getting that into a revised number before the window closes is where revenue disappears job after job.',
    featured: true,
  },
  {
    number: '03',
    title: 'What was promised gets forgotten',
    body: 'Quotes go quiet. Paperwork gets missed. Follow-through lives in memory until the wrong detail costs you money or credibility.',
  },
]

const agentLogEntries = [
  {
    timestamp: '09:14:32',
    tone: 'var(--moss-lt)',
    title: 'Voice note captured',
    detail: 'Johnson site - flashing swap, +$320, flagged for review',
  },
  {
    timestamp: '09:14:33',
    tone: 'var(--ochre-lt)',
    title: 'Change extracted',
    detail: 'Scope delta identified - Quote revision required before closeout',
  },
  {
    timestamp: '09:16:01',
    tone: 'var(--sienna-lt)',
    title: 'Draft quote generated',
    detail: '$8,720 total - Awaiting contractor sign-off before it goes to customer',
    featured: true,
  },
  {
    timestamp: '09:18:44',
    tone: 'var(--ochre-lt)',
    title: 'Follow-up scheduled',
    detail: 'Riverside Commercial - No response in 72h',
  },
  {
    timestamp: '09:19:12',
    tone: 'var(--moss-lt)',
    title: 'Pricing updated',
    detail: 'Flashing rate saved so the next quote starts faster',
  },
]

const heroSignals = ['7 active jobs', '3 things need review', 'Last update 2m ago']

const exampleRows = [
  {
    label: 'Inbound',
    title: 'A tech texts: "Need two extra outlets in conference room."',
    copy: 'Real field communication. Short, incomplete, and easy to ignore when the office is already moving.',
  },
  {
    label: 'Usually',
    title: 'It stays in messages and the quote never gets revised.',
    copy: 'The extra work gets done. Nobody updates the number. The revenue slips because the office catches it too late or not at all.',
  },
  {
    label: 'Fieldr',
    title: 'The change gets caught. The new line item is prepared. It is ready for approval.',
    copy: 'The change stays tied to the job and shows up for review before the billing window closes.',
  },
]

export default function Home() {
  const logRef = useRef(null)
  const [logVisible, setLogVisible] = useState(false)

  useEffect(() => {
    const node = logRef.current
    if (!node) {
      return undefined
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setLogVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.22 },
    )

    observer.observe(node)

    return () => observer.disconnect()
  }, [])

  return (
    <>
      <style>{`
        .fieldr-home {
          padding-top: 56px;
        }

        .fieldr-home__hero {
          position: relative;
          min-height: calc(100vh - 56px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 88px 24px 64px;
          overflow: hidden;
        }

        .fieldr-home__hero::before {
          content: '';
          position: absolute;
          inset: -10% 0 auto;
          height: 520px;
          background: radial-gradient(circle at top center, rgba(184,83,46,0.08), transparent 72%);
          pointer-events: none;
        }

        .fieldr-home__hero-inner {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 760px;
          text-align: center;
        }

        .fieldr-home__eyebrow {
          margin: 0;
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--sienna-lt);
        }

        .fieldr-home__headline {
          margin: 20px 0 0;
          font-family: var(--serif);
          font-size: clamp(40px, 7vw, 68px);
          line-height: 1.05;
          letter-spacing: -1.5px;
          color: var(--bright);
        }

        .fieldr-home__subhead {
          margin: 24px auto 0;
          max-width: 560px;
          font-size: 17px;
          line-height: 1.74;
          font-weight: 300;
          color: var(--body);
        }

        .fieldr-home__cta-row {
          margin-top: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 18px;
          flex-wrap: wrap;
        }

        .fieldr-home__primary-cta {
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

        .fieldr-home__secondary-cta {
          color: var(--bright);
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          line-height: 1;
          text-decoration: none;
          text-transform: uppercase;
        }

        .fieldr-home__meta {
          margin-top: 22px;
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--muted);
        }

        .fieldr-home__hero-readout {
          margin-top: 20px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          flex-wrap: wrap;
          border: 1px solid var(--rule2);
          border-radius: 999px;
          background: rgba(22,20,18,0.82);
          padding: 10px 14px;
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--body);
        }

        .fieldr-home__hero-readout-dot {
          width: 4px;
          height: 4px;
          border-radius: 999px;
          background: var(--moss-lt);
          box-shadow: 0 0 0 4px var(--moss-bg);
          animation: fieldrPulse 1.8s ease-in-out infinite;
          flex: 0 0 auto;
        }

        .fieldr-home__hero-readout-sep {
          color: var(--muted);
        }

        .fieldr-home__section {
          padding: 100px 40px;
        }

        .fieldr-home__section-inner {
          max-width: 1240px;
          margin: 0 auto;
        }

        .fieldr-home__section-labelrow {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 36px;
        }

        .fieldr-home__section-label {
          font-family: var(--mono);
          font-size: 8px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--muted);
          white-space: nowrap;
        }

        .fieldr-home__section-rule {
          height: 1px;
          width: 100%;
          background: var(--rule2);
        }

        .fieldr-home__problem-grid {
          display: grid;
          grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.1fr) minmax(0, 0.95fr);
          gap: 20px;
          align-items: stretch;
        }

        .fieldr-home__problem-card {
          border: 1px solid var(--rule2);
          border-radius: 6px;
          background: var(--surface);
          padding: 32px 28px;
        }

        .fieldr-home__problem-card.is-featured {
          background: linear-gradient(180deg, rgba(184,83,46,0.09) 0%, rgba(22,20,18,1) 100%);
          border-color: var(--sienna-bd);
          box-shadow: 0 18px 40px rgba(0,0,0,0.22);
          transform: translateY(-10px);
        }

        .fieldr-home__problem-number {
          font-family: var(--serif);
          font-size: 48px;
          font-style: italic;
          line-height: 1;
          color: var(--sienna-lt);
          opacity: 0.28;
        }

        .fieldr-home__problem-title {
          margin-top: 16px;
          font-size: 15px;
          font-weight: 500;
          color: var(--bright);
        }

        .fieldr-home__problem-card.is-featured .fieldr-home__problem-title {
          color: var(--bright);
        }

        .fieldr-home__problem-body {
          margin-top: 8px;
          font-size: 13px;
          line-height: 1.72;
          font-weight: 300;
          color: var(--body);
        }

        .fieldr-home__log-section {
          background: var(--surface);
          border-top: 1px solid var(--rule2);
          border-bottom: 1px solid var(--rule);
        }

        .fieldr-home__log-grid {
          display: grid;
          grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
          gap: 48px;
          align-items: start;
        }

        .fieldr-home__log-headline {
          margin: 14px 0 0;
          font-family: var(--serif);
          font-size: 38px;
          line-height: 1.2;
          font-style: italic;
          color: var(--bright);
        }

        .fieldr-home__log-copy {
          margin-top: 16px;
          max-width: 420px;
          font-size: 14px;
          line-height: 1.75;
          color: var(--body);
        }

        .fieldr-home__log-feed {
          border-top: 1px solid var(--rule2);
        }

        .fieldr-home__log-entry {
          display: grid;
          grid-template-columns: 96px 10px minmax(0, 1fr);
          gap: 18px;
          align-items: start;
          padding: 18px 0;
          border-bottom: 1px solid var(--rule2);
          transform: translateY(12px);
          opacity: 0;
          transition: transform 480ms cubic-bezier(0.22, 1, 0.36, 1), opacity 480ms ease;
        }

        .fieldr-home__log-entry.is-visible {
          transform: translateY(0);
          opacity: 1;
        }

        .fieldr-home__log-entry.is-featured {
          margin: 8px 0;
          padding: 18px 14px;
          border: 1px solid var(--sienna-bd);
          border-left: 2px solid var(--sienna);
          border-radius: 6px;
          background: rgba(184,83,46,0.08);
        }

        .fieldr-home__log-time {
          padding-top: 2px;
          font-family: var(--mono);
          font-size: 9px;
          color: var(--body);
          text-align: right;
        }

        .fieldr-home__log-pip {
          width: 4px;
          height: 4px;
          margin-top: 7px;
          border-radius: 999px;
        }

        .fieldr-home__log-pip.is-live {
          animation: fieldrPulse 1.8s ease-in-out infinite;
          box-shadow: 0 0 0 5px rgba(184,83,46,0.08);
        }

        .fieldr-home__log-title {
          font-size: 13px;
          font-weight: 500;
          color: var(--bright);
        }

        .fieldr-home__log-detail {
          margin-top: 4px;
          font-size: 12px;
          line-height: 1.68;
          font-weight: 300;
          color: var(--body);
        }

        .fieldr-home__example-grid {
          display: grid;
          grid-template-columns: minmax(0, 0.88fr) minmax(0, 1.12fr);
          gap: 48px;
          align-items: start;
        }

        .fieldr-home__example-headline {
          margin: 14px 0 0;
          font-family: var(--serif);
          font-size: 38px;
          line-height: 1.18;
          font-style: italic;
          color: var(--bright);
        }

        .fieldr-home__example-body {
          margin-top: 18px;
          max-width: 440px;
          font-size: 15px;
          line-height: 1.74;
          font-weight: 300;
          color: var(--body);
        }

        .fieldr-home__example-panel {
          border: 1px solid var(--rule2);
          border-radius: 6px;
          background: var(--surface);
          overflow: hidden;
        }

        .fieldr-home__example-row {
          display: grid;
          grid-template-columns: 104px minmax(0, 1fr);
          gap: 18px;
          padding: 18px 20px;
          border-top: 1px solid var(--rule2);
        }

        .fieldr-home__example-row:first-child {
          border-top: 0;
        }

        .fieldr-home__example-row.is-fieldr {
          background: rgba(184,83,46,0.07);
        }

        .fieldr-home__example-kicker {
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--sienna-lt);
        }

        .fieldr-home__example-title {
          font-size: 14px;
          font-weight: 500;
          color: var(--bright);
        }

        .fieldr-home__example-copy {
          margin-top: 6px;
          font-size: 12px;
          line-height: 1.7;
          font-weight: 300;
          color: var(--body);
        }

        .fieldr-home__example-foot {
          margin-top: 16px;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .fieldr-home__example-chip {
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

        .fieldr-home__final-cta {
          padding: 80px 40px 96px;
          border-top: 1px solid var(--rule);
          text-align: center;
        }

        .fieldr-home__final-title {
          margin: 0;
          font-family: var(--serif);
          font-size: clamp(34px, 5vw, 42px);
          line-height: 1.16;
          font-style: italic;
          color: var(--bright);
        }

        .fieldr-home__final-copy {
          margin: 16px auto 0;
          max-width: 460px;
          font-size: 14px;
          line-height: 1.72;
          color: var(--body);
        }

        .fieldr-home__final-button {
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
          text-decoration: none;
        }

        .fieldr-home__final-note {
          margin-top: 18px;
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--muted);
        }

        @keyframes fieldrPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(1.12); }
        }

        @media (max-width: 960px) {
          .fieldr-home__problem-grid,
          .fieldr-home__log-grid,
          .fieldr-home__example-grid {
            grid-template-columns: 1fr;
          }

          .fieldr-home__problem-card.is-featured {
            transform: none;
          }
        }

        @media (max-width: 640px) {
          .fieldr-home__section {
            padding: 72px 20px;
          }

          .fieldr-home__hero {
            padding: 72px 20px 56px;
            min-height: auto;
          }

          .fieldr-home__cta-row {
            flex-direction: column;
            gap: 14px;
          }

          .fieldr-home__primary-cta,
          .fieldr-home__secondary-cta {
            width: min(100%, 280px);
            justify-content: center;
            text-align: center;
          }

          .fieldr-home__subhead {
            font-size: 15px;
          }

          .fieldr-home__meta {
            line-height: 1.8;
          }

          .fieldr-home__hero-readout {
            padding: 10px 12px;
          }

          .fieldr-home__section-labelrow {
            flex-wrap: wrap;
            gap: 10px;
          }

          .fieldr-home__problem-card {
            padding: 26px 22px;
          }

          .fieldr-home__log-entry {
            grid-template-columns: 72px 8px minmax(0, 1fr);
            gap: 12px;
          }

          .fieldr-home__log-entry.is-featured {
            padding: 16px 12px;
          }

          .fieldr-home__log-time {
            text-align: left;
          }

          .fieldr-home__example-row {
            grid-template-columns: 1fr;
            gap: 10px;
            padding: 18px 16px;
          }

          .fieldr-home__final-cta {
            padding: 72px 20px 88px;
          }

          .fieldr-home__final-button {
            width: min(100%, 280px);
          }
        }
      `}</style>

      <main className="fieldr-home">
        <section className="fieldr-home__hero">
          <div className="fieldr-home__hero-inner">
            <p className="fieldr-home__eyebrow">Built for general contractors</p>
            <h1 className="fieldr-home__headline">The field never stops. Neither does Fieldr.</h1>
            <p className="fieldr-home__subhead">
              Fieldr catches calls, texts, voice notes, and uploads from the field, spots what changed, and gets a draft ready before money slips through. No new app for your crew. No extra workflow. Just fewer things falling through the cracks.
            </p>
            <div className="fieldr-home__cta-row">
              <SmartLink to={BOOK_DEMO_HREF} className="fieldr-home__primary-cta">
                Book a Demo
              </SmartLink>
              <SmartLink to={APP_FLOW_HREF} className="fieldr-home__secondary-cta">Agent</SmartLink>
            </div>
            <div className="fieldr-home__hero-readout" aria-label="Live agent readout">
              <span className="fieldr-home__hero-readout-dot" aria-hidden="true" />
              {heroSignals.map((signal, index) => (
                <span key={signal}>
                  {index > 0 ? <span className="fieldr-home__hero-readout-sep" aria-hidden="true">&middot;</span> : null}
                  {' '}
                  {signal}
                </span>
              ))}
            </div>
            <div className="fieldr-home__meta">Early access &middot; Chattanooga, TN &middot; Built for field contractors</div>
          </div>
        </section>

        <section className="fieldr-home__section">
          <div className="fieldr-home__section-inner">
            <div className="fieldr-home__section-labelrow">
              <span className="fieldr-home__section-label">Where margin leaks</span>
              <div className="fieldr-home__section-rule" aria-hidden="true" />
            </div>

            <div className="fieldr-home__problem-grid">
              {problemCards.map((card) => (
                <article key={card.number} className={`fieldr-home__problem-card${card.featured ? ' is-featured' : ''}`}>
                  <div className="fieldr-home__problem-number">{card.number}</div>
                  <div className="fieldr-home__problem-title">{card.title}</div>
                  <div className="fieldr-home__problem-body">{card.body}</div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section ref={logRef} className="fieldr-home__section fieldr-home__log-section">
          <div className="fieldr-home__section-inner fieldr-home__log-grid">
            <div>
              <div className="fieldr-home__section-labelrow" style={{ marginBottom: '22px' }}>
              <span className="fieldr-home__section-label">What Fieldr caught today</span>
              <div className="fieldr-home__section-rule" aria-hidden="true" />
            </div>
            <h2 className="fieldr-home__log-headline">What Fieldr caught while you were on site.</h2>
            <p className="fieldr-home__log-copy">
                While you are on site, Fieldr catches the update, pulls out what changed, and puts the next step in front of the office before the trail goes cold.
            </p>
            </div>

            <div className="fieldr-home__log-feed">
              {agentLogEntries.map((entry, index) => (
                <div
                  key={`${entry.timestamp}-${entry.title}`}
                  className={`fieldr-home__log-entry${logVisible ? ' is-visible' : ''}${entry.featured ? ' is-featured' : ''}`}
                  style={{ transitionDelay: `${index * 150}ms` }}
                >
                  <div className="fieldr-home__log-time">{entry.timestamp}</div>
                  <div className={`fieldr-home__log-pip${entry.featured ? ' is-live' : ''}`} style={{ background: entry.tone }} aria-hidden="true" />
                  <div>
                    <div className="fieldr-home__log-title">{entry.title}</div>
                    <div className="fieldr-home__log-detail">{entry.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="fieldr-home__section">
          <div className="fieldr-home__section-inner fieldr-home__example-grid">
            <div>
              <div className="fieldr-home__section-labelrow" style={{ marginBottom: '22px' }}>
                <span className="fieldr-home__section-label">One missed text</span>
                <div className="fieldr-home__section-rule" aria-hidden="true" />
              </div>
              <h2 className="fieldr-home__example-headline">The extra work gets done. The billing never catches up.</h2>
              <p className="fieldr-home__example-body">
                A contractor does not lose margin because they cannot estimate. They lose it because the field changes faster than the office can catch up. Fieldr closes that gap before the revised work disappears into texts, calls, and memory.
              </p>
              <div className="fieldr-home__example-foot">
                <span className="fieldr-home__example-chip">Draft quote</span>
                <span className="fieldr-home__example-chip">Needs approval</span>
                <span className="fieldr-home__example-chip">Saved to job file</span>
              </div>
            </div>

            <div className="fieldr-home__example-panel">
              {exampleRows.map((row) => (
                <div key={row.label} className={`fieldr-home__example-row${row.label === 'Fieldr' ? ' is-fieldr' : ''}`}>
                  <div className="fieldr-home__example-kicker">{row.label}</div>
                  <div>
                    <div className="fieldr-home__example-title">{row.title}</div>
                    <div className="fieldr-home__example-copy">{row.copy}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="fieldr-home__final-cta">
          <div className="fieldr-home__section-inner">
            <h2 className="fieldr-home__final-title">Ready to stop letting changes disappear?</h2>
            <p className="fieldr-home__final-copy">
              Fieldr catches the field updates that usually slip through the office and turns them into reviewable work before they cost you money.
            </p>
            <SmartLink to={BOOK_DEMO_HREF} className="fieldr-home__final-button">
              Book a Demo
            </SmartLink>
            <div className="fieldr-home__final-note">20 minutes &middot; No commitment &middot; Chattanooga, TN</div>
          </div>
        </section>
      </main>
    </>
  )
}
