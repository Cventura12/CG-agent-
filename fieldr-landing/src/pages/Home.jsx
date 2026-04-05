import { useLayoutEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { AnimatedWords } from '../components/AnimatedWords'
import { BOOK_DEMO_HREF } from '../components/siteLinks'
import { SmartLink } from '../components/SmartLink'

gsap.registerPlugin(ScrollTrigger)

const marginLeakCards = [
  {
    tag: 'Signal loss',
    title: 'Field updates get buried',
    body: 'A sub calls in a change. An owner texts a revision. By the time the office surfaces it, the job has moved on and the margin is already gone.',
    cost: 'Costs: delayed response, missed change orders',
    tone: 'signal',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  {
    tag: 'Billing gap',
    title: 'The extra work never gets billed',
    body: 'You know what changed on site. Getting that into a revised number before the window closes is where revenue disappears job after job.',
    cost: 'Costs: unbilled scope, margin erosion',
    tone: 'billing',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M5 12h14" />
        <path d="M13 6l6 6-6 6" />
      </svg>
    ),
  },
  {
    tag: 'Record drift',
    title: 'What was promised gets forgotten',
    body: 'Quotes go quiet. Paperwork gets missed. Follow-through lives in memory until the wrong detail costs you money or credibility.',
    cost: 'Costs: disputes, credibility, rework',
    tone: 'record',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <rect x="6" y="4" width="12" height="16" rx="2" />
        <path d="M9 8h6" />
        <path d="M9 12h6" />
      </svg>
    ),
  },
]

const agentLogEntries = [
  {
    timestamp: '09:14:32',
    tone: '#4ade80',
    title: 'Voice note captured',
    detail: 'Johnson site - flashing swap, +$320, flagged for review',
  },
  {
    timestamp: '09:14:33',
    tone: '#4ade80',
    title: 'Change extracted',
    detail: 'Scope change identified - Quote revision required before closeout',
  },
  {
    timestamp: '09:16:01',
    tone: '#c1522a',
    title: 'Draft quote prepared',
    detail: '$8,720 total - Awaiting contractor sign-off before it goes to customer',
    featured: true,
  },
  {
    timestamp: '09:18:44',
    tone: '#c1522a',
    title: 'Follow-up scheduled',
    detail: 'Riverside Commercial - No response in 72h',
  },
  {
    timestamp: '09:19:12',
    tone: '#4ade80',
    title: 'Pricing updated',
    detail: 'Flashing rate saved so the next quote starts faster',
  },
]

const heroSignals = [
  { label: 'Capture live', tone: 'live' },
  { label: '3 pending decisions', tone: 'neutral' },
  { label: '1 quote delta flagged', tone: 'alert' },
]

const exampleRows = [
  {
    label: 'Signal',
    title: '"Need two extra outlets in the conference room."',
    copy: 'A real field text. Short, easy to miss, easy to forget.',
    tone: 'signal',
  },
  {
    label: 'Without Arbor',
    title: 'It stays in messages. The quote never gets revised.',
    copy: 'The work gets done. Nobody updates the number. Revenue slips.',
    tone: 'without',
  },
  {
    label: 'Arbor action',
    title: 'Change caught. Line item prepared. Queued for your approval.',
    copy: 'Tied to the job record before the billing window closes.',
    tone: 'arbor',
  },
]

