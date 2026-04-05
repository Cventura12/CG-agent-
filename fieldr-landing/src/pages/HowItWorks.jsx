import { useLayoutEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { AnimatedWords } from '../components/AnimatedWords'
import { BOOK_DEMO_HREF } from '../components/siteLinks'
import { SmartLink } from '../components/SmartLink'

gsap.registerPlugin(ScrollTrigger)

const steps = [
  {
    number: 'STEP 01',
    title: 'Capture',
    body: 'A call, voice note, text, or document comes in. Arbor picks it up automatically. Nothing to forward. Nothing to retype.',
  },
  {
    number: 'STEP 02',
    title: 'Understand',
    body: 'Arbor reads the update and isolates what matters: scope changes, promised work, missing details, and anything that affects price or follow-through.',
  },
  {
    number: 'STEP 03',
    title: 'Review',
    body: 'The item shows up with the job, what changed, why it matters, and what should happen next. You can approve it, edit it, or ignore it.',
  },
  {
    number: 'STEP 04',
    title: 'Write back',
    body: 'Approved items become draft quotes, follow-ups, or saved job notes. The decision stays attached to the job, so the next move starts from the current truth.',
  },
]

const queueStack = [
  {
    title: 'Hartley reroof',
    detail: 'Decking add · +$800 scope',
    status: 'Needs review',
  },
  {
    title: 'Ridgeview addition',
    detail: 'Owner text · Window upgrade queued',
    status: 'Captured',
  },
  {
    title: 'Riverside Commercial',
    detail: 'Follow-up due · 72h since last response',
    status: 'Follow-up',
  },
]

export default function HowItWorks() {
  const rootRef = useRef(null)

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const intro = gsap.timeline({ defaults: { ease: 'power2.out' } })

      intro
        .from('[data-how-reveal="eyebrow"]', { y: 16, opacity: 0, duration: 0.34 })
        .from('.fieldr-how__headline .fieldr-word__inner', {
          yPercent: 110,
          opacity: 0,
          filter: 'blur(10px)',
          duration: 0.68,
          stagger: 0.04,
        }, '-=0.08')
        .from('[data-how-reveal="subhead"]', { y: 18, opacity: 0, duration: 0.42 }, '-=0.34')

      gsap.from('[data-how-step]', {
        scrollTrigger: {
          trigger: '.fieldr-how__workflow-grid',
          start: 'top 82%',
          once: true,
        },
        y: 24,
        opacity: 0,
        scale: 0.986,
        duration: 0.5,
        stagger: 0.08,
        ease: 'power2.out',
      })

      gsap.from('[data-how-cta]', {
        scrollTrigger: {
          trigger: '.fieldr-how__cta',
          start: 'top 86%',
          once: true,
        },
        y: 24,
        opacity: 0,
        duration: 0.44,
        stagger: 0.08,
        ease: 'power2.out',
      })
    }, rootRef)

    return () => ctx.revert()
  }, [])

  return (
    <>
      <style>{`
        .fieldr-how {
          min-height: 100vh;
          padding-top: 56px;
        }

        .fieldr-how__page-header {
          position: relative;
          padding: 120px 40px 80px;
          border-bottom: 1px solid var(--rule);
          overflow: hidden;
        }

        .fieldr-how__page-header::before {
          content: '';
          position: absolute;
          inset: -10% auto auto -10%;
          width: 55%;
          height: 360px;
          background: radial-gradient(circle at center, rgba(184,83,46,0.12), transparent 70%);
          pointer-events: none;
        }

        .fieldr-how__inner {
          position: relative;
          z-index: 1;
          max-width: 1240px;
          margin: 0 auto;
        }

        .fieldr-how__hero-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
          gap: 56px;
          align-items: center;
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
          max-width: 820px;
          font-family: var(--serif);
          font-size: clamp(40px, 6vw, 54px);
          line-height: 1.06;
          letter-spacing: -1px;
          color: var(--bright);
          text-wrap: balance;
        }

        .fieldr-how__subhead {
          margin: 16px 0 0;
          max-width: 520px;
          font-size: 16px;
          line-height: 1.7;
          font-weight: 300;
          color: var(--body);
        }

        .fieldr-how__panel {
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(16,14,12,0.9);
          box-shadow: 0 30px 80px rgba(0,0,0,0.45);
          padding: 22px;
          backdrop-filter: blur(16px);
        }

        .fieldr-how__panel-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 12px;
          margin-bottom: 14px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }

        .fieldr-how__panel-id {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(232,224,212,0.55);
        }

        .fieldr-how__panel-signal {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(74,222,128,0.3);
          background: rgba(74,222,128,0.08);
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(74,222,128,0.8);
        }

        .fieldr-how__panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 14px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          margin-bottom: 16px;
        }

        .fieldr-how__panel-title {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(232,224,212,0.55);
        }

        .fieldr-how__panel-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid rgba(193,82,42,0.3);
          background: rgba(193,82,42,0.12);
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(193,82,42,0.85);
        }

        .fieldr-how__panel-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #4ade80;
          box-shadow: 0 0 0 5px rgba(74,222,128,0.16);
          animation: fieldrPulse 2s ease-in-out infinite;
        }

        .fieldr-how__panel-metrics {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 16px;
        }

        .fieldr-how__panel-metric {
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.04);
        }

        .fieldr-how__panel-metric-value {
          font-family: var(--serif);
          font-size: 18px;
          color: var(--bright);
        }

        .fieldr-how__panel-metric-label {
          margin-top: 4px;
          font-family: var(--mono);
          font-size: 8px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(232,224,212,0.45);
        }

        .fieldr-how__panel-rows {
          display: grid;
          gap: 12px;
        }

        .fieldr-how__panel-row {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 12px;
          align-items: center;
          padding: 12px 14px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.04);
        }

        .fieldr-how__panel-step {
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(232,224,212,0.45);
        }

        .fieldr-how__panel-copy {
          font-size: 12px;
          color: rgba(232,224,212,0.7);
        }

        .fieldr-how__panel-status {
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(232,224,212,0.4);
        }

        .fieldr-how__workflow {
          padding: 0 40px 96px;
        }

        .fieldr-how__workflow-grid {
          max-width: 1240px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
          gap: 48px;
          align-items: start;
        }

        .fieldr-how__timeline {
          position: relative;
          padding-left: 32px;
          display: grid;
          gap: 22px;
        }

        .fieldr-how__timeline::before {
          content: '';
          position: absolute;
          top: 0;
          bottom: 0;
          left: 10px;
          width: 2px;
          background: linear-gradient(180deg, rgba(193,82,42,0.7), rgba(255,255,255,0.08));
        }

        .fieldr-how__step {
          position: relative;
          padding: 22px 24px 22px 28px;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px;
          background: rgba(16,14,12,0.86);
          box-shadow: 0 20px 50px rgba(0,0,0,0.25);
        }

        .fieldr-how__step::before {
          content: '';
          position: absolute;
          left: -32px;
          top: 28px;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: rgba(193,82,42,1);
          box-shadow: 0 0 0 8px rgba(193,82,42,0.2);
        }

        .fieldr-how__step-number {
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(232,224,212,0.75);
        }

        .fieldr-how__step-title {
          margin-top: 10px;
          font-family: var(--serif);
          font-size: 22px;
          font-weight: 500;
          line-height: 1.2;
          color: var(--bright);
        }

        .fieldr-how__step-body {
          margin-top: 8px;
          font-size: 13px;
          line-height: 1.7;
          font-weight: 300;
          color: var(--body);
        }

        .fieldr-how__queue-card {
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(12,10,9,0.9);
          box-shadow: 0 28px 80px rgba(0,0,0,0.45);
          padding: 22px;
        }

        .fieldr-how__queue-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 14px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          margin-bottom: 14px;
        }

        .fieldr-how__queue-title {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(232,224,212,0.55);
        }

        .fieldr-how__queue-count {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(193,82,42,0.85);
        }

        .fieldr-how__queue-list {
          display: grid;
          gap: 12px;
        }

        .fieldr-how__queue-item {
          display: grid;
          grid-template-columns: 10px minmax(0, 1fr) auto;
          gap: 12px;
          align-items: center;
          padding: 12px 14px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.04);
        }

        .fieldr-how__queue-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(232,224,212,0.45);
        }

        .fieldr-how__queue-dot.is-alert {
          background: rgba(193,82,42,0.9);
          box-shadow: 0 0 0 5px rgba(193,82,42,0.2);
        }

        .fieldr-how__queue-dot.is-warning {
          background: rgba(232,193,90,0.9);
          box-shadow: 0 0 0 5px rgba(232,193,90,0.18);
        }

        .fieldr-how__queue-item-title {
          font-size: 13px;
          font-weight: 500;
          color: var(--bright);
        }

        .fieldr-how__queue-item-detail {
          margin-top: 4px;
          font-size: 12px;
          color: rgba(232,224,212,0.6);
        }

        .fieldr-how__queue-status {
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(232,224,212,0.45);
        }

        .fieldr-how__cta {
          padding: 96px 40px;
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

        .fieldr-how__cta-card {
          margin: 28px auto 0;
          max-width: 720px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(16,14,13,0.92);
          padding: 24px;
          box-shadow: 0 24px 70px rgba(0,0,0,0.4);
        }

        .fieldr-how__cta-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-top: 16px;
        }

        .fieldr-how__cta-item {
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.04);
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(232,224,212,0.6);
        }

        .fieldr-how__cta-button {
          margin-top: 24px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 5px;
          padding: 13px 28px;
          background: linear-gradient(135deg, var(--sienna), var(--sienna-lt));
          color: var(--bright);
          font-family: var(--sans);
          font-size: 14px;
          font-weight: 500;
          line-height: 1;
          cursor: pointer;
          text-decoration: none;
          box-shadow: 0 16px 36px rgba(184,83,46,0.18);
          transition: transform 180ms ease, box-shadow 180ms ease;
        }

        .fieldr-how__cta-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 20px 42px rgba(184,83,46,0.24);
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
          .fieldr-how__hero-grid {
            grid-template-columns: 1fr;
          }

          .fieldr-how__workflow-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .fieldr-how__page-header,
          .fieldr-how__steps,
          .fieldr-how__cta {
            padding-left: 20px;
            padding-right: 20px;
          }

          .fieldr-how__page-header {
            padding-top: 104px;
            padding-bottom: 48px;
          }

          .fieldr-how__workflow {
            padding-bottom: 72px;
          }

          .fieldr-how__timeline {
            padding-left: 24px;
          }

          .fieldr-how__step {
            padding: 22px 18px 22px 24px;
          }

          .fieldr-how__panel-metrics,
          .fieldr-how__cta-grid {
            grid-template-columns: 1fr;
          }

          .fieldr-how__cta-button {
            width: min(100%, 280px);
            justify-content: center;
            text-align: center;
          }

          .fieldr-how__cta-note {
            max-width: 320px;
            margin-left: auto;
            margin-right: auto;
            line-height: 1.8;
          }
        }
      `}</style>

      <main ref={rootRef} className="fieldr-how" aria-label="Arbor how it works page">
        <section className="fieldr-how__page-header">
          <div className="fieldr-how__inner">
            <div className="fieldr-how__hero-grid">
              <div>
                <p className="fieldr-how__eyebrow" data-how-reveal="eyebrow">How it works</p>
                <AnimatedWords
                  as="h1"
                  className="fieldr-how__headline"
                  text="How Arbor keeps things from slipping through."
                  data-how-reveal="headline"
                />
                <p className="fieldr-how__subhead" data-how-reveal="subhead">
                  Arbor works in the background while your crew keeps working. It captures what already comes in, understands what changed, and puts the next decision in front of you before the job record drifts.
                </p>
              </div>
              <div className="fieldr-how__panel" data-how-reveal="subhead">
                <div className="fieldr-how__panel-topbar">
                  <span className="fieldr-how__panel-id">agent://arbor</span>
                  <span className="fieldr-how__panel-signal">
                    <span className="fieldr-how__panel-dot" aria-hidden="true" />
                    Live
                  </span>
                </div>
                <div className="fieldr-how__panel-header">
                  <span className="fieldr-how__panel-title">System loop</span>
                  <span className="fieldr-how__panel-pill">
                    <span className="fieldr-how__panel-dot" aria-hidden="true" />
                    Live
                  </span>
                </div>
                <div className="fieldr-how__panel-metrics">
                  <div className="fieldr-how__panel-metric">
                    <div className="fieldr-how__panel-metric-value">7</div>
                    <div className="fieldr-how__panel-metric-label">Active jobs</div>
                  </div>
                  <div className="fieldr-how__panel-metric">
                    <div className="fieldr-how__panel-metric-value">3</div>
                    <div className="fieldr-how__panel-metric-label">Items queued</div>
                  </div>
                  <div className="fieldr-how__panel-metric">
                    <div className="fieldr-how__panel-metric-value">$2.1k</div>
                    <div className="fieldr-how__panel-metric-label">At risk</div>
                  </div>
                </div>
                <div className="fieldr-how__panel-rows">
                  <div className="fieldr-how__panel-row">
                    <span className="fieldr-how__panel-step">Capture</span>
                    <span className="fieldr-how__panel-copy">Inbound call + transcript captured</span>
                    <span className="fieldr-how__panel-status">Active</span>
                  </div>
                  <div className="fieldr-how__panel-row">
                    <span className="fieldr-how__panel-step">Extract</span>
                    <span className="fieldr-how__panel-copy">Scope delta + price signal detected</span>
                    <span className="fieldr-how__panel-status">Queued</span>
                  </div>
                  <div className="fieldr-how__panel-row">
                    <span className="fieldr-how__panel-step">Write back</span>
                    <span className="fieldr-how__panel-copy">Draft quote created + linked to job</span>
                    <span className="fieldr-how__panel-status">Ready</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="fieldr-how__workflow">
          <div className="fieldr-how__workflow-grid">
            <div className="fieldr-how__timeline">
              {steps.map((step) => (
                <article key={step.number} className="fieldr-how__step" data-how-step>
                  <div className="fieldr-how__step-number">{step.number}</div>
                  <div className="fieldr-how__step-title">{step.title}</div>
                  <div className="fieldr-how__step-body">{step.body}</div>
                </article>
              ))}
            </div>
            <div className="fieldr-how__queue-card" data-how-step>
              <div className="fieldr-how__queue-header">
                <span className="fieldr-how__queue-title">Decision queue</span>
                <span className="fieldr-how__queue-count">3 items</span>
              </div>
              <div className="fieldr-how__queue-list">
                {queueStack.map((item) => (
                  <div key={item.title} className="fieldr-how__queue-item">
                    <span className={`fieldr-how__queue-dot${item.status === 'Needs review' ? ' is-alert' : ''}${item.status === 'Follow-up' ? ' is-warning' : ''}`} aria-hidden="true" />
                    <div>
                      <div className="fieldr-how__queue-item-title">{item.title}</div>
                      <div className="fieldr-how__queue-item-detail">{item.detail}</div>
                    </div>
                    <span className="fieldr-how__queue-status">{item.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="fieldr-how__cta">
          <div className="fieldr-how__inner">
            <h2 className="fieldr-how__cta-title" data-how-cta>Run a live operator session.</h2>
            <div className="fieldr-how__cta-card" data-how-cta>
              <div className="fieldr-how__cta-note">We attach to a real job, capture one update, and close the loop end-to-end.</div>
              <div className="fieldr-how__cta-grid">
                <div className="fieldr-how__cta-item">Live capture</div>
                <div className="fieldr-how__cta-item">Queue approval</div>
                <div className="fieldr-how__cta-item">Draft quote</div>
              </div>
            </div>
            <SmartLink to={BOOK_DEMO_HREF} className="fieldr-how__cta-button" data-how-cta>
              Book a Demo
            </SmartLink>
          </div>
        </section>
      </main>
    </>
  )
}
