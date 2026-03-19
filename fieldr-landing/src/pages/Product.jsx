import { Link } from 'react-router-dom'
import { APP_FLOW_HREF, BOOK_DEMO_HREF } from '../components/siteLinks'

const featureRows = [
  {
    label: 'Queue',
    title: 'Human-in-the-loop by design',
    body: 'The agent drafts. You decide. Every quote, change order, and follow-up runs through your approval before it reaches the client. Always.',
  },
  {
    label: 'Voice intake',
    title: 'Dictate from the field',
    body: 'Leave a voice note between jobs. Fieldr transcribes, extracts scope, and generates a priced draft - before you get back to the office.',
  },
  {
    label: 'Memory',
    title: 'Pricing that compounds',
    body: 'Every approval writes back to your estimating memory. Labor rates, markup, material preferences - encoded and applied automatically on every future job.',
  },
  {
    label: 'Documents',
    title: 'Structured data from any input',
    body: 'Subcontractor bids, permits, insurance certs, change orders. Fieldr extracts the structured data and tracks what\'s open, what\'s late, and what needs action.',
  },
]

const jobRows = [
  {
    status: 'active',
    color: 'var(--moss)',
    name: 'Hartley reroof',
    customer: 'Megan Hartley',
    queue: '2 open',
    quote: '$8,720',
    next: 'Awaiting sign-off',
  },
  {
    status: 'pending',
    color: 'var(--ochre-lt)',
    name: 'Riverside Commercial',
    customer: 'Riverside Holdings',
    queue: '1 pending',
    quote: '$14,400',
    next: 'Follow-up in 72h',
  },
  {
    status: 'blocked',
    color: 'var(--sienna)',
    name: 'Johnson repair',
    customer: 'Claire Johnson',
    queue: 'blocked',
    quote: '$3,260',
    next: 'Missing insurance cert',
  },
  {
    status: 'active',
    color: 'var(--moss)',
    name: 'Northshore addition',
    customer: 'Eli Bowman',
    queue: 'clear',
    quote: '$21,180',
    next: 'Crew mobilizing',
  },
]

const memoryRows = [
  { key: 'Labor - tear-off', value: '$85 / sq', confidence: 5 },
  { key: 'Material markup', value: '22%', confidence: 4 },
  { key: 'Preferred shingle', value: 'GAF Timberline HDZ', confidence: 5 },
]

