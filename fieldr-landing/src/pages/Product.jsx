import { useLayoutEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { BOOK_DEMO_HREF } from '../components/siteLinks'
import { SmartLink } from '../components/SmartLink'

const ownerRows = [
  {
    label: 'Catch what changed',
    copy: 'Calls, texts, and field notes stop living in inboxes and start showing up where the office can act on them.',
  },
  {
    label: 'Get the number ready faster',
    copy: 'When the work changes, the draft gets prepared before the job moves on and the billing window closes.',
  },
  {
    label: 'Leave a clear trail',
    copy: 'Quotes, follow-ups, and paperwork stay tied to the job so the owner is not relying on memory to close things out.',
  },
]

const metrics = [
  { label: 'Open queue', value: '3', meta: 'Needs review', tone: 'var(--ochre-lt)' },
  { label: 'Active quotes', value: '5', meta: 'Drafts and sends in flight', tone: 'var(--body)' },
  { label: 'Follow-ups due', value: '7', meta: 'Needs pressure', tone: 'var(--ochre-lt)' },
  { label: 'Active jobs', value: '3', meta: 'Work in motion', tone: 'var(--body)' },
]

const recentJobs = [
  { name: 'Hartley reroof', status: 'active', meta: 'active · 8 minutes ago' },
  { name: 'Ridgeview addition', status: 'quoted', meta: 'quoted · 5 hours ago' },
  { name: 'Rivergate tenant finish', status: 'active', meta: 'active · 5 hours ago' },
  { name: 'Cedar Bluff repair', status: 'quoted', meta: 'quoted · 1 day ago' },
]

const feedItems = [
  {
    code: 'C',
    tone: 'green',
    title: 'Hartley flashing change',
    badge: 'Urgent',
    copy:
      'Hartley - sub wants to change flashing material at the chimney and add $320 to the estimate before the insurance supplement goes out.',
    meta: 'Hartley reroof · 21 minutes ago',
  },
  {
    code: 'T',
    tone: 'amber',
    title: 'Owner asking about upgraded windows',
    copy:
      'Ridgeview - owner texted asking if the premium window package can still hit the current schedule and wants revised pricing before tomorrow.',
    meta: 'Ridgeview addition · 4 hours ago',
  },
  {
    code: 'U',
    tone: 'muted',
    title: 'Rivergate reflected ceiling note',
    copy:
      'Rivergate - uploaded architect markup shows lighting moves and a ceiling grid reset. Draft is ready but needs GC eyes before it goes out.',
    meta: 'Rivergate tenant finish · 6 hours ago',
  },
]

const activityLines = [
  'initialized contractor runtime Mar 19 @ 12:07',
  'drafted Hartley flashing supplement from call Mar 19 @ 20:46',
  'holding Atlas WhatsApp thread until PM markup lands Mar 19 @ 20:53',
  'waiting for contractor approval on 2 open items',
]

const pricingRows = [
  { key: 'Flashing labor', value: '$85 / hr', confidence: 5 },
  { key: 'Material markup', value: '22%', confidence: 4 },
  { key: 'Preferred shingle', value: 'GAF Timberline HDZ', confidence: 5 },
]

function feedTone(tone) {
  if (tone === 'green') {
    return { block: 'var(--moss-bg)', text: 'var(--moss-lt)' }
  }
  if (tone === 'amber') {
    return { block: 'rgba(184,144,42,0.14)', text: 'var(--ochre-lt)' }
  }
  return { block: 'rgba(255,255,255,0.06)', text: 'var(--body)' }
}

function jobDot(status) {
  if (status === 'active') {
    return 'var(--moss-lt)'
  }
  if (status === 'quoted') {
    return 'var(--muted)'
  }
  return 'var(--dim)'
}

export default function Product() {
  const rootRef = useRef(null)

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const timeline = gsap.timeline({ defaults: { ease: 'power2.out' } })

      timeline
        .from('[data-product-reveal="eyebrow"]', { y: 18, opacity: 0, duration: 0.45 })
        .from('[data-product-reveal="headline"]', { y: 30, opacity: 0, duration: 0.72 }, '-=0.18')
        .from('[data-product-reveal="subhead"]', { y: 20, opacity: 0, duration: 0.56 }, '-=0.44')
        .from('[data-product-reveal="proof"]', { y: 16, opacity: 0, duration: 0.44 }, '-=0.34')
        .from('[data-product-reveal="cta"]', { y: 16, opacity: 0, duration: 0.42 }, '-=0.3')
        .from('.fieldr-product__hero-card', { y: 26, opacity: 0, duration: 0.58 }, '-=0.46')
        .from('.fieldr-product__hero-card-row', { y: 12, opacity: 0, duration: 0.36, stagger: 0.07 }, '-=0.3')
        .from('.fieldr-product__frame', { y: 36, opacity: 0, scale: 0.988, duration: 0.74 }, '-=0.28')
        .from('.fieldr-product__metric', { y: 10, opacity: 0, duration: 0.26, stagger: 0.05 }, '-=0.36')
        .from('.fieldr-product__feed-item', { y: 12, opacity: 0, duration: 0.3, stagger: 0.06 }, '-=0.26')
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
          padding: 112px 40px 140px;
          border-bottom: 1px solid var(--rule);
        }

        .fieldr-product__header::before {
          content: '';
          position: absolute;
          inset: -12% auto auto 0;
          width: 58%;
          height: 460px;
          background: radial-gradient(circle at 26% 30%, rgba(184,83,46,0.14), transparent 64%);
          pointer-events: none;
        }

        .fieldr-product__inner {
          max-width: 1240px;
          margin: 0 auto;
        }

        .fieldr-product__header-grid {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: minmax(0, 0.95fr) minmax(320px, 0.72fr);
          gap: 56px;
          align-items: end;
        }

        .fieldr-product__header-copy {
          max-width: 760px;
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
          font-family: var(--serif);
          font-size: clamp(40px, 6vw, 54px);
          line-height: 1.06;
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

        .fieldr-product__header-proof {
          margin-top: 18px;
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .fieldr-product__proof-pill {
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

        .fieldr-product__header-demo,
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

        .fieldr-product__header-demo {
          margin-top: 24px;
        }

        .fieldr-product__hero-card {
          border: 1px solid var(--rule2);
          border-radius: 14px;
          background: linear-gradient(180deg, rgba(28,26,23,0.96) 0%, rgba(16,15,13,0.98) 100%);
          box-shadow: 0 26px 64px rgba(0,0,0,0.3);
          overflow: hidden;
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
          grid-template-columns: 132px minmax(0, 1fr);
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

        .fieldr-product__replica-wrap {
          max-width: 1240px;
          margin: 0 auto;
          margin-top: -82px;
          padding: 0 40px 96px;
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

        .fieldr-product__agent-shell {
          display: grid;
          grid-template-columns: 274px minmax(0, 1fr);
          min-height: 660px;
          background: #0E0D0C;
        }

        .fieldr-product__agent-sidebar {
          display: flex;
          flex-direction: column;
          min-width: 0;
          border-right: 1px solid var(--rule);
          background: linear-gradient(180deg, #161412 0%, #100F0D 100%);
        }

        .fieldr-product__agent-sidebar-top {
          padding: 18px 20px 16px;
          border-bottom: 1px solid var(--rule);
        }

        .fieldr-product__agent-section-label {
          font-family: var(--mono);
          font-size: 8px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #71675D;
        }

        .fieldr-product__agent-status {
          margin-top: 14px;
          border: 1px solid var(--sienna-bd);
          border-radius: 12px;
          background: rgba(36,24,18,0.88);
          padding: 14px 14px 13px;
        }
        .fieldr-product__agent-status-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 13px;
          color: var(--bright);
        }

        .fieldr-product__agent-status-dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: var(--sienna-lt);
          box-shadow: 0 0 0 6px rgba(184,83,46,0.12);
        }

        .fieldr-product__agent-status-sub {
          margin-top: 8px;
          padding-left: 17px;
          font-family: var(--mono);
          font-size: 10px;
          color: var(--muted);
        }

        .fieldr-product__agent-nav-wrap {
          padding: 18px 14px 8px;
        }

        .fieldr-product__agent-nav {
          margin-top: 8px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .fieldr-product__agent-nav-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 12px;
          border-radius: 10px;
          color: var(--dim);
          font-size: 13px;
          line-height: 1;
        }

        .fieldr-product__agent-nav-item.is-active {
          background: #26221E;
          color: var(--bright);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.04);
        }

        .fieldr-product__agent-nav-left {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .fieldr-product__agent-nav-icon {
          width: 16px;
          display: inline-flex;
          justify-content: center;
          color: inherit;
          font-family: var(--mono);
          font-size: 11px;
        }

        .fieldr-product__agent-nav-badge {
          min-width: 18px;
          padding: 4px 6px;
          border-radius: 6px;
          background: rgba(184,83,46,0.18);
          font-family: var(--mono);
          font-size: 9px;
          text-align: center;
          color: var(--sienna-lt);
        }

        .fieldr-product__agent-jobs {
          margin-top: auto;
          padding: 20px 14px 16px;
        }

        .fieldr-product__agent-jobs-list {
          margin-top: 10px;
          border-top: 1px solid var(--rule);
        }

        .fieldr-product__agent-job {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 10px;
          padding: 14px 6px;
          border-bottom: 1px solid var(--rule);
        }

        .fieldr-product__agent-job-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          margin-top: 5px;
        }

        .fieldr-product__agent-job-name {
          font-size: 12px;
          color: var(--bright);
        }

        .fieldr-product__agent-job-meta {
          margin-top: 6px;
          font-family: var(--mono);
          font-size: 9px;
          line-height: 1.5;
          color: var(--muted);
        }

        .fieldr-product__agent-main {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .fieldr-product__agent-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          min-height: 56px;
          padding: 0 24px;
          border-bottom: 1px solid var(--rule);
          background: rgba(11,10,9,0.98);
        }

        .fieldr-product__agent-toolbar-copy {
          min-width: 0;
        }

        .fieldr-product__agent-toolbar-title {
          font-size: 19px;
          font-weight: 500;
          color: var(--bright);
        }

        .fieldr-product__agent-toolbar-sub {
          margin-top: 6px;
          font-size: 13px;
          color: #A69480;
        }

        .fieldr-product__agent-toolbar-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }

        .fieldr-product__agent-button,
        .fieldr-product__agent-button--ghost {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-radius: 10px;
          padding: 10px 14px;
          font-size: 12px;
          line-height: 1;
          white-space: nowrap;
        }

        .fieldr-product__agent-button--ghost {
          border: 1px solid var(--rule2);
          background: transparent;
          color: var(--body);
        }

        .fieldr-product__agent-button {
          border: 0;
          background: var(--sienna-lt);
          color: var(--bright);
          font-weight: 500;
        }

        .fieldr-product__agent-content {
          display: flex;
          flex-direction: column;
          min-width: 0;
          padding: 0 24px 24px;
        }

        .fieldr-product__agent-metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          border-bottom: 1px solid var(--rule);
        }

        .fieldr-product__metric {
          padding: 22px 24px 24px 0;
          border-right: 1px solid var(--rule);
        }

        .fieldr-product__metric:last-child {
          border-right: 0;
          padding-right: 0;
        }

        .fieldr-product__metric-label {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--muted);
        }

        .fieldr-product__metric-value {
          margin-top: 18px;
          font-size: 28px;
          color: var(--bright);
        }

        .fieldr-product__metric-meta {
          margin-top: 8px;
          font-family: var(--mono);
          font-size: 10px;
        }

        .fieldr-product__agent-alert {
          margin-top: 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          border: 1px solid rgba(184,144,42,0.22);
          border-radius: 8px;
          padding: 12px 16px;
          background: rgba(73,55,20,0.34);
        }

        .fieldr-product__agent-alert-left {
          display: flex;
          align-items: center;
          gap: 12px;
          color: var(--bright);
          font-size: 13px;
        }

        .fieldr-product__agent-alert-icon {
          color: var(--ochre-lt);
          font-family: var(--mono);
        }

        .fieldr-product__agent-alert-link {
          color: var(--sienna-lt);
          font-size: 13px;
          text-decoration: none;
        }

        .fieldr-product__agent-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 292px;
          gap: 18px;
          margin-top: 16px;
          min-width: 0;
        }

        .fieldr-product__agent-panel,
        .fieldr-product__agent-note,
        .fieldr-product__agent-log,
        .fieldr-product__pricing {
          border: 1px solid var(--rule);
          border-radius: 14px;
          background: #171614;
        }

        .fieldr-product__agent-panel {
          overflow: hidden;
        }

        .fieldr-product__agent-panel-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          padding: 18px 24px;
        }

        .fieldr-product__agent-panel-title {
          font-size: 16px;
          color: var(--bright);
        }

        .fieldr-product__agent-panel-sub {
          margin-top: 8px;
          font-size: 13px;
          color: #A69480;
        }

        .fieldr-product__agent-panel-cta {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 10px 14px;
          border: 1px solid var(--rule2);
          border-radius: 12px;
          background: transparent;
          color: var(--body);
          font-size: 12px;
          text-decoration: none;
          white-space: nowrap;
        }

        .fieldr-product__agent-scan {
          height: 3px;
          margin: 0 24px;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.02) 100%);
        }

        .fieldr-product__feed-list {
          padding: 20px 24px 24px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .fieldr-product__feed-item {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          gap: 16px;
          align-items: start;
          border: 1px solid var(--rule2);
          border-radius: 14px;
          background: rgba(255,255,255,0.02);
          padding: 16px 18px;
        }

        .fieldr-product__feed-icon {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--mono);
          font-size: 11px;
        }

        .fieldr-product__feed-title-row {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .fieldr-product__feed-title {
          font-size: 14px;
          color: var(--bright);
        }

        .fieldr-product__feed-badge {
          border-radius: 7px;
          padding: 4px 7px;
          background: rgba(184,144,42,0.18);
          font-family: var(--mono);
          font-size: 9px;
          color: var(--ochre-lt);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .fieldr-product__feed-copy {
          margin-top: 10px;
          font-size: 13px;
          line-height: 1.6;
          color: #B9AA97;
        }

        .fieldr-product__feed-meta {
          margin-top: 12px;
          font-family: var(--mono);
          font-size: 10px;
          color: var(--muted);
        }

        .fieldr-product__feed-arrow {
          color: var(--muted);
          font-size: 18px;
          line-height: 1;
          padding-top: 2px;
        }

        .fieldr-product__agent-side {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .fieldr-product__agent-note,
        .fieldr-product__agent-log,
        .fieldr-product__pricing {
          padding: 16px;
        }

        .fieldr-product__agent-note {
          background: rgba(38,19,10,0.52);
          border-color: rgba(184,83,46,0.14);
        }

        .fieldr-product__agent-note-title {
          margin-top: 10px;
          font-size: 14px;
          line-height: 1.45;
          color: var(--bright);
        }

        .fieldr-product__agent-note-copy {
          margin-top: 8px;
          font-size: 13px;
          line-height: 1.65;
          color: var(--body);
        }

        .fieldr-product__agent-note-button {
          margin-top: 16px;
          width: 100%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--sienna-bd);
          border-radius: 10px;
          padding: 11px 14px;
          background: transparent;
          color: var(--sienna-lt);
          font-size: 12px;
          text-decoration: none;
        }

        .fieldr-product__agent-log-lines {
          margin: 12px 0 0;
          padding: 0;
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .fieldr-product__agent-log-line {
          position: relative;
          padding-left: 16px;
          font-family: var(--mono);
          font-size: 10px;
          line-height: 1.75;
          color: var(--muted);
        }

        .fieldr-product__agent-log-line::before {
          content: '-';
          position: absolute;
          left: 0;
          top: 0;
          color: #6A6157;
        }

        .fieldr-product__agent-log-line.is-live {
          color: var(--bright);
        }

        .fieldr-product__agent-log-line.is-live::before {
          content: '!';
          color: var(--sienna-lt);
        }

        .fieldr-product__pricing-title {
          margin-top: 10px;
          font-size: 14px;
          color: var(--bright);
        }

        .fieldr-product__pricing-list {
          margin-top: 12px;
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        .fieldr-product__pricing-row {
          padding: 12px 0;
          border-top: 1px solid var(--rule);
        }

        .fieldr-product__pricing-row:first-child {
          border-top: 0;
          padding-top: 0;
        }

        .fieldr-product__pricing-top {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: baseline;
        }

        .fieldr-product__pricing-key {
          font-size: 12px;
          color: var(--body);
        }

        .fieldr-product__pricing-value {
          font-family: var(--mono);
          font-size: 9px;
          color: var(--muted);
          text-align: right;
        }

        .fieldr-product__pricing-bar {
          display: flex;
          gap: 2px;
          margin-top: 9px;
        }

        .fieldr-product__pricing-segment {
          width: 12px;
          height: 2px;
          background: var(--rule2);
        }

        .fieldr-product__pricing-segment.is-filled {
          background: var(--moss);
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

        @media (max-width: 1120px) {
          .fieldr-product__header-grid,
          .fieldr-product__agent-grid {
            grid-template-columns: 1fr;
          }

          .fieldr-product__header {
            padding-bottom: 120px;
          }

          .fieldr-product__hero-card {
            max-width: 640px;
          }
        }

        @media (max-width: 860px) {
          .fieldr-product__header,
          .fieldr-product__replica-wrap,
          .fieldr-product__cta {
            padding-left: 20px;
            padding-right: 20px;
          }

          .fieldr-product__header {
            padding-top: 104px;
            padding-bottom: 96px;
          }

          .fieldr-product__hero-card-row {
            grid-template-columns: 1fr;
            gap: 10px;
          }

          .fieldr-product__header-demo,
          .fieldr-product__cta-button {
            width: min(100%, 280px);
          }

          .fieldr-product__replica-wrap {
            margin-top: -44px;
          }

          .fieldr-product__frame {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }

          .fieldr-product__agent-shell {
            min-width: 1180px;
            grid-template-columns: 274px minmax(0, 1fr);
          }
        }
      `}</style>

      <main ref={rootRef} className="fieldr-product" aria-label="Fieldr product page">
        <section className="fieldr-product__header">
          <div className="fieldr-product__inner fieldr-product__header-grid">
            <div className="fieldr-product__header-copy">
              <p className="fieldr-product__eyebrow" data-product-reveal="eyebrow">
                Product preview
              </p>
              <h1 className="fieldr-product__headline" data-product-reveal="headline">
                The tool that keeps things from slipping through.
              </h1>
              <p className="fieldr-product__subhead" data-product-reveal="subhead">
                One place to catch field updates, pricing changes, and follow-ups before they turn into missed
                scope, unbilled work, or forgotten promises.
              </p>
              <div className="fieldr-product__header-proof" data-product-reveal="proof">
                <span className="fieldr-product__proof-pill">Roofing</span>
                <span className="fieldr-product__proof-pill">HVAC</span>
                <span className="fieldr-product__proof-pill">Electrical</span>
                <span className="fieldr-product__proof-pill">Plumbing</span>
              </div>
              <SmartLink to={BOOK_DEMO_HREF} className="fieldr-product__header-demo" data-product-reveal="cta">
                Book a Demo
              </SmartLink>
            </div>

            <aside className="fieldr-product__hero-card" aria-label="What owners care about">
              <div className="fieldr-product__hero-card-head">
                <div className="fieldr-product__hero-card-label">What owners care about</div>
                <div className="fieldr-product__hero-card-title">
                  Keep the office caught up without asking the crew to change how they work.
                </div>
                <div className="fieldr-product__hero-card-copy">
                  Fieldr is built for the handoff between the field and the office. It catches what changed, gets the
                  number ready faster, and leaves a clean trail behind.
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

        <section className="fieldr-product__replica-wrap">
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

            <div className="fieldr-product__agent-shell">
              <aside className="fieldr-product__agent-sidebar">
                <div className="fieldr-product__agent-sidebar-top">
                  <div className="fieldr-product__agent-section-label">Agent</div>
                  <div className="fieldr-product__agent-status">
                    <div className="fieldr-product__agent-status-title">
                      <span className="fieldr-product__agent-status-dot" aria-hidden="true" />
                      <span>GC Agent · Active</span>
                    </div>
                    <div className="fieldr-product__agent-status-sub">Monitoring · 2 open items</div>
                  </div>
                </div>

                <div className="fieldr-product__agent-nav-wrap">
                  <div className="fieldr-product__agent-section-label">Workspace</div>
                  <div className="fieldr-product__agent-nav">
                    <div className="fieldr-product__agent-nav-item is-active">
                      <span className="fieldr-product__agent-nav-left">
                        <span className="fieldr-product__agent-nav-icon">[]</span>
                        <span>Today</span>
                      </span>
                    </div>
                    <div className="fieldr-product__agent-nav-item">
                      <span className="fieldr-product__agent-nav-left">
                        <span className="fieldr-product__agent-nav-icon">==</span>
                        <span>Queue</span>
                      </span>
                      <span className="fieldr-product__agent-nav-badge">3</span>
                    </div>
                    <div className="fieldr-product__agent-nav-item">
                      <span className="fieldr-product__agent-nav-left">
                        <span className="fieldr-product__agent-nav-icon">##</span>
                        <span>Quotes</span>
                      </span>
                    </div>
                    <div className="fieldr-product__agent-nav-item">
                      <span className="fieldr-product__agent-nav-left">
                        <span className="fieldr-product__agent-nav-icon">//</span>
                        <span>Jobs</span>
                      </span>
                    </div>
                  </div>

                  <div className="fieldr-product__agent-section-label" style={{ marginTop: '20px' }}>
                    Insights
                  </div>
                  <div className="fieldr-product__agent-nav">
                    <div className="fieldr-product__agent-nav-item">
                      <span className="fieldr-product__agent-nav-left">
                        <span className="fieldr-product__agent-nav-icon">||</span>
                        <span>Analytics</span>
                      </span>
                    </div>
                    <div className="fieldr-product__agent-nav-item">
                      <span className="fieldr-product__agent-nav-left">
                        <span className="fieldr-product__agent-nav-icon">::</span>
                        <span>Job history</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="fieldr-product__agent-jobs">
                  <div className="fieldr-product__agent-section-label">Recent jobs</div>
                  <div className="fieldr-product__agent-jobs-list">
                    {recentJobs.map((job) => (
                      <div key={job.name} className="fieldr-product__agent-job">
                        <span
                          className="fieldr-product__agent-job-dot"
                          style={{ background: jobDot(job.status) }}
                          aria-hidden="true"
                        />
                        <div>
                          <div className="fieldr-product__agent-job-name">{job.name}</div>
                          <div className="fieldr-product__agent-job-meta">{job.meta}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </aside>

              <div className="fieldr-product__agent-main">
                <div className="fieldr-product__agent-toolbar">
                  <div className="fieldr-product__agent-toolbar-copy">
                    <div className="fieldr-product__agent-toolbar-title">Today</div>
                    <div className="fieldr-product__agent-toolbar-sub">
                      The agent is already watching the operation. Start with what needs a decision.
                    </div>
                  </div>
                  <div className="fieldr-product__agent-toolbar-actions">
                    <button type="button" className="fieldr-product__agent-button--ghost">
                      Import transcript
                    </button>
                    <button type="button" className="fieldr-product__agent-button">
                      New quote
                    </button>
                  </div>
                </div>

                <div className="fieldr-product__agent-content">
                  <div className="fieldr-product__agent-metrics">
                    {metrics.map((metric) => (
                      <div key={metric.label} className="fieldr-product__metric">
                        <div className="fieldr-product__metric-label">{metric.label}</div>
                        <div className="fieldr-product__metric-value">{metric.value}</div>
                        <div className="fieldr-product__metric-meta" style={{ color: metric.tone }}>
                          {metric.meta}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="fieldr-product__agent-alert">
                    <div className="fieldr-product__agent-alert-left">
                      <span className="fieldr-product__agent-alert-icon">!</span>
                      <span>1 item needs immediate review</span>
                    </div>
                    <a href="/" onClick={(event) => event.preventDefault()} className="fieldr-product__agent-alert-link">
                      Go to queue {'->'}
                    </a>
                  </div>

                  <div className="fieldr-product__agent-grid">
                    <section className="fieldr-product__agent-panel">
                      <div className="fieldr-product__agent-panel-head">
                        <div>
                          <div className="fieldr-product__agent-panel-title">Agent feed</div>
                          <div className="fieldr-product__agent-panel-sub">
                            Watching live for Caleb · Thursday, March 19
                          </div>
                        </div>
                        <a href="/" onClick={(event) => event.preventDefault()} className="fieldr-product__agent-panel-cta">
                          Open queue
                        </a>
                      </div>
                      <div className="fieldr-product__agent-scan" aria-hidden="true" />
                      <div className="fieldr-product__feed-list">
                        {feedItems.map((item) => {
                          const colors = feedTone(item.tone)

                          return (
                            <article key={item.title} className="fieldr-product__feed-item">
                              <div
                                className="fieldr-product__feed-icon"
                                style={{ background: colors.block, color: colors.text }}
                                aria-hidden="true"
                              >
                                {item.code}
                              </div>
                              <div>
                                <div className="fieldr-product__feed-title-row">
                                  <div className="fieldr-product__feed-title">{item.title}</div>
                                  {item.badge ? <span className="fieldr-product__feed-badge">{item.badge}</span> : null}
                                </div>
                                <div className="fieldr-product__feed-copy">{item.copy}</div>
                                <div className="fieldr-product__feed-meta">{item.meta}</div>
                              </div>
                              <div className="fieldr-product__feed-arrow">-&gt;</div>
                            </article>
                          )
                        })}
                      </div>
                    </section>

                    <div className="fieldr-product__agent-side">
                      <section className="fieldr-product__agent-note">
                        <div className="fieldr-product__agent-section-label">Today</div>
                        <div className="fieldr-product__agent-note-title">
                          Pull in the person routing calls or owning customer follow-through.
                        </div>
                        <div className="fieldr-product__agent-note-copy">
                          Invite the office in so the agent sees the real operating context, not just one person's
                          inbox.
                        </div>
                        <a href="/" onClick={(event) => event.preventDefault()} className="fieldr-product__agent-note-button">
                          Invite teammate
                        </a>
                      </section>

                      <section className="fieldr-product__agent-log">
                        <div className="fieldr-product__agent-section-label">Agent activity</div>
                        <ul className="fieldr-product__agent-log-lines">
                          {activityLines.map((line, index) => (
                            <li
                              key={line}
                              className={`fieldr-product__agent-log-line${index === activityLines.length - 1 ? ' is-live' : ''}`}
                            >
                              {line}
                            </li>
                          ))}
                        </ul>
                      </section>

                      <section className="fieldr-product__pricing">
                        <div className="fieldr-product__agent-section-label">Pricing memory</div>
                        <div className="fieldr-product__pricing-title">Patterns the office already approved.</div>
                        <div className="fieldr-product__pricing-list">
                          {pricingRows.map((row) => (
                            <div key={row.key} className="fieldr-product__pricing-row">
                              <div className="fieldr-product__pricing-top">
                                <div className="fieldr-product__pricing-key">{row.key}</div>
                                <div className="fieldr-product__pricing-value">{row.value}</div>
                              </div>
                              <div className="fieldr-product__pricing-bar" aria-hidden="true">
                                {Array.from({ length: 5 }, (_, index) => (
                                  <span
                                    key={`${row.key}-${index}`}
                                    className={`fieldr-product__pricing-segment${index < row.confidence ? ' is-filled' : ''}`}
                                  />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>
                  </div>
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