const examplePills = ['Quote delta', 'Approval required', 'Job record updated']

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

      gsap.from('[data-home-leak-head]', {
        scrollTrigger: {
          trigger: '.fieldr-home__leak-grid',
          start: 'top 82%',
          once: true,
        },
        y: 20,
        opacity: 0,
        duration: 0.48,
        ease: 'power2.out',
      })

      gsap.from('[data-home-leak-card]', {
        scrollTrigger: {
          trigger: '.fieldr-home__leak-cards',
          start: 'top 84%',
          once: true,
        },
        y: 18,
        opacity: 0,
        duration: 0.48,
        stagger: 0.12,
        ease: 'power2.out',
      })

      gsap.from('[data-home-leak-bar]', {
        scrollTrigger: {
          trigger: '.fieldr-home__leak-bar',
          start: 'top 88%',
          once: true,
        },
        y: 16,
        opacity: 0,
        duration: 0.4,
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
          inset: -6% 0 auto;
          height: 560px;
          background: radial-gradient(ellipse at 50% 18%, rgba(193,82,42,0.08) 0%, transparent 70%);
          pointer-events: none;
        }

        .fieldr-home__hero::after {
          content: '';
          position: absolute;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
          opacity: 0.04;
          pointer-events: none;
          mix-blend-mode: soft-light;
        }

        .fieldr-home__hero-line {
          position: absolute;
          inset: 12% auto auto 50%;
          width: min(820px, 88vw);
          height: 1px;
          transform: translateX(-50%);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent);
          opacity: 0.65;
          pointer-events: none;
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

        .fieldr-home__headline em {
          font-style: italic;
          font-weight: 500;
        }

        .fieldr-home__subhead {
          margin: 24px auto 0;
          max-width: 600px;
          font-size: 17px;
          line-height: 1.74;
          font-weight: 300;
          color: var(--body);
        }

        .fieldr-home__subhead-hook {
          margin: 14px auto 0;
          font-family: var(--mono);
          font-size: 12px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
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
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--rule2);
          border-radius: 999px;
          padding: 12px 22px;
          color: var(--bright);
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          line-height: 1;
          text-decoration: none;
          text-transform: uppercase;
          transition: color 180ms ease, border-color 180ms ease, transform 180ms ease;
          background: rgba(22,20,18,0.62);
        }

        .fieldr-home__secondary-cta:hover {
          color: var(--sienna-lt);
          border-color: rgba(193,82,42,0.35);
          transform: translateY(-1px);
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

        .fieldr-home__hero-readout-item {
          color: var(--body);
        }

        .fieldr-home__hero-readout-item.is-live {
          color: var(--moss-lt);
        }

        .fieldr-home__hero-readout-item.is-alert {
          color: var(--sienna-lt);
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

        .fieldr-home__leak-section {
          padding: 80px 48px;
        }

        .fieldr-home__leak-grid {
          max-width: 1100px;
          margin: 0 auto;
        }

        .fieldr-home__leak-eyebrow {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .fieldr-home__leak-eyebrow span {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #c1522a;
        }

        .fieldr-home__leak-rule {
          flex: 1;
          height: 1px;
          background: linear-gradient(90deg, rgba(193,82,42,0.4), transparent);
        }

        .fieldr-home__leak-head {
          margin-top: 32px;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 48px;
          margin-bottom: 48px;
        }

        .fieldr-home__leak-title {
          margin: 0;
          font-family: var(--serif);
          font-size: clamp(38px, 5vw, 52px);
          font-style: italic;
          font-weight: 900;
          color: #f2e8d9;
          letter-spacing: -0.02em;
        }

        .fieldr-home__leak-subhead {
          margin: 0;
          max-width: 280px;
          text-align: right;
          font-size: 13px;
          line-height: 1.65;
          font-weight: 300;
          color: rgba(242,232,217,0.4);
        }

        .fieldr-home__leak-cards {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1px;
          background: rgba(255,255,255,0.07);
          border-radius: 12px;
          overflow: hidden;
          margin-bottom: 32px;
        }

        .fieldr-home__leak-card {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 32px 28px;
          min-height: 100%;
        }

        .fieldr-home__leak-card.is-signal {
          background: #1c1812;
        }

        .fieldr-home__leak-card.is-billing {
          background: rgba(193,82,42,0.1);
        }

        .fieldr-home__leak-card.is-record {
          background: #1a1714;
        }

        .fieldr-home__leak-tag {
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #c1522a;
        }

        .fieldr-home__leak-card-title {
          margin: 0;
          font-size: 17px;
          font-weight: 500;
          color: #f2e8d9;
        }

        .fieldr-home__leak-card-body {
          margin: 0;
          flex: 1;
          font-size: 13px;
          line-height: 1.7;
          font-weight: 300;
          color: rgba(242,232,217,0.55);
        }

        .fieldr-home__leak-cost {
          margin-top: auto;
          padding-top: 14px;
          border-top: 0.5px solid rgba(193,82,42,0.15);
          display: flex;
          align-items: center;
          gap: 10px;
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(193,82,42,0.6);
        }

        .fieldr-home__leak-cost svg {
          width: 12px;
          height: 12px;
          flex: 0 0 auto;
        }

        .fieldr-home__leak-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 20px 28px;
          border: 0.5px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          background: rgba(193,82,42,0.05);
          text-decoration: none;
        }

        .fieldr-home__leak-bar-left {
          display: flex;
          align-items: center;
          gap: 12px;
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(242,232,217,0.5);
        }

        .fieldr-home__leak-bar-left strong {
          color: #c1522a;
          font-weight: 600;
        }

        .fieldr-home__leak-pulse {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: var(--moss-lt);
          box-shadow: 0 0 0 5px var(--moss-bg);
          animation: fieldrPulse 2s ease-in-out infinite;
        }

        .fieldr-home__leak-bar-right {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(242,232,217,0.3);
          white-space: nowrap;
        }

        .fieldr-home__leak-bar-right span {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .fieldr-home__leak-bar-right i {
          display: inline-block;
          width: 36px;
          height: 1px;
          background: rgba(242,232,217,0.2);
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

        .fieldr-home__example-section {
          padding: 72px 52px;
          background: #161310;
        }

        .fieldr-home__example-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
          gap: 72px;
          align-items: center;
          max-width: 1060px;
          margin: 0 auto;
        }

        .fieldr-home__example-eyebrow {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .fieldr-home__example-eyebrow span {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #c1522a;
        }

        .fieldr-home__example-rule {
          flex: 1;
          height: 1px;
          background: linear-gradient(90deg, rgba(193,82,42,0.35), transparent);
        }

        .fieldr-home__example-headline {
          margin: 18px 0 0;
          font-family: var(--serif);
          font-size: 40px;
          line-height: 1.2;
          font-style: italic;
          font-weight: 900;
          color: #efe5d4;
          letter-spacing: -0.02em;
        }

        .fieldr-home__example-body {
          margin-top: 16px;
          max-width: 430px;
          font-size: 13.5px;
          line-height: 1.75;
          font-weight: 300;
          color: rgba(239,229,212,0.45);
        }

        .fieldr-home__example-panel {
          border: 0.5px solid rgba(255,255,255,0.08);
          border-radius: 14px;
          overflow: hidden;
        }

        .fieldr-home__example-row {
          display: flex;
          align-items: stretch;
          border-top: 0.5px solid rgba(255,255,255,0.06);
        }

        .fieldr-home__example-row:first-child {
          border-top: 0;
        }

        .fieldr-home__example-row.is-arbor {
          background: rgba(193,82,42,0.07);
          border-top: 0.5px solid rgba(193,82,42,0.18);
        }

        .fieldr-home__example-accent {
          width: 7px;
          flex: 0 0 7px;
        }

        .fieldr-home__example-accent.is-signal {
          background: rgba(255,255,255,0.06);
        }

        .fieldr-home__example-accent.is-without {
          background: rgba(193,82,42,0.3);
        }

        .fieldr-home__example-accent.is-arbor {
          background: #c1522a;
        }

        .fieldr-home__example-content {
          flex: 1;
          padding: 22px 24px;
        }

        .fieldr-home__example-kicker {
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(239,229,212,0.25);
        }

        .fieldr-home__example-kicker.is-without {
          color: rgba(193,82,42,0.5);
        }

        .fieldr-home__example-kicker.is-arbor {
          color: #c1522a;
        }

        .fieldr-home__example-title {
          margin-top: 8px;
          font-size: 13.5px;
          font-weight: 500;
          color: #efe5d4;
        }

        .fieldr-home__example-copy {
          margin-top: 6px;
          font-size: 12px;
          line-height: 1.65;
          font-weight: 300;
          color: rgba(239,229,212,0.38);
        }

        .fieldr-home__example-row.is-arbor .fieldr-home__example-copy {
          color: rgba(239,229,212,0.55);
        }

        .fieldr-home__example-pills {
          margin-top: 12px;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .fieldr-home__example-pill {
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 3px 9px;
          border-radius: 100px;
          background: rgba(193,82,42,0.14);
          border: 0.5px solid rgba(193,82,42,0.28);
          color: rgba(193,82,42,0.85);
        }

        .fieldr-home__final-cta {
          padding: 80px 52px;
          border-top: 1px solid var(--rule);
          background: #161310;
        }

        .fieldr-home__final-frame {
          position: relative;
          max-width: 720px;
          margin: 0 auto;
          padding: 64px 72px;
          text-align: center;
          border-radius: 20px;
          border: 0.5px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.02);
        }

        .fieldr-home__final-corner {
          position: absolute;
          width: 20px;
          height: 20px;
          border-color: #c1522a;
          border-style: solid;
          border-width: 1.5px;
        }

        .fieldr-home__final-corner.is-top-left {
          top: -1.5px;
          left: -1.5px;
          border-right: 0;
          border-bottom: 0;
          border-top-left-radius: 20px;
        }

        .fieldr-home__final-corner.is-top-right {
          top: -1.5px;
          right: -1.5px;
          border-left: 0;
          border-bottom: 0;
          border-top-right-radius: 20px;
        }

        .fieldr-home__final-corner.is-bottom-left {
          bottom: -1.5px;
          left: -1.5px;
          border-right: 0;
          border-top: 0;
          border-bottom-left-radius: 20px;
        }

        .fieldr-home__final-corner.is-bottom-right {
          bottom: -1.5px;
          right: -1.5px;
          border-left: 0;
          border-top: 0;
          border-bottom-right-radius: 20px;
        }

        .fieldr-home__final-eyebrow {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-bottom: 28px;
        }

        .fieldr-home__final-eyebrow span {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #c1522a;
        }

        .fieldr-home__final-eyebrow-line {
          width: 32px;
          height: 1px;
          background: rgba(193,82,42,0.35);
        }

        .fieldr-home__final-title {
          margin: 0;
          font-family: var(--serif);
          font-size: clamp(40px, 5vw, 50px);
          line-height: 1.08;
          font-style: italic;
          font-weight: 900;
          color: #efe5d4;
          letter-spacing: -0.02em;
          white-space: pre-line;
        }

        .fieldr-home__final-copy {
          margin: 20px auto 0;
          max-width: 400px;
          font-size: 14px;
          line-height: 1.75;
          font-weight: 300;
          color: rgba(239,229,212,0.45);
        }

        .fieldr-home__final-copy span {
          color: rgba(239,229,212,0.7);
        }

        .fieldr-home__final-button {
          margin-top: 36px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 8px;
          padding: 14px 36px;
          background: #c1522a;
          color: #fff;
          font-family: var(--sans);
          font-size: 14px;
          font-weight: 500;
          line-height: 1;
          text-decoration: none;
          transition: transform 180ms ease, box-shadow 180ms ease;
          box-shadow: 0 16px 36px rgba(193,82,42,0.2);
        }

        .fieldr-home__final-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 20px 42px rgba(193,82,42,0.28);
        }

        .fieldr-home__final-meta {
          margin-top: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          flex-wrap: wrap;
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(239,229,212,0.25);
        }

        .fieldr-home__final-meta-dot {
          width: 3px;
          height: 3px;
          border-radius: 999px;
          background: rgba(239,229,212,0.15);
        }

        .fieldr-home__final-status {
          margin-top: 48px;
          display: flex;
          justify-content: center;
        }

        .fieldr-home__final-status-row {
          display: flex;
        }

        .fieldr-home__final-status-item {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 20px;
          border: 0.5px solid rgba(255,255,255,0.07);
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(239,229,212,0.3);
          background: rgba(255,255,255,0.01);
        }

        .fieldr-home__final-status-item + .fieldr-home__final-status-item {
          margin-left: -0.5px;
        }

        .fieldr-home__final-status-item:first-child {
          border-radius: 100px 0 0 100px;
        }

        .fieldr-home__final-status-item:last-child {
          border-radius: 0 100px 100px 0;
        }

        .fieldr-home__final-status-item.is-live {
          color: rgba(74,222,128,0.7);
        }

        .fieldr-home__final-status-item.is-alert {
          color: rgba(193,82,42,0.8);
        }

        .fieldr-home__final-status-dot {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: #4ade80;
          animation: fieldrPulse 2s ease-in-out infinite;
        }

        @keyframes fieldrPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(1.12); }
        }

        @media (max-width: 960px) {
          .fieldr-home__leak-cards,
          .fieldr-home__log-grid,
          .fieldr-home__example-grid {
            grid-template-columns: 1fr;
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
            min-height: 42px;
            width: min(100%, 280px);
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

          .fieldr-home__leak-section {
            padding: 72px 20px;
          }

          .fieldr-home__leak-head {
            flex-direction: column;
            align-items: flex-start;
          }

          .fieldr-home__leak-subhead {
            text-align: left;
            max-width: 100%;
          }

          .fieldr-home__leak-bar {
            flex-direction: column;
            align-items: flex-start;
          }

          .fieldr-home__example-section {
            padding: 64px 20px;
          }

          .fieldr-home__example-headline {
            font-size: 34px;
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
            padding: 18px 16px;
          }

        .fieldr-home__final-cta {
          padding: 64px 20px;
        }

        .fieldr-home__final-frame {
          padding: 48px 28px;
        }

        .fieldr-home__final-title {
          font-size: 34px;
        }

        .fieldr-home__final-button {
          width: min(100%, 280px);
        }

        .fieldr-home__final-meta {
          line-height: 1.8;
        }

        .fieldr-home__final-status-row {
          flex-direction: column;
          width: 100%;
        }

        .fieldr-home__final-status-item {
          width: 100%;
          justify-content: center;
        }

        .fieldr-home__final-status-item:first-child {
          border-radius: 100px 100px 0 0;
        }

        .fieldr-home__final-status-item:last-child {
          border-radius: 0 0 100px 100px;
        }
        }
      `}</style>

      <main ref={rootRef} className="fieldr-home" data-build="2026-04-04">
        <section className="fieldr-home__hero">
          <span className="fieldr-home__hero-line" aria-hidden="true" />
          <div className="fieldr-home__hero-inner">
            <p className="fieldr-home__eyebrow" data-home-reveal="eyebrow">Built for general contractors</p>
            <h1 className="fieldr-home__headline" data-home-reveal="headline">
              <AnimatedWords as="span" text="The field never stops." />
              {' '}
              <em>
                <AnimatedWords as="span" text="Neither does Arbor." />
              </em>
            </h1>
            <p className="fieldr-home__subhead" data-home-reveal="subhead">
              Arbor reads calls, texts, voice notes, and uploads, detects what changed, and gets a draft ready before revenue slips.
            </p>
            <p className="fieldr-home__subhead-hook" data-home-reveal="subhead">
              No new app for your crew. No extra workflow.
            </p>
            <div className="fieldr-home__cta-row" data-home-reveal="cta">
              <SmartLink to={BOOK_DEMO_HREF} className="fieldr-home__primary-cta">
                Book a Demo
              </SmartLink>
              <SmartLink to="#how-it-works" className="fieldr-home__secondary-cta">See how it works</SmartLink>
            </div>
            <div className="fieldr-home__hero-readout" aria-label="Live agent readout" data-home-reveal="readout">
              <span className="fieldr-home__hero-readout-dot" aria-hidden="true" />
              {heroSignals.map((signal, index) => (
                <span key={signal.label} className={`fieldr-home__hero-readout-item${signal.tone === 'live' ? ' is-live' : ''}${signal.tone === 'alert' ? ' is-alert' : ''}`}>
                  {index > 0 ? <span className="fieldr-home__hero-readout-sep" aria-hidden="true">&middot;</span> : null}
                  {' '}
                  {signal.label}
                </span>
              ))}
            </div>
            <div className="fieldr-home__meta" data-home-reveal="meta">Early access &middot; Chattanooga, TN &middot; Built for general contractors</div>
          </div>
        </section>

        <section className="fieldr-home__leak-section">
          <div className="fieldr-home__leak-grid">
            <div className="fieldr-home__leak-eyebrow">
              <span>Where margin leaks</span>
              <div className="fieldr-home__leak-rule" aria-hidden="true" />
            </div>

            <div className="fieldr-home__leak-head" data-home-leak-head>
              <h2 className="fieldr-home__leak-title">Three places revenue disappears on every job.</h2>
              <p className="fieldr-home__leak-subhead">
                None of them require a bad crew. Just the wrong tool handling the wrong moment.
              </p>
            </div>

            <div className="fieldr-home__leak-cards">
              {marginLeakCards.map((card) => (
                <article
                  key={card.tag}
                  className={`fieldr-home__leak-card${card.tone === 'signal' ? ' is-signal' : ''}${card.tone === 'billing' ? ' is-billing' : ''}${card.tone === 'record' ? ' is-record' : ''}`}
                  data-home-leak-card
                >
                  <div className="fieldr-home__leak-tag">{card.tag}</div>
                  <h3 className="fieldr-home__leak-card-title">{card.title}</h3>
                  <p className="fieldr-home__leak-card-body">{card.body}</p>
                  <div className="fieldr-home__leak-cost">
                    {card.icon}
                    {card.cost}
                  </div>
                </article>
              ))}
            </div>

            <SmartLink to="#how-it-works" className="fieldr-home__leak-bar" data-home-leak-bar>
              <div className="fieldr-home__leak-bar-left">
                <span className="fieldr-home__leak-pulse" aria-hidden="true" />
                <span>
                  Arbor closes <strong>all three gaps</strong> — see how it works
                </span>
              </div>
              <div className="fieldr-home__leak-bar-right">
                <span>
                  How it works <i aria-hidden="true" />
                  →
                </span>
              </div>
            </SmartLink>
          </div>
        </section>

        <section id="how-it-works" className="fieldr-home__section fieldr-home__log-section">
          <div className="fieldr-home__section-inner fieldr-home__log-grid">
            <div data-home-log-copy>
              <div className="fieldr-home__section-labelrow" style={{ marginBottom: '22px' }}>
                <span className="fieldr-home__section-label">What Arbor caught this morning</span>
                <div className="fieldr-home__section-rule" aria-hidden="true" />
              </div>
              <h2 className="fieldr-home__log-headline">What Arbor caught while you were on site.</h2>
              <p className="fieldr-home__log-copy">
                Field chatter becomes reviewable work. It catches the update, isolates what changed, and puts the next move in front of the office.
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

        <section className="fieldr-home__example-section">
          <div className="fieldr-home__example-grid">
            <div data-home-example-copy>
              <div className="fieldr-home__example-eyebrow">
                <span>One missed text</span>
                <div className="fieldr-home__example-rule" aria-hidden="true" />
              </div>
              <h2 className="fieldr-home__example-headline">The extra work gets done. The billing never catches up.</h2>
              <p className="fieldr-home__example-body">
                A contractor doesn't lose margin because they can't estimate. They lose it because the field moves faster than the office can keep up. Arbor closes that gap.
              </p>
            </div>

            <div className="fieldr-home__example-panel">
              {exampleRows.map((row) => (
                <div key={row.label} className={`fieldr-home__example-row${row.tone === 'arbor' ? ' is-arbor' : ''}`} data-home-example-row>
                  <div className={`fieldr-home__example-accent${row.tone === 'signal' ? ' is-signal' : ''}${row.tone === 'without' ? ' is-without' : ''}${row.tone === 'arbor' ? ' is-arbor' : ''}`} />
                  <div className="fieldr-home__example-content">
                    <div className={`fieldr-home__example-kicker${row.tone === 'without' ? ' is-without' : ''}${row.tone === 'arbor' ? ' is-arbor' : ''}`}>
                      {row.label}
                    </div>
                    <div className="fieldr-home__example-title">{row.title}</div>
                    <div className="fieldr-home__example-copy">{row.copy}</div>
                    {row.tone === 'arbor' ? (
                      <div className="fieldr-home__example-pills">
                        {examplePills.map((pill) => (
                          <span key={pill} className="fieldr-home__example-pill">{pill}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="fieldr-home__final-cta">
          <div className="fieldr-home__final-frame" data-home-final>
            <span className="fieldr-home__final-corner is-top-left" aria-hidden="true" />
            <span className="fieldr-home__final-corner is-top-right" aria-hidden="true" />
            <span className="fieldr-home__final-corner is-bottom-left" aria-hidden="true" />
            <span className="fieldr-home__final-corner is-bottom-right" aria-hidden="true" />

            <div className="fieldr-home__final-eyebrow">
              <span className="fieldr-home__final-eyebrow-line" aria-hidden="true" />
              <span>Early access</span>
              <span className="fieldr-home__final-eyebrow-line" aria-hidden="true" />
            </div>

            <h2 className="fieldr-home__final-title">
              The crew doesn't stop.
              {'\n'}
              Neither should the billing.
            </h2>

            <p className="fieldr-home__final-copy">
              Arbor is running in early access for GCs in Chattanooga. <span>Twenty minutes. No commitment. See the loop close on a real job.</span>
            </p>

            <SmartLink to={BOOK_DEMO_HREF} className="fieldr-home__final-button">
              Book a Demo
            </SmartLink>

            <div className="fieldr-home__final-meta">
              <span>20 minutes</span>
              <span className="fieldr-home__final-meta-dot" aria-hidden="true" />
              <span>No commitment</span>
              <span className="fieldr-home__final-meta-dot" aria-hidden="true" />
              <span>Chattanooga, TN</span>
            </div>
          </div>

          <div className="fieldr-home__final-status" data-home-final>
            <div className="fieldr-home__final-status-row">
              <div className="fieldr-home__final-status-item is-live">
                <span className="fieldr-home__final-status-dot" aria-hidden="true" />
                Capture live
              </div>
              <div className="fieldr-home__final-status-item">3 pending decisions</div>
              <div className="fieldr-home__final-status-item is-alert">1 quote delta flagged</div>
            </div>
          </div>
        </section>
      </main>
    </>
  )
}
