import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

const problemCards = [
  {
    number: '01',
    title: 'Field updates vanish',
    body: 'A sub calls about a scope change. An owner texts a revision. It gets buried. By the time you surface it, the margin is gone and the job has moved on.',
  },
  {
    number: '02',
    title: 'Changes never reach the quote',
    body: "You know what changed on site. Getting that into a revised number before the window closes - that's the part that kills margin job after job.",
  },
  {
    number: '03',
    title: 'Follow-through lives in your head',
    body: 'Quotes go silent. Commitments get forgotten. Jobs close without the paperwork that protects you. The system is your memory until it fails.',
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
    detail: 'Scope delta identified - Queued for approval',
  },
  {
    timestamp: '09:16:01',
    tone: 'var(--sienna-lt)',
    title: 'Draft quote generated',
    detail: '$8,720 total - Awaiting contractor sign-off',
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
    title: 'Memory updated',
    detail: 'Flashing rate pattern written to estimating memory',
  },
]

const statusItems = [
  {
    label: 'Agent status',
    tone: 'var(--moss-lt)',
    withPulse: true,
  },
  {
    label: 'Watching 7 active jobs',
    tone: 'var(--body)',
  },
  {
    label: '3 items in queue',
    tone: 'var(--ochre-lt)',
  },
  {
    label: 'Last capture: 2m ago',
    tone: 'var(--dim)',
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
          height: 480px;
          background: radial-gradient(circle at top center, rgba(184,83,46,0.06), transparent 72%);
          pointer-events: none;
        }

        .fieldr-home__hero-inner {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 720px;
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
          max-width: 480px;
          font-size: 16px;
          line-height: 1.7;
          font-weight: 300;
          color: var(--dim);
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
        }

        .fieldr-home__secondary-cta {
          color: var(--bright);
          font-family: var(--sans);
          font-size: 14px;
          font-weight: 400;
          line-height: 1;
          text-decoration: none;
        }

        .fieldr-home__meta {
          margin-top: 20px;
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--muted);
        }

        .fieldr-home__statusbar {
          display: flex;
          align-items: stretch;
          min-height: 48px;
          overflow-x: auto;
          border-top: 1px solid var(--rule);
          border-bottom: 1px solid var(--rule);
          background: var(--surface);
        }

        .fieldr-home__statusitem {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          min-width: 190px;
          padding: 0 18px;
          white-space: nowrap;
          font-family: var(--mono);
          font-size: 8px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          border-right: 1px solid var(--rule);
          flex: 1 0 auto;
        }

        .fieldr-home__pulse {
          width: 4px;
          height: 4px;
          border-radius: 999px;
          background: var(--moss-lt);
          animation: fieldrPulse 1.8s ease-in-out infinite;
          box-shadow: 0 0 0 4px var(--moss-bg);
          flex: 0 0 auto;
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
          background: var(--rule);
        }

        .fieldr-home__problem-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 20px;
        }

        .fieldr-home__problem-card {
          border: 1px solid var(--rule);
          border-radius: 6px;
          background: var(--surface);
          padding: 32px 28px;
        }

        .fieldr-home__problem-number {
          font-family: var(--serif);
          font-size: 48px;
          font-style: italic;
          line-height: 1;
          color: var(--sienna-lt);
          opacity: 0.25;
        }

        .fieldr-home__problem-title {
          margin-top: 16px;
          font-size: 15px;
          font-weight: 500;
          color: var(--bright);
        }

        .fieldr-home__problem-body {
          margin-top: 8px;
          font-size: 13px;
          line-height: 1.7;
          font-weight: 300;
          color: var(--dim);
        }

        .fieldr-home__log-section {
          background: var(--surface);
          border-top: 1px solid var(--rule);
        }

        .fieldr-home__log-grid {
          display: grid;
          grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr);
          gap: 48px;
          align-items: start;
        }

        .fieldr-home__log-headline {
          margin: 14px 0 0;
          font-family: var(--serif);
          font-size: 36px;
          line-height: 1.2;
          font-style: italic;
          color: var(--bright);
        }

        .fieldr-home__log-feed {
          border-top: 1px solid var(--rule);
        }

        .fieldr-home__log-entry {
          display: grid;
          grid-template-columns: 86px 8px minmax(0, 1fr);
          gap: 16px;
          align-items: start;
          padding: 16px 0;
          border-bottom: 1px solid var(--rule);
          transform: translateY(12px);
          opacity: 0;
          transition: transform 480ms cubic-bezier(0.22, 1, 0.36, 1), opacity 480ms ease;
        }

        .fieldr-home__log-entry.is-visible {
          transform: translateY(0);
          opacity: 1;
        }

        .fieldr-home__log-time {
          padding-top: 1px;
          font-family: var(--mono);
          font-size: 9px;
          color: var(--muted);
        }

        .fieldr-home__log-pip {
          width: 4px;
          height: 4px;
          margin-top: 6px;
          border-radius: 999px;
        }

        .fieldr-home__log-title {
          font-size: 13px;
          font-weight: 500;
          color: var(--bright);
        }

        .fieldr-home__log-detail {
          margin-top: 4px;
          font-size: 12px;
          line-height: 1.65;
          font-weight: 300;
          color: var(--dim);
        }

        @keyframes fieldrPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.1); }
        }

        @media (max-width: 960px) {
          .fieldr-home__problem-grid,
          .fieldr-home__log-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .fieldr-home__section {
            padding: 72px 20px;
          }

          .fieldr-home__hero {
            padding: 72px 20px 56px;
          }

          .fieldr-home__cta-row {
            flex-direction: column;
            gap: 14px;
          }

          .fieldr-home__problem-card {
            padding: 28px 22px;
          }

          .fieldr-home__log-entry {
            grid-template-columns: 72px 8px minmax(0, 1fr);
            gap: 12px;
          }
        }
      `}</style>

      <main className="fieldr-home">
        <section className="fieldr-home__hero">
          <div className="fieldr-home__hero-inner">
            <p className="fieldr-home__eyebrow">Agentic operations � Field contractors</p>
            <h1 className="fieldr-home__headline">The field never stops. Neither does Fieldr.</h1>
            <p className="fieldr-home__subhead">
              Fieldr is an AI agent that watches your inbound - calls, texts, voice notes, documents - extracts what matters, and surfaces it before it costs you. No setup. No workflow change. Just coverage.
            </p>
            <div className="fieldr-home__cta-row">
              <button type="button" className="fieldr-home__primary-cta">
                Book a Demo
              </button>
              <Link to="/how-it-works" className="fieldr-home__secondary-cta">
                See how it works
              </Link>
            </div>
            <div className="fieldr-home__meta">Early access � Chattanooga, TN � Built for field contractors</div>
          </div>
        </section>

        <section className="fieldr-home__statusbar" aria-label="Agent status">
          {statusItems.map((item) => (
            <div key={item.label} className="fieldr-home__statusitem" style={{ color: item.tone }}>
              {item.withPulse ? <span className="fieldr-home__pulse" aria-hidden="true" /> : null}
              <span>{item.label}</span>
            </div>
          ))}
        </section>

        <section className="fieldr-home__section">
          <div className="fieldr-home__section-inner">
            <div className="fieldr-home__section-labelrow">
              <span className="fieldr-home__section-label">The operational gap</span>
              <div className="fieldr-home__section-rule" aria-hidden="true" />
            </div>

            <div className="fieldr-home__problem-grid">
              {problemCards.map((card) => (
                <article key={card.number} className="fieldr-home__problem-card">
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
                <span className="fieldr-home__section-label">System log � Live capture</span>
                <div className="fieldr-home__section-rule" aria-hidden="true" />
              </div>
              <h2 className="fieldr-home__log-headline">What Fieldr caught while you were on site.</h2>
            </div>

            <div className="fieldr-home__log-feed">
              {agentLogEntries.map((entry, index) => (
                <div
                  key={`${entry.timestamp}-${entry.title}`}
                  className={`fieldr-home__log-entry${logVisible ? ' is-visible' : ''}`}
                  style={{ transitionDelay: `${index * 150}ms` }}
                >
                  <div className="fieldr-home__log-time">{entry.timestamp}</div>
                  <div className="fieldr-home__log-pip" style={{ background: entry.tone }} aria-hidden="true" />
                  <div>
                    <div className="fieldr-home__log-title">{entry.title}</div>
                    <div className="fieldr-home__log-detail">{entry.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </>
  )
}
