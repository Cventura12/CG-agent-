import { useLayoutEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { AnimatedWords } from '../components/AnimatedWords'
import { BOOK_DEMO_HREF } from '../components/siteLinks'
import { SmartLink } from '../components/SmartLink'

gsap.registerPlugin(ScrollTrigger)


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

const heroPanelItems = [
  {
    title: 'Hartley reroof',
    detail: 'Decking add · +$800 scope',
    tone: 'alert',
    status: 'Needs review',
  },
  {
    title: 'Ridgeview addition',
    detail: 'Owner text · Window upgrade queued',
    tone: 'neutral',
    status: 'Captured',
  },
  {
    title: 'Riverside Commercial',
    detail: 'Follow-up due · 72h since last response',
    tone: 'warning',
    status: 'Follow-up',
  },
]

const logStats = [
  { value: '7', label: 'Active jobs' },
  { value: '3', label: 'Items in queue' },
  { value: '$2.1k', label: 'Scope at risk' },
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
        .from('[data-home-panel]', { y: 18, opacity: 0, duration: 0.42 }, '-=0.28')
        .from('[data-home-panel-item]', { y: 14, opacity: 0, duration: 0.32, stagger: 0.1 }, '-=0.26')


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
          padding: 124px 28px 96px;
          overflow: hidden;
          background: radial-gradient(circle at 10% 10%, rgba(193,82,42,0.12), transparent 50%);
        }

        .fieldr-home__hero::before {
          content: '';
          position: absolute;
          inset: -10% 0 auto;
          height: 640px;
          background: radial-gradient(ellipse at 25% 35%, rgba(193,82,42,0.18) 0%, transparent 70%);
          pointer-events: none;
        }

        .fieldr-home__hero::after {
          content: '';
          position: absolute;
          inset: 0;
          background-image: radial-gradient(circle at 80% 20%, rgba(255,255,255,0.08), transparent 35%);
          opacity: 0.7;
          pointer-events: none;
          mix-blend-mode: soft-light;
        }

        .fieldr-home__hero-shell {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 1180px;
          margin: 0 auto;
        }

        .fieldr-home__hero-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
          gap: 64px;
          align-items: center;
        }

        .fieldr-home__hero-left {
          text-align: left;
        }

        .fieldr-home__hero-right {
          display: flex;
          justify-content: flex-end;
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
          margin: 18px 0 0;
          font-family: var(--serif);
          font-size: clamp(42px, 5.2vw, 74px);
          line-height: 1.02;
          letter-spacing: -1.8px;
          color: var(--bright);
          text-wrap: balance;
        }

        .fieldr-home__headline em {
          font-style: italic;
          font-weight: 500;
        }

        .fieldr-home__subhead {
          margin: 22px 0 0;
          max-width: 560px;
          font-size: 16.5px;
          line-height: 1.72;
          font-weight: 300;
          color: rgba(232,224,212,0.72);
        }

        .fieldr-home__subhead-hook {
          margin: 14px 0 0;
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(232,224,212,0.5);
        }

        .fieldr-home__cta-row {
          margin-top: 26px;
          display: flex;
          align-items: center;
          justify-content: flex-start;
          gap: 18px;
          flex-wrap: wrap;
        }

        .fieldr-home__primary-cta {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 8px;
          padding: 14px 30px;
          background: linear-gradient(135deg, var(--sienna), var(--sienna-lt));
          color: var(--bright);
          font-family: var(--sans);
          font-size: 14px;
          font-weight: 500;
          line-height: 1;
          cursor: pointer;
          text-decoration: none;
          box-shadow: 0 18px 40px rgba(184,83,46,0.28);
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
          border: 1px solid rgba(255,255,255,0.18);
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
          background: rgba(14,12,10,0.5);
        }

        .fieldr-home__secondary-cta:hover {
          color: var(--sienna-lt);
          border-color: rgba(193,82,42,0.35);
          transform: translateY(-1px);
        }

        .fieldr-home__meta {
          margin-top: 24px;
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(232,224,212,0.4);
        }

        .fieldr-home__hero-readout {
          margin-top: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: flex-start;
          gap: 10px;
          flex-wrap: wrap;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 999px;
          background: rgba(10,9,8,0.7);
          backdrop-filter: blur(10px);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.02), 0 10px 26px rgba(0,0,0,0.18);
          padding: 10px 14px;
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--body);
        }

        .fieldr-home__hero-panel {
          position: relative;
          width: min(100%, 420px);
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.1);
          background: linear-gradient(180deg, rgba(22,19,17,0.92) 0%, rgba(14,12,10,0.98) 100%);
          box-shadow: 0 24px 80px rgba(0,0,0,0.5);
          padding: 22px;
          backdrop-filter: blur(16px);
        }

        .fieldr-home__hero-panel::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 18px;
          border: 1px solid rgba(193,82,42,0.12);
          pointer-events: none;
        }

        .fieldr-home__hero-panel::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 18px;
          background: radial-gradient(circle at 80% 0%, rgba(193,82,42,0.12), transparent 55%);
          pointer-events: none;
        }

        .fieldr-home__panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 18px;
        }

        .fieldr-home__panel-kicker {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(232,224,212,0.55);
        }

        .fieldr-home__panel-sub {
          margin-top: 6px;
          font-size: 12px;
          color: rgba(232,224,212,0.55);
          font-weight: 300;
        }

        .fieldr-home__panel-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          border-radius: 999px;
          background: rgba(193,82,42,0.14);
          border: 1px solid rgba(193,82,42,0.35);
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(193,82,42,0.85);
        }

        .fieldr-home__panel-dot {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: #4ade80;
          box-shadow: 0 0 0 5px rgba(74,222,128,0.14);
          animation: fieldrPulse 2s ease-in-out infinite;
        }

        .fieldr-home__panel-list {
          display: grid;
          gap: 12px;
        }

        .fieldr-home__panel-stats {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 16px;
        }

        .fieldr-home__panel-stat {
          padding: 10px 12px;
          border-radius: 12px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
        }

        .fieldr-home__panel-stat-value {
          font-family: var(--serif);
          font-size: 18px;
          color: var(--bright);
        }

        .fieldr-home__panel-stat-label {
          margin-top: 4px;
          font-family: var(--mono);
          font-size: 8px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(232,224,212,0.45);
        }

        .fieldr-home__panel-item {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          border-radius: 12px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
        }

        .fieldr-home__panel-item-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: rgba(232,224,212,0.4);
        }

        .fieldr-home__panel-item-dot.is-alert {
          background: rgba(193,82,42,0.9);
          box-shadow: 0 0 0 4px rgba(193,82,42,0.2);
        }

        .fieldr-home__panel-item-dot.is-warning {
          background: rgba(232,193,90,0.9);
          box-shadow: 0 0 0 4px rgba(232,193,90,0.18);
        }

        .fieldr-home__panel-title {
          font-size: 13px;
          font-weight: 500;
          color: var(--bright);
        }

        .fieldr-home__panel-detail {
          margin-top: 4px;
          font-size: 12px;
          line-height: 1.6;
          color: rgba(232,224,212,0.55);
          font-weight: 300;
        }

        .fieldr-home__panel-status {
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(232,224,212,0.45);
          white-space: nowrap;
        }

        .fieldr-home__panel-status.is-alert {
          color: rgba(193,82,42,0.9);
        }

        .fieldr-home__panel-status.is-warning {
          color: rgba(232,193,90,0.8);
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
          grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
          gap: 52px;
          align-items: start;
        }

        .fieldr-home__log-headline {
          margin: 10px 0 0;
          font-family: var(--serif);
          font-size: 36px;
          line-height: 1.2;
          font-style: italic;
          color: var(--bright);
        }

        .fieldr-home__log-copy {
          margin-top: 16px;
          max-width: 420px;
          font-size: 14px;
          line-height: 1.75;
          color: rgba(232,224,212,0.68);
        }

        .fieldr-home__log-stats {
          margin-top: 24px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }

        .fieldr-home__log-stat {
          padding: 14px 16px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
        }

        .fieldr-home__log-stat-value {
          font-family: var(--serif);
          font-size: 22px;
          font-style: italic;
          color: var(--bright);
        }

        .fieldr-home__log-stat-label {
          margin-top: 6px;
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--dim);
        }

        .fieldr-home__log-feed {
          position: relative;
          z-index: 1;
          padding: 18px 22px 8px;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(12,11,10,0.72);
          box-shadow: 0 30px 80px rgba(0,0,0,0.45);
        }

        .fieldr-home__log-feed-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 16px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          margin-bottom: 4px;
        }

        .fieldr-home__log-feed-title {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(232,224,212,0.6);
        }

        .fieldr-home__log-feed-meta {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(232,224,212,0.4);
        }

        .fieldr-home__log-entry {
          display: grid;
          grid-template-columns: 78px 10px minmax(0, 1fr);
          gap: 18px;
          align-items: start;
          padding: 18px 0;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          transition: transform 220ms ease, border-color 220ms ease, background 220ms ease;
        }

        .fieldr-home__log-entry.is-featured {
          margin: 8px 0;
          padding: 18px 14px;
          border: 1px solid rgba(193,82,42,0.35);
          border-left: 3px solid var(--sienna);
          border-radius: 10px;
          background: rgba(184,83,46,0.12);
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

        .fieldr-home__final-cta {
          padding: 96px 52px;
          border-top: 1px solid var(--rule);
          background: radial-gradient(circle at 20% 20%, rgba(193,82,42,0.16), transparent 55%), #161310;
          position: relative;
          overflow: hidden;
        }

        .fieldr-home__final-cta::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 75% 10%, rgba(255,255,255,0.06), transparent 45%);
          pointer-events: none;
        }

        .fieldr-home__final-frame {
          position: relative;
          max-width: 760px;
          margin: 0 auto;
          padding: 72px 84px;
          text-align: center;
          border-radius: 24px;
          border: 1px solid rgba(255,255,255,0.1);
          background: linear-gradient(180deg, rgba(24,20,18,0.92) 0%, rgba(12,10,9,0.96) 100%);
          box-shadow: 0 40px 120px rgba(0,0,0,0.55);
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
          margin-bottom: 22px;
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
          font-size: clamp(42px, 4.6vw, 52px);
          line-height: 1.06;
          font-style: italic;
          font-weight: 900;
          color: #efe5d4;
          letter-spacing: -0.02em;
          white-space: pre-line;
        }

        .fieldr-home__final-copy {
          margin: 16px auto 0;
          max-width: 420px;
          font-size: 14.5px;
          line-height: 1.7;
          font-weight: 300;
          color: rgba(239,229,212,0.55);
        }

        .fieldr-home__final-copy span {
          color: rgba(239,229,212,0.7);
        }

        .fieldr-home__final-button {
          margin-top: 30px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 10px;
          padding: 14px 40px;
          background: #c1522a;
          color: #fff;
          font-family: var(--sans);
          font-size: 14px;
          font-weight: 500;
          line-height: 1;
          text-decoration: none;
          transition: transform 180ms ease, box-shadow 180ms ease;
          box-shadow: 0 18px 42px rgba(193,82,42,0.3);
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
          margin-top: 36px;
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
          .fieldr-home__log-grid {
            grid-template-columns: 1fr;
          }

          .fieldr-home__hero-grid {
            grid-template-columns: 1fr;
          }

          .fieldr-home__hero-right {
            justify-content: flex-start;
            margin-top: 28px;
          }

          .fieldr-home__log-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
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

          .fieldr-home__hero-panel {
            width: 100%;
          }

          .fieldr-home__panel-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .fieldr-home__log-stats {
            grid-template-columns: 1fr;
          }

          .fieldr-home__log-feed {
            padding: 16px 16px 8px;
          }

          .fieldr-home__log-feed-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 6px;
          }

          .fieldr-home__section-labelrow {
            flex-wrap: wrap;
            gap: 10px;
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
          <div className="fieldr-home__hero-shell">
            <div className="fieldr-home__hero-grid">
              <div className="fieldr-home__hero-left">
                <p className="fieldr-home__eyebrow" data-home-reveal="eyebrow">Arbor · Operations agent for GCs</p>
                <h1 className="fieldr-home__headline" data-home-reveal="headline">
                  <AnimatedWords as="span" text="Turn field chatter into" />
                  {' '}
                  <em>
                    <AnimatedWords as="span" text="approved revenue." />
                  </em>
                </h1>
                <p className="fieldr-home__subhead" data-home-reveal="subhead">
                  Arbor captures calls, texts, voice notes, and uploads, extracts what changed, and drafts the next move before the job moves on.
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

              <div className="fieldr-home__hero-right">
                <div className="fieldr-home__hero-panel" data-home-panel>
                  <div className="fieldr-home__panel-header">
                    <div>
                      <div className="fieldr-home__panel-kicker">Live queue snapshot</div>
                      <div className="fieldr-home__panel-sub">Synced to active jobs</div>
                    </div>
                    <span className="fieldr-home__panel-pill">
                      <span className="fieldr-home__panel-dot" aria-hidden="true" />
                      Agent live
                    </span>
                  </div>
                  <div className="fieldr-home__panel-stats">
                    <div className="fieldr-home__panel-stat">
                      <div className="fieldr-home__panel-stat-value">7</div>
                      <div className="fieldr-home__panel-stat-label">Active jobs</div>
                    </div>
                    <div className="fieldr-home__panel-stat">
                      <div className="fieldr-home__panel-stat-value">3</div>
                      <div className="fieldr-home__panel-stat-label">Items queued</div>
                    </div>
                    <div className="fieldr-home__panel-stat">
                      <div className="fieldr-home__panel-stat-value">$2.1k</div>
                      <div className="fieldr-home__panel-stat-label">Scope at risk</div>
                    </div>
                  </div>
                  <div className="fieldr-home__panel-list">
                    {heroPanelItems.map((item) => (
                      <div key={item.title} className="fieldr-home__panel-item" data-home-panel-item>
                        <span className={`fieldr-home__panel-item-dot${item.tone === 'alert' ? ' is-alert' : ''}${item.tone === 'warning' ? ' is-warning' : ''}`} aria-hidden="true" />
                        <div>
                          <div className="fieldr-home__panel-title">{item.title}</div>
                          <div className="fieldr-home__panel-detail">{item.detail}</div>
                        </div>
                        <span className={`fieldr-home__panel-status${item.tone === 'alert' ? ' is-alert' : ''}${item.tone === 'warning' ? ' is-warning' : ''}`}>
                          {item.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="fieldr-home__section fieldr-home__log-section">
          <div className="fieldr-home__section-inner fieldr-home__log-grid">
            <div data-home-log-copy>
              <div className="fieldr-home__section-labelrow" style={{ marginBottom: '22px' }}>
                <span className="fieldr-home__section-label">Live capture feed</span>
                <div className="fieldr-home__section-rule" aria-hidden="true" />
              </div>
              <h2 className="fieldr-home__log-headline">Live capture, queued for approval.</h2>
              <p className="fieldr-home__log-copy">
                Every inbound message is parsed, scoped, and routed into the decision queue with context attached.
              </p>
              <div className="fieldr-home__log-stats">
                {logStats.map((stat) => (
                  <div key={stat.label} className="fieldr-home__log-stat">
                    <div className="fieldr-home__log-stat-value">{stat.value}</div>
                    <div className="fieldr-home__log-stat-label">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="fieldr-home__log-feed">
              <div className="fieldr-home__log-feed-header">
                <span className="fieldr-home__log-feed-title">Activity feed</span>
                <span className="fieldr-home__log-feed-meta">Last capture 2m ago</span>
              </div>
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
              Ready to run the agent on a live job?
            </h2>

            <p className="fieldr-home__final-copy">
              Arbor is running in early access for GCs in Chattanooga. <span>Twenty minutes. No commitment. See the queue move in real time.</span>
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