export default function Product() {
  return (
    <>
      <style>{`
        .fieldr-product {
          min-height: 100vh;
          padding-top: 56px;
        }

        .fieldr-product__header {
          padding: 120px 40px 80px;
          border-bottom: 1px solid var(--rule);
        }

        .fieldr-product__inner {
          max-width: 1240px;
          margin: 0 auto;
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
          max-width: 500px;
          font-size: 16px;
          line-height: 1.7;
          font-weight: 300;
          color: var(--dim);
        }

        .fieldr-product__header-links {
          margin-top: 24px;
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }

        .fieldr-product__header-demo {
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

        .fieldr-product__header-link {
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--dim);
          text-decoration: none;
        }

        .fieldr-product__replica-wrap {
          max-width: 1000px;
          margin: 0 auto;
          padding: 0 40px 80px;
        }

        .fieldr-product__frame {
          margin-top: -1px;
          overflow: hidden;
          border: 1px solid var(--rule2);
          border-radius: 10px;
          background: var(--surface);
          box-shadow: 0 40px 100px rgba(0,0,0,0.6);
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
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.08em;
          text-align: center;
          color: var(--muted);
          background: var(--surface2);
        }

        .fieldr-product__dash {
          display: grid;
          grid-template-columns: 212px minmax(0, 1fr);
          height: 420px;
          background: var(--bg);
        }

        .fieldr-product__sidebar {
          display: flex;
          flex-direction: column;
          border-right: 1px solid var(--rule);
          background: linear-gradient(180deg, var(--surface) 0%, #11100e 100%);
        }

        .fieldr-product__sidebar-head {
          padding: 20px 18px 16px;
          border-bottom: 1px solid var(--rule);
        }

        .fieldr-product__wordmark {
          font-family: var(--serif);
          font-size: 18px;
          line-height: 1;
          color: var(--bright);
        }

        .fieldr-product__sidebar-sub {
          margin-top: 10px;
          font-family: var(--mono);
          font-size: 8px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--muted);
        }

        .fieldr-product__nav {
          padding: 16px 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .fieldr-product__nav-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          border: 1px solid transparent;
          border-radius: 8px;
          background: transparent;
          color: var(--dim);
          font-size: 12px;
          line-height: 1;
        }

        .fieldr-product__nav-item.is-active {
          border-color: var(--sienna-bd);
          background: var(--sienna-bg);
          color: var(--bright);
        }

        .fieldr-product__nav-badge {
          font-family: var(--mono);
          font-size: 9px;
          color: var(--ochre-lt);
        }

        .fieldr-product__sidebar-user {
          margin-top: auto;
          display: flex;
          align-items: center;
          gap: 10px;
          border-top: 1px solid var(--rule);
          padding: 16px 18px;
        }

        .fieldr-product__avatar {
          width: 30px;
          height: 30px;
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--surface3);
          border: 1px solid var(--rule2);
          font-family: var(--mono);
          font-size: 10px;
          color: var(--bright);
        }

        .fieldr-product__user-meta {
          min-width: 0;
        }

        .fieldr-product__user-name {
          font-size: 12px;
          color: var(--bright);
        }

        .fieldr-product__user-role {
          margin-top: 2px;
          font-size: 10px;
          color: var(--muted);
          font-family: var(--mono);
        }

        .fieldr-product__main {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .fieldr-product__topbar {
          display: grid;
          grid-template-columns: auto auto 1fr auto;
          align-items: center;
          gap: 16px;
          min-height: 52px;
          padding: 0 20px;
          border-bottom: 1px solid var(--rule);
          background: rgba(13,12,10,0.98);
        }

        .fieldr-product__top-title {
          font-family: var(--serif);
          font-size: 24px;
          font-style: italic;
          color: var(--bright);
          letter-spacing: -0.02em;
        }

        .fieldr-product__top-date {
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--muted);
        }

        .fieldr-product__search {
          height: 32px;
          width: 100%;
          border: 1px solid var(--rule2);
          border-radius: 999px;
          padding: 0 14px;
          background: var(--surface2);
          color: var(--dim);
          font-size: 12px;
        }

        .fieldr-product__top-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 5px;
          padding: 10px 16px;
          background: var(--sienna);
          color: var(--bright);
          font-size: 12px;
          font-weight: 500;
          line-height: 1;
        }

        .fieldr-product__workspace {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 248px;
          gap: 0;
          min-height: 0;
          flex: 1;
        }

        .fieldr-product__content {
          padding: 20px;
          border-right: 1px solid var(--rule);
          min-width: 0;
        }

        .fieldr-product__queue-strip {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 18px;
          border: 1px solid var(--rule2);
          border-left: 3px solid var(--sienna);
          border-radius: 8px;
          background: var(--surface);
          padding: 16px 16px 16px 18px;
        }

        .fieldr-product__queue-number {
          font-family: var(--serif);
          font-size: 42px;
          line-height: 0.9;
          font-style: italic;
          color: var(--sienna-lt);
        }

        .fieldr-product__queue-title {
          font-size: 13px;
          color: var(--bright);
        }

        .fieldr-product__queue-sub {
          margin-top: 4px;
          font-size: 11px;
          line-height: 1.6;
          color: var(--dim);
        }

        .fieldr-product__queue-pill {
          border: 1px solid var(--sienna-bd);
          border-radius: 999px;
          padding: 8px 12px;
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--sienna-lt);
          background: var(--sienna-bg);
        }

        .fieldr-product__statrow {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          margin-top: 16px;
          border: 1px solid var(--rule);
          border-radius: 8px;
          overflow: hidden;
          background: var(--surface);
        }

        .fieldr-product__statcell {
          padding: 18px 16px;
          border-right: 1px solid var(--rule);
        }

        .fieldr-product__statcell:last-child {
          border-right: 0;
        }

        .fieldr-product__stat-label {
          font-family: var(--mono);
          font-size: 8px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--muted);
        }

        .fieldr-product__stat-value {
          margin-top: 10px;
          font-family: var(--serif);
          font-size: 34px;
          line-height: 1;
          color: var(--bright);
        }

        .fieldr-product__stat-meta {
          margin-top: 8px;
          font-size: 11px;
          color: var(--dim);
        }

        .fieldr-product__table {
          margin-top: 16px;
          border: 1px solid var(--rule);
          border-radius: 8px;
          overflow: hidden;
          background: var(--surface);
        }

        .fieldr-product__table-head,
        .fieldr-product__table-row {
          display: grid;
          grid-template-columns: 3px minmax(0, 1.45fr) minmax(0, 0.85fr) minmax(0, 0.7fr) minmax(0, 0.85fr) minmax(0, 1fr);
          align-items: stretch;
        }

        .fieldr-product__table-head {
          border-bottom: 1px solid var(--rule);
          background: var(--surface2);
        }

        .fieldr-product__table-head > div {
          padding: 10px 12px;
          font-family: var(--mono);
          font-size: 8px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--muted);
        }

        .fieldr-product__table-row {
          border-bottom: 1px solid var(--rule);
        }

        .fieldr-product__table-row:last-child {
          border-bottom: 0;
        }

        .fieldr-product__stripe {
          align-self: stretch;
        }

        .fieldr-product__cell {
          padding: 12px;
          min-width: 0;
        }

        .fieldr-product__jobname {
          font-size: 12px;
          color: var(--bright);
        }

        .fieldr-product__jobmeta {
          margin-top: 4px;
          font-size: 10px;
          color: var(--muted);
          font-family: var(--mono);
        }

        .fieldr-product__value {
          font-size: 11px;
          color: var(--body);
        }

        .fieldr-product__value--mono {
          font-family: var(--mono);
          color: var(--dim);
          font-size: 10px;
        }

        .fieldr-product__aside {
          padding: 20px 18px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          background: linear-gradient(180deg, var(--surface) 0%, #12110f 100%);
        }

        .fieldr-product__panel {
          border: 1px solid var(--rule);
          border-radius: 8px;
          background: var(--surface2);
          padding: 14px;
        }

        .fieldr-product__panel-label {
          font-family: var(--mono);
          font-size: 8px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--muted);
        }

        .fieldr-product__panel-title {
          margin-top: 10px;
          font-size: 13px;
          color: var(--bright);
        }

        .fieldr-product__panel-body {
          margin-top: 8px;
          font-size: 11px;
          line-height: 1.7;
          color: var(--dim);
        }

        .fieldr-product__briefing-list {
          margin-top: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .fieldr-product__briefing-item {
          padding-top: 10px;
          border-top: 1px solid var(--rule);
        }

        .fieldr-product__briefing-item:first-child {
          padding-top: 0;
          border-top: 0;
        }

        .fieldr-product__briefing-heading {
          font-size: 11px;
          color: var(--bright);
        }

        .fieldr-product__briefing-copy {
          margin-top: 4px;
          font-size: 10px;
          line-height: 1.6;
          color: var(--dim);
        }

        .fieldr-product__memory-rows {
          margin-top: 12px;
          display: flex;
          flex-direction: column;
        }

        .fieldr-product__memory-row {
          padding: 10px 0;
          border-top: 1px solid var(--rule);
        }

        .fieldr-product__memory-row:first-child {
          border-top: 0;
          padding-top: 0;
        }

        .fieldr-product__memory-topline {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: baseline;
        }

        .fieldr-product__memory-key {
          font-size: 11px;
          color: var(--body);
        }

        .fieldr-product__memory-value {
          font-family: var(--mono);
          font-size: 9px;
          color: var(--muted);
          text-align: right;
        }

        .fieldr-product__memory-bar {
          display: flex;
          gap: 1px;
          margin-top: 8px;
        }

        .fieldr-product__memory-segment {
          width: 11px;
          height: 2px;
          background: var(--rule2);
        }

        .fieldr-product__memory-segment.is-filled {
          background: var(--moss);
        }

        .fieldr-product__features {
          max-width: 1000px;
          margin: 0 auto;
          padding: 0 40px 80px;
        }

        .fieldr-product__feature-row {
          display: grid;
          grid-template-columns: 180px minmax(0, 1fr);
          gap: 28px;
          padding: 32px 0;
          border-top: 1px solid var(--rule);
        }

        .fieldr-product__feature-row:last-child {
          border-bottom: 1px solid var(--rule);
        }

        .fieldr-product__feature-label {
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--sienna-lt);
        }

        .fieldr-product__feature-title {
          font-size: 15px;
          font-weight: 500;
          color: var(--bright);
        }

        .fieldr-product__feature-body {
          margin-top: 8px;
          font-size: 13px;
          line-height: 1.7;
          font-weight: 300;
          color: var(--dim);
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

        .fieldr-product__cta-button {
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
          cursor: pointer;
          text-decoration: none;
        }

        .fieldr-product__cta-actions {
          margin-top: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          flex-wrap: wrap;
        }

        .fieldr-product__cta-link {
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--dim);
          text-decoration: none;
        }

        .fieldr-product__cta-note {
          margin-top: 18px;
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--muted);
        }

        @media (max-width: 1080px) {
          .fieldr-product__dash,
          .fieldr-product__workspace,
          .fieldr-product__feature-row {
            grid-template-columns: 1fr;
          }

          .fieldr-product__sidebar {
            display: none;
          }

          .fieldr-product__content {
            border-right: 0;
            border-bottom: 1px solid var(--rule);
          }

          .fieldr-product__topbar {
            grid-template-columns: 1fr;
            justify-items: start;
            gap: 10px;
            padding-top: 14px;
            padding-bottom: 14px;
          }
        }

        @media (max-width: 780px) {
          .fieldr-product__replica-wrap,
          .fieldr-product__features,
          .fieldr-product__header,
          .fieldr-product__cta {
            padding-left: 20px;
            padding-right: 20px;
          }

          .fieldr-product__frame {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }

          .fieldr-product__header-links {
            flex-direction: column;
            align-items: flex-start;
          }

          .fieldr-product__header-demo,
          .fieldr-product__header-link {
            width: min(100%, 280px);
            justify-content: center;
            text-align: center;
          }

          .fieldr-product__cta-button,
          .fieldr-product__cta-link {
            width: min(100%, 280px);
            justify-content: center;
            text-align: center;
          }

          .fieldr-product__dash {
            min-width: 920px;
            grid-template-columns: 212px minmax(0, 1fr);
            height: 420px;
          }

          .fieldr-product__sidebar {
            display: flex;
          }

          .fieldr-product__workspace {
            grid-template-columns: minmax(0, 1fr) 248px;
          }

          .fieldr-product__content {
            border-right: 1px solid var(--rule);
            border-bottom: 0;
          }

          .fieldr-product__topbar {
            grid-template-columns: auto auto 1fr auto;
            justify-items: stretch;
            gap: 16px;
            padding: 0 20px;
            min-height: 52px;
          }
        }
      `}</style>

      <main className="fieldr-product" aria-label="Fieldr product page">
        <section className="fieldr-product__header">
          <div className="fieldr-product__inner">
            <p className="fieldr-product__eyebrow">Product &middot; Agentic workspace</p>
            <h1 className="fieldr-product__headline">The operations layer contractors don&apos;t have.</h1>
            <p className="fieldr-product__subhead">
              One workspace. Every field update captured, queued, quoted, and tracked. Built for the contractor who can&apos;t afford to miss anything.
            </p>
            <div className="fieldr-product__header-links">
              <a href={BOOK_DEMO_HREF} className="fieldr-product__header-demo">
                Book a Demo
              </a>
              <a href={APP_FLOW_HREF} className="fieldr-product__header-link">
                Launch Agent
              </a>
              <Link to="/how-it-works" className="fieldr-product__header-link">
                Review the capture loop
              </Link>
            </div>
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

            <div className="fieldr-product__dash">
              <aside className="fieldr-product__sidebar">
                <div className="fieldr-product__sidebar-head">
                  <div className="fieldr-product__wordmark">Fieldr</div>
                  <div className="fieldr-product__sidebar-sub">agentic operations</div>
                </div>

                <div className="fieldr-product__nav">
                  <div className="fieldr-product__nav-item is-active">Today</div>
                  <div className="fieldr-product__nav-item">
                    <span>Queue</span>
                    <span className="fieldr-product__nav-badge">3</span>
                  </div>
                  <div className="fieldr-product__nav-item">Quotes</div>
                  <div className="fieldr-product__nav-item">Jobs</div>
                  <div className="fieldr-product__nav-item">Analytics</div>
                </div>

                <div className="fieldr-product__sidebar-user">
                  <div className="fieldr-product__avatar">CV</div>
                  <div className="fieldr-product__user-meta">
                    <div className="fieldr-product__user-name">Caleb Ventura</div>
                    <div className="fieldr-product__user-role">Owner / GC</div>
                  </div>
                </div>
              </aside>

              <div className="fieldr-product__main">
                <div className="fieldr-product__topbar">
                  <div className="fieldr-product__top-title">Today</div>
                  <div className="fieldr-product__top-date">Mar 18 &middot; 09:20</div>
                  <input className="fieldr-product__search" value="Search jobs, quotes, queue" readOnly aria-label="Search" />
                  <button type="button" className="fieldr-product__top-button">New quote</button>
                </div>

                <div className="fieldr-product__workspace">
                  <div className="fieldr-product__content">
                    <div className="fieldr-product__queue-strip">
                      <div className="fieldr-product__queue-number">3</div>
                      <div>
                        <div className="fieldr-product__queue-title">Three items surfaced for review</div>
                        <div className="fieldr-product__queue-sub">Agent capture is live. Two changes and one stalled follow-up are waiting on a decision.</div>
                      </div>
                      <div className="fieldr-product__queue-pill">Open queue &rarr;</div>
                    </div>

                    <div className="fieldr-product__statrow">
                      <div className="fieldr-product__statcell">
                        <div className="fieldr-product__stat-label">Active jobs</div>
                        <div className="fieldr-product__stat-value">7</div>
                        <div className="fieldr-product__stat-meta">Crew running across 3 sites</div>
                      </div>
                      <div className="fieldr-product__statcell">
                        <div className="fieldr-product__stat-label">At risk</div>
                        <div className="fieldr-product__stat-value">2</div>
                        <div className="fieldr-product__stat-meta">Waiting on quote response</div>
                      </div>
                      <div className="fieldr-product__statcell">
                        <div className="fieldr-product__stat-label">Blocked</div>
                        <div className="fieldr-product__stat-value">1</div>
                        <div className="fieldr-product__stat-meta">Missing paperwork before send</div>
                      </div>
                    </div>

                    <div className="fieldr-product__table">
                      <div className="fieldr-product__table-head">
                        <div />
                        <div>Job</div>
                        <div>Customer</div>
                        <div>Queue</div>
                        <div>Quote</div>
                        <div>Next action</div>
                      </div>

                      {jobRows.map((row) => (
                        <div key={row.name} className="fieldr-product__table-row">
                          <div className="fieldr-product__stripe" style={{ background: row.color }} />
                          <div className="fieldr-product__cell">
                            <div className="fieldr-product__jobname">{row.name}</div>
                            <div className="fieldr-product__jobmeta">{row.status}</div>
                          </div>
                          <div className="fieldr-product__cell">
                            <div className="fieldr-product__value">{row.customer}</div>
                          </div>
                          <div className="fieldr-product__cell">
                            <div className="fieldr-product__value fieldr-product__value--mono">{row.queue}</div>
                          </div>
                          <div className="fieldr-product__cell">
                            <div className="fieldr-product__value">{row.quote}</div>
                          </div>
                          <div className="fieldr-product__cell">
                            <div className="fieldr-product__value fieldr-product__value--mono">{row.next}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <aside className="fieldr-product__aside">
                    <section className="fieldr-product__panel">
                      <div className="fieldr-product__panel-label">Agent monitor</div>
                      <div className="fieldr-product__panel-title">Two jobs need attention before noon.</div>
                      <div className="fieldr-product__panel-body">Queue is live. Hartley needs flashing approval before the next quote goes out. Riverside needs a follow-up before the window closes.</div>
                      <div className="fieldr-product__briefing-list">
                        <div className="fieldr-product__briefing-item">
                          <div className="fieldr-product__briefing-heading">Hartley reroof</div>
                          <div className="fieldr-product__briefing-copy">Scope delta extracted from site call. +$320 pending review.</div>
                        </div>
                        <div className="fieldr-product__briefing-item">
                          <div className="fieldr-product__briefing-heading">Riverside Commercial</div>
                          <div className="fieldr-product__briefing-copy">No client response in 72h. Follow-up queued.</div>
                        </div>
                      </div>
                    </section>

                    <section className="fieldr-product__panel">
                      <div className="fieldr-product__panel-label">Estimating memory</div>
                      <div className="fieldr-product__panel-title">Three strong patterns loaded.</div>
                      <div className="fieldr-product__memory-rows">
                        {memoryRows.map((row) => (
                          <div key={row.key} className="fieldr-product__memory-row">
                            <div className="fieldr-product__memory-topline">
                              <div className="fieldr-product__memory-key">{row.key}</div>
                              <div className="fieldr-product__memory-value">{row.value}</div>
                            </div>
                            <div className="fieldr-product__memory-bar" aria-hidden="true">
                              {Array.from({ length: 5 }, (_, index) => (
                                <span
                                  key={`${row.key}-${index}`}
                                  className={`fieldr-product__memory-segment${index < row.confidence ? ' is-filled' : ''}`}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </aside>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="fieldr-product__features">
          {featureRows.map((row) => (
            <div key={row.label} className="fieldr-product__feature-row">
              <div className="fieldr-product__feature-label">{row.label}</div>
              <div>
                <div className="fieldr-product__feature-title">{row.title}</div>
                <div className="fieldr-product__feature-body">{row.body}</div>
              </div>
            </div>
          ))}
        </section>

        <section className="fieldr-product__cta">
          <div className="fieldr-product__inner">
            <h2 className="fieldr-product__cta-title">Ready to close the gap?</h2>
            <div className="fieldr-product__cta-actions">
              <a href={BOOK_DEMO_HREF} className="fieldr-product__cta-button">Book a Demo</a>
              <a href={APP_FLOW_HREF} className="fieldr-product__cta-link">Launch Agent</a>
            </div>
            <div className="fieldr-product__cta-note">20 minutes &middot; No commitment &middot; Chattanooga, TN</div>
          </div>
        </section>
      </main>
    </>
  )
}

