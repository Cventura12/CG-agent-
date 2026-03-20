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
    body: 'A call, voice note, text, or document comes in. Fieldr picks it up automatically. Nothing to forward. Nothing to retype.',
  },
  {
    number: 'STEP 02',
    title: 'Find what matters',
    body: 'Fieldr reads it and pulls out what matters - scope changes, promised work, missing details, and price-related information.',
  },
  {
    number: 'STEP 03',
    title: 'Put it in front of you',
    body: 'The item shows up with the job, what changed, and what needs to happen next. You can approve it, edit it, or ignore it.',
  },
  {
    number: 'STEP 04',
    title: 'Finish the work',
    body: 'Approved items become draft quotes, follow-ups, or saved job notes. Over time Fieldr learns how you price work, so the next job is faster.',
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
          trigger: '.fieldr-how__steps-grid',
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
          padding: 120px 40px 64px;
          border-bottom: 1px solid var(--rule);
          overflow: hidden;
        }

        .fieldr-how__page-header::before {
          content: '';
          position: absolute;
          inset: -8% auto auto -8%;
          width: 44%;
          height: 320px;
          background: radial-gradient(circle at center, rgba(184,83,46,0.08), transparent 68%);
          pointer-events: none;
        }

        .fieldr-how__inner {
          position: relative;
          z-index: 1;
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

        .fieldr-how__steps {
          padding: 0 40px;
          border-bottom: 1px solid var(--rule);
        }

        .fieldr-how__steps-grid {
          max-width: 1240px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          border-left: 1px solid var(--rule);
          border-right: 1px solid var(--rule);
        }

        .fieldr-how__step {
          position: relative;
          padding: 48px 36px;
          border-right: 1px solid var(--rule);
          background: linear-gradient(180deg, rgba(23,21,18,0.88) 0%, rgba(18,16,14,0.82) 100%);
          transition: transform 220ms ease, border-color 220ms ease, background 220ms ease, box-shadow 220ms ease;
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
          background: linear-gradient(90deg, var(--sienna), rgba(212,103,63,0.18));
        }

        .fieldr-how__step:hover {
          transform: translateY(-4px);
          background: linear-gradient(180deg, rgba(28,26,23,0.94) 0%, rgba(20,18,16,0.9) 100%);
          box-shadow: 0 24px 48px rgba(0,0,0,0.16);
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
          color: var(--body);
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
          .fieldr-how__steps,
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

      <main ref={rootRef} className="fieldr-how" aria-label="Fieldr how it works page">
        <section className="fieldr-how__page-header">
          <div className="fieldr-how__inner">
            <p className="fieldr-how__eyebrow" data-how-reveal="eyebrow">How it works</p>
            <AnimatedWords
              as="h1"
              className="fieldr-how__headline"
              text="How Fieldr keeps things from slipping through."
              data-how-reveal="headline"
            />
            <p className="fieldr-how__subhead" data-how-reveal="subhead">
              Fieldr works in the background while your crew keeps working. It picks up what already comes in, pulls out what matters, and puts the next decision in front of you before it gets missed.
            </p>
          </div>
        </section>

        <section className="fieldr-how__steps">
          <div className="fieldr-how__steps-grid">
            {steps.map((step) => (
              <article key={step.number} className="fieldr-how__step" data-how-step>
                <div className="fieldr-how__step-number">{step.number}</div>
                <div className="fieldr-how__step-title">{step.title}</div>
                <div className="fieldr-how__step-body">{step.body}</div>
              </article>
            ))}
          </div>
        </section>

        <section className="fieldr-how__cta">
          <div className="fieldr-how__inner">
            <h2 className="fieldr-how__cta-title" data-how-cta>Ready to see it on your jobs?</h2>
            <SmartLink to={BOOK_DEMO_HREF} className="fieldr-how__cta-button" data-how-cta>
              Book a Demo
            </SmartLink>
            <div className="fieldr-how__cta-note" data-how-cta>20 minutes &middot; No commitment &middot; Chattanooga, TN</div>
          </div>
        </section>
      </main>
    </>
  )
}
