import { useLayoutEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { AnimatedWords } from '../components/AnimatedWords'
import { BOOK_DEMO_HREF, APP_FLOW_HREF } from '../components/siteLinks'
import { SmartLink } from '../components/SmartLink'

gsap.registerPlugin(ScrollTrigger)

const problemCards = [
  {
    number: '01',
    kicker: 'Signal loss',
    title: 'Field updates get buried',
    body: 'A sub calls in a change. An owner texts a revision. By the time the office surfaces it, the job has moved on and the margin is already gone.',
  },
  {
    number: '02',
    kicker: 'Billing gap',
    title: 'The extra work never gets billed',
    body: 'You know what changed on site. Getting that into a revised number before the window closes is where revenue disappears job after job.',
    featured: true,
  },
  {
    number: '03',
    kicker: 'Record drift',
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
    detail: 'Scope change identified - Quote revision required before closeout',
  },
  {
    timestamp: '09:16:01',
    tone: 'var(--sienna-lt)',
    title: 'Draft quote prepared',
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

const heroSignals = ['Capture live', '3 pending decisions', '1 quote delta flagged']

const exampleRows = [
  {
    label: 'Signal',
    title: 'A tech texts: "Need two extra outlets in conference room."',
    copy: 'Real field communication. Short, incomplete, and easy to ignore when the office is already moving.',
  },
  {
    label: 'Failure mode',
    title: 'It stays in messages and the quote never gets revised.',
    copy: 'The extra work gets done. Nobody updates the number. The revenue slips because the office catches it too late or not at all.',
  },
  {
    label: 'Arbor action',
    title: 'The change gets caught. The new line item is prepared. It is ready for approval.',
    copy: 'The change stays tied to the job and shows up for review before the billing window closes.',
  },
]

export default function Home() {
  const rootRef = useRef(null)

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const intro = gsap.timeline({ defaults: { ease: 'power2.out' } })

      intro
        .from('[data-home-reveal="eyebrow"]', { y: 16, opacity: 0, duration: 0.34 })
        .from('.fieldr-home__headline .fieldr-word__inner', {
          yPercent: 110,
          opacity: 0,
          filter: 'blur(10px)',
          duration: 0.72,
          stagger: 0.045,
        }, '-=0.08')
        .from('[data-home-reveal="subhead"]', { y: 18, opacity: 0, duration: 0.44 }, '-=0.4')
        .from('[data-home-reveal="cta"] > *', { y: 12, opacity: 0, duration: 0.32, stagger: 0.08 }, '-=0.22')
        .from('[data-home-reveal="readout"]', { y: 10, opacity: 0, duration: 0.32 }, '-=0.18')
        .from('[data-home-reveal="meta"]', { y: 10, opacity: 0, duration: 0.32 }, '-=0.2')

      gsap.from('[data-home-card]', {
        scrollTrigger: {
          trigger: '.fieldr-home__problem-grid',
          start: 'top 82%',
          once: true,
        },
        y: 26,
        opacity: 0,
        scale: 0.985,
        filter: 'blur(8px)',
        duration: 0.58,
        stagger: 0.08,
        ease: 'power2.out',
      })

      gsap.from('[data-home-log-copy]', {
        scrollTrigger: {
          trigger: '.fieldr-home__log-grid',
          start: 'top 82%',
          once: true,
        },
        y: 18,
        opacity: 0,
        duration: 0.46,
        ease: 'power2.out',
      })

      gsap.from('[data-home-log-entry]', {
        scrollTrigger: {
          trigger: '.fieldr-home__log-feed',
          start: 'top 84%',
          once: true,
        },
        y: 18,
        opacity: 0,
        scale: 0.992,
        duration: 0.42,
        stagger: 0.1,
        ease: 'power2.out',
      })

      gsap.from('[data-home-example-copy]', {
        scrollTrigger: {
          trigger: '.fieldr-home__example-grid',
          start: 'top 82%',
          once: true,
        },
        y: 20,
        opacity: 0,
        duration: 0.46,
        ease: 'power2.out',
      })

      gsap.from('[data-home-example-row]', {
        scrollTrigger: {
          trigger: '.fieldr-home__example-panel',
          start: 'top 84%',
          once: true,
        },
        x: 18,
        opacity: 0,
        scale: 0.992,
        duration: 0.42,
        stagger: 0.1,
        ease: 'power2.out',
      })

      gsap.from('[data-home-final]', {
        scrollTrigger: {
          trigger: '.fieldr-home__final-cta',
          start: 'top 86%',
          once: true,
        },
        y: 24,
        opacity: 0,
        duration: 0.48,
        stagger: 0.08,
        ease: 'power2.out',
      })
    }, rootRef)

    return () => ctx.revert()
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
          background: radial-gradient(circle at top center, rgba(184,83,46,0.09), transparent 72%);
          pointer-events: none;
        }

        .fieldr-home__hero::after {
          content: '';
          position: absolute;
          inset: 12% auto auto 50%;
          width: min(820px, 88vw);
          height: 1px;
          transform: translateX(-50%);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent);
          opacity: 0.65;
        }

        .fieldr-home__hero-inner {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 780px;
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
          text-wrap: balance;
        }

        .fieldr-home__subhead {
          margin: 24px auto 0;
          max-width: 600px;
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

        .fieldr-home__primary-cta:hover {
          transform: translateY(-1px);
          box-shadow: 0 20px 42px rgba(184,83,46,0.24);
        }

        .fieldr-home__secondary-cta {
          color: var(--bright);
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          line-height: 1;
          text-decoration: none;
          text-transform: uppercase;
          transition: color 180ms ease;
        }

        .fieldr-home__secondary-cta:hover {
          color: var(--sienna-lt);
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
          background: rgba(22,20,18,0.72);
          backdrop-filter: blur(10px);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.02), 0 10px 26px rgba(0,0,0,0.18);
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
          background: linear-gradient(90deg, var(--rule2), transparent 92%);
        }

        .fieldr-home__problem-grid {
          display: grid;
          grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.1fr) minmax(0, 0.95fr);
          gap: 0;
          align-items: stretch;
          overflow: hidden;
          border-radius: 10px;
        }

        .fieldr-home__problem-card {
          border: 1px solid var(--rule2);
          border-radius: 8px;
          background: linear-gradient(180deg, rgba(24,22,19,0.96) 0%, rgba(18,16,14,0.98) 100%);
          padding: 32px 28px;
          box-shadow: 0 20px 42px rgba(0,0,0,0.14);
          transition: transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease;
        }

        .fieldr-home__problem-card + .fieldr-home__problem-card {
          border-left: 0;
        }

        .fieldr-home__problem-card.is-featured {
          background: linear-gradient(180deg, rgba(184,83,46,0.11) 0%, rgba(20,18,16,1) 100%);
          border-color: var(--sienna-bd);
          box-shadow: 0 24px 54px rgba(0,0,0,0.22);
          transform: translateY(-10px);
        }

        .fieldr-home__problem-card:hover {
          transform: translateY(-4px);
          border-color: rgba(212,103,63,0.28);
          box-shadow: 0 28px 56px rgba(0,0,0,0.22);
        }

        .fieldr-home__problem-card.is-featured:hover {
          transform: translateY(-12px);
        }

        .fieldr-home__problem-number {
          font-family: var(--serif);
          font-size: 48px;
          font-style: italic;
          line-height: 1;
          color: var(--sienna-lt);
          opacity: 0.28;
        }

        .fieldr-home__problem-kicker {
          margin-top: 16px;
          font-family: var(--mono);
          font-size: 8px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--sienna-lt);
        }

        .fieldr-home__problem-title {
          margin-top: 10px;
          font-size: 15px;
          font-weight: 500;
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
          position: relative;
          background: linear-gradient(180deg, rgba(23,21,18,0.9) 0%, rgba(18,17,14,0.82) 100%);
          border-top: 1px solid var(--rule2);
          border-bottom: 1px solid var(--rule);
        }

        .fieldr-home__log-section::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 18% 24%, rgba(184,83,46,0.06), transparent 28%);
          pointer-events: none;
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
          position: relative;
          z-index: 1;
          border-top: 1px solid var(--rule2);
        }

        .fieldr-home__log-entry {
          display: grid;
          grid-template-columns: 96px 10px minmax(0, 1fr);
          gap: 18px;
          align-items: start;
          padding: 18px 0;
          border-bottom: 1px solid var(--rule2);
          transition: transform 220ms ease, border-color 220ms ease, background 220ms ease;
        }

        .fieldr-home__log-entry.is-featured {
          margin: 8px 0;
          padding: 18px 14px;
          border: 1px solid var(--sienna-bd);
          border-left: 2px solid var(--sienna);
          border-radius: 8px;
          background: rgba(184,83,46,0.08);
        }

        .fieldr-home__log-entry:hover {
          transform: translateX(4px);
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
          text-wrap: balance;
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
          border-radius: 8px;
          background: linear-gradient(180deg, rgba(24,22,19,0.98) 0%, rgba(18,16,14,1) 100%);
          box-shadow: 0 24px 56px rgba(0,0,0,0.18);
          overflow: hidden;
        }

        .fieldr-home__example-row {
          display: grid;
          grid-template-columns: 104px minmax(0, 1fr);
          gap: 18px;
          padding: 18px 20px;
          border-top: 1px solid var(--rule2);
          transition: background 200ms ease, transform 200ms ease;
        }

        .fieldr-home__example-row:first-child {
          border-top: 0;
        }

        .fieldr-home__example-row.is-fieldr {
          background: rgba(184,83,46,0.07);
        }

        .fieldr-home__example-row:hover {
          background: rgba(255,255,255,0.018);
          transform: translateX(4px);
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
          background: rgba(22,20,18,0.88);
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
          background: linear-gradient(135deg, var(--sienna), var(--sienna-lt));
          color: var(--bright);
          font-family: var(--sans);
          font-size: 14px;
          font-weight: 500;
          line-height: 1;
          text-decoration: none;
          box-shadow: 0 16px 36px rgba(184,83,46,0.18);
          transition: transform 180ms ease, box-shadow 180ms ease;
        }

        .fieldr-home__final-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 20px 42px rgba(184,83,46,0.24);
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

          .fieldr-home__secondary-cta {
            display: inline-flex;
            align-items: center;
            min-height: 42px;
            border: 1px solid var(--rule2);
            border-radius: 999px;
            background: rgba(22,20,18,0.82);
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.02);
          }

          .fieldr-home__subhead {
            font-size: 15px;
          }

          .fieldr-home__meta {
            line-height: 1.8;
          }

          .fieldr-home__hero-readout {
            width: min(100%, 320px);
            padding: 10px 12px;
            row-gap: 8px;
            line-height: 1.7;
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

          .fieldr-home__final-note {
            max-width: 320px;
            margin-left: auto;
            margin-right: auto;
            line-height: 1.8;
          }
        }
      `}</style>

      <main ref={rootRef} className="fieldr-home">
        <section className="fieldr-home__hero">
          <div className="fieldr-home__hero-inner">
            <p className="fieldr-home__eyebrow" data-home-reveal="eyebrow">Built for general contractors</p>
            <AnimatedWords
              as="h1"
              className="fieldr-home__headline"
              text="The field never stops. Neither does Arbor."
              data-home-reveal="headline"
            />
            <p className="fieldr-home__subhead" data-home-reveal="subhead">
              Arbor reads calls, texts, voice notes, and uploads as operating signal. It detects what changed, prepares the next decision, and gets a draft ready before revenue slips through. No new app for your crew. No extra workflow.
            </p>
            <div className="fieldr-home__cta-row" data-home-reveal="cta">
              <SmartLink to={BOOK_DEMO_HREF} className="fieldr-home__primary-cta">
                Book a Demo
              </SmartLink>
              <SmartLink to={APP_FLOW_HREF} className="fieldr-home__secondary-cta">Agent</SmartLink>
            </div>
            <div className="fieldr-home__hero-readout" aria-label="Live agent readout" data-home-reveal="readout">
              <span className="fieldr-home__hero-readout-dot" aria-hidden="true" />
              {heroSignals.map((signal, index) => (
                <span key={signal}>
                  {index > 0 ? <span className="fieldr-home__hero-readout-sep" aria-hidden="true">&middot;</span> : null}
                  {' '}
                  {signal}
                </span>
              ))}
            </div>
            <div className="fieldr-home__meta" data-home-reveal="meta">Early access &middot; Chattanooga, TN &middot; Built for field contractors</div>
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
                <article key={card.number} className={`fieldr-home__problem-card${card.featured ? ' is-featured' : ''}`} data-home-card>
                  <div className="fieldr-home__problem-kicker">{card.kicker}</div>
                  <div className="fieldr-home__problem-title">{card.title}</div>
                  <div className="fieldr-home__problem-body">{card.body}</div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="fieldr-home__section fieldr-home__log-section">
          <div className="fieldr-home__section-inner fieldr-home__log-grid">
            <div data-home-log-copy>
              <div className="fieldr-home__section-labelrow" style={{ marginBottom: '22px' }}>
                <span className="fieldr-home__section-label">What Arbor caught today</span>
                <div className="fieldr-home__section-rule" aria-hidden="true" />
              </div>
              <h2 className="fieldr-home__log-headline">What Arbor caught while you were on site.</h2>
              <p className="fieldr-home__log-copy">
                While you are on site, Arbor converts field chatter into decisions. It catches the update, isolates what changed, and puts the next move in front of the office before the trail goes cold.
              </p>
            </div>

            <div className="fieldr-home__log-feed">
              {agentLogEntries.map((entry) => (
                <div key={`${entry.timestamp}-${entry.title}`} className={`fieldr-home__log-entry${entry.featured ? ' is-featured' : ''}`} data-home-log-entry>
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
            <div data-home-example-copy>
              <div className="fieldr-home__section-labelrow" style={{ marginBottom: '22px' }}>
                <span className="fieldr-home__section-label">One missed text</span>
                <div className="fieldr-home__section-rule" aria-hidden="true" />
              </div>
              <h2 className="fieldr-home__example-headline">The extra work gets done. The billing never catches up.</h2>
              <p className="fieldr-home__example-body">
                A contractor does not lose margin because they cannot estimate. They lose it because the field changes faster than the office can keep the record current. Arbor closes that gap before the revised work disappears into texts, calls, and memory.
              </p>
              <div className="fieldr-home__example-foot">
                <span className="fieldr-home__example-chip">Quote delta prepared</span>
                <span className="fieldr-home__example-chip">Approval required</span>
                <span className="fieldr-home__example-chip">Written to job record</span>
              </div>
            </div>

            <div className="fieldr-home__example-panel">
              {exampleRows.map((row) => (
                <div key={row.label} className={`fieldr-home__example-row${row.label === 'Arbor action' ? ' is-fieldr' : ''}`} data-home-example-row>
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
            <h2 className="fieldr-home__final-title" data-home-final>Ready to stop letting changes disappear?</h2>
            <p className="fieldr-home__final-copy" data-home-final>
              Arbor catches the field updates that usually slip through the office and turns them into reviewable work before they cost you money.
            </p>
            <SmartLink to={BOOK_DEMO_HREF} className="fieldr-home__final-button" data-home-final>
              Book a Demo
            </SmartLink>
            <div className="fieldr-home__final-note" data-home-final>20 minutes &middot; No commitment &middot; Chattanooga, TN</div>
          </div>
        </section>
      </main>
    </>
  )
}
