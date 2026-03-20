import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { BOOK_DEMO_FORM_ENDPOINT } from '../components/siteLinks'

const biggestGapOptions = [
  'Losing track of field updates and changes',
  'Quotes taking too long to send',
  'Missing follow-ups and losing jobs',
  'Paperwork and document chaos',
]

function buildMailto(values) {
  const subject = encodeURIComponent(`Fieldr demo request - ${values.company || values.name || 'New lead'}`)
  const body = encodeURIComponent(
    [
      `Name: ${values.name}`,
      `Company: ${values.company}`,
      `Email: ${values.email}`,
      `Phone: ${values.phone}`,
      `Biggest gap: ${values.biggestGap}`,
      '',
      'Notes:',
      values.notes || '-',
    ].join('\n'),
  )
  return `mailto:calebventura845@gmail.com?subject=${subject}&body=${body}`
}

export default function BookDemo() {
  const [values, setValues] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    biggestGap: biggestGapOptions[0],
    notes: '',
  })
  const [submitState, setSubmitState] = useState('idle')
  const [errorText, setErrorText] = useState('')
  const rootRef = useRef(null)

  const hasEndpoint = Boolean(BOOK_DEMO_FORM_ENDPOINT)
  const canSubmit = useMemo(() => values.name.trim() && values.company.trim() && values.email.trim(), [values])

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power2.out' } })

      tl.from('[data-demo-reveal="eyebrow"]', { y: 16, opacity: 0, duration: 0.34 })
        .from('[data-demo-reveal="headline"]', { y: 24, opacity: 0, duration: 0.58 }, '-=0.14')
        .from('[data-demo-reveal="subhead"]', { y: 18, opacity: 0, duration: 0.42 }, '-=0.32')
        .from('.fieldr-demo__note', { y: 14, opacity: 0, duration: 0.32, stagger: 0.08 }, '-=0.18')
        .from('.fieldr-demo__form', { y: 24, opacity: 0, duration: 0.5 }, '-=0.34')
    }, rootRef)

    return () => ctx.revert()
  }, [])

  const handleChange = (field) => (event) => {
    setValues((current) => ({ ...current, [field]: event.target.value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!canSubmit) {
      setErrorText('Name, company, and email are required.')
      return
    }

    setErrorText('')

    if (hasEndpoint) {
      try {
        setSubmitState('submitting')
        const response = await fetch(BOOK_DEMO_FORM_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        })
        if (!response.ok) {
          throw new Error(`Request failed with ${response.status}`)
        }
        setSubmitState('submitted')
        return
      } catch (error) {
        setSubmitState('idle')
        setErrorText('Form delivery failed. You can still send the request by email below.')
      }
    }

    window.location.href = buildMailto(values)
    setSubmitState('submitted')
  }

  return (
    <>
      <style>{`
        .fieldr-demo {
          min-height: 100vh;
          padding: 104px 40px 80px;
        }

        .fieldr-demo__inner {
          max-width: 1240px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: minmax(0, 0.86fr) minmax(0, 1.14fr);
          gap: 52px;
          align-items: start;
        }

        .fieldr-demo__eyebrow {
          margin: 0;
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--sienna-lt);
        }

        .fieldr-demo__headline {
          margin: 14px 0 0;
          font-family: var(--serif);
          font-size: clamp(40px, 6vw, 54px);
          line-height: 1.06;
          letter-spacing: -1px;
          color: var(--bright);
        }

        .fieldr-demo__subhead {
          margin: 18px 0 0;
          max-width: 440px;
          font-size: 15px;
          line-height: 1.75;
          font-weight: 300;
          color: var(--body);
        }

        .fieldr-demo__notes {
          margin-top: 28px;
          border: 1px solid var(--rule);
          border-radius: 8px;
          background: linear-gradient(180deg, rgba(24,22,19,0.94) 0%, rgba(17,16,14,0.98) 100%);
          overflow: hidden;
          box-shadow: 0 20px 48px rgba(0,0,0,0.2);
        }

        .fieldr-demo__note {
          padding: 16px 18px;
          border-top: 1px solid var(--rule);
        }

        .fieldr-demo__note:first-child {
          border-top: 0;
        }

        .fieldr-demo__note-kicker {
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--sienna-lt);
        }

        .fieldr-demo__note-title {
          margin-top: 8px;
          font-size: 13px;
          font-weight: 500;
          color: var(--bright);
        }

        .fieldr-demo__note-copy {
          margin-top: 6px;
          font-size: 12px;
          line-height: 1.7;
          font-weight: 300;
          color: var(--body);
        }

        .fieldr-demo__form {
          border: 1px solid var(--rule2);
          border-radius: 10px;
          background: linear-gradient(180deg, rgba(24,22,19,0.96) 0%, rgba(17,16,14,0.98) 100%);
          padding: 24px;
          box-shadow: 0 24px 60px rgba(0,0,0,0.35);
        }

        .fieldr-demo__form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .fieldr-demo__field {
          display: block;
        }

        .fieldr-demo__field--full {
          grid-column: 1 / -1;
        }

        .fieldr-demo__label {
          margin-bottom: 8px;
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--muted);
        }

        .fieldr-demo__input,
        .fieldr-demo__select,
        .fieldr-demo__textarea {
          width: 100%;
          border: 1px solid var(--rule2);
          border-radius: 6px;
          background: rgba(31,29,25,0.82);
          color: var(--bright);
          font-family: var(--sans);
          font-size: 14px;
          outline: none;
          transition: border-color 180ms ease, box-shadow 180ms ease;
        }

        .fieldr-demo__input,
        .fieldr-demo__select {
          height: 44px;
          padding: 0 14px;
        }

        .fieldr-demo__textarea {
          min-height: 132px;
          padding: 12px 14px;
          resize: vertical;
          line-height: 1.7;
        }

        .fieldr-demo__input::placeholder,
        .fieldr-demo__textarea::placeholder {
          color: var(--muted);
        }

        .fieldr-demo__input:focus,
        .fieldr-demo__select:focus,
        .fieldr-demo__textarea:focus {
          border-color: var(--sienna-bd);
          box-shadow: 0 0 0 4px rgba(184,83,46,0.08);
        }

        .fieldr-demo__actions {
          margin-top: 20px;
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }

        .fieldr-demo__submit {
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
          cursor: pointer;
          box-shadow: 0 16px 36px rgba(184,83,46,0.18);
          transition: transform 180ms ease, box-shadow 180ms ease;
        }

        .fieldr-demo__submit:hover:not([disabled]) {
          transform: translateY(-1px);
          box-shadow: 0 20px 42px rgba(184,83,46,0.24);
        }

        .fieldr-demo__submit[disabled] {
          opacity: 0.48;
          cursor: not-allowed;
        }

        .fieldr-demo__meta {
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--muted);
        }

        .fieldr-demo__error {
          margin-top: 14px;
          font-size: 12px;
          color: var(--sienna-lt);
        }

        .fieldr-demo__success {
          margin-top: 14px;
          font-size: 12px;
          color: var(--moss-lt);
        }

        @media (max-width: 960px) {
          .fieldr-demo__inner,
          .fieldr-demo__form-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .fieldr-demo {
            padding: 96px 20px 72px;
          }

          .fieldr-demo__form {
            padding: 18px;
          }

          .fieldr-demo__submit {
            width: min(100%, 280px);
          }
        }
      `}</style>

      <main ref={rootRef} className="fieldr-demo" aria-label="Book a Fieldr demo">
        <div className="fieldr-demo__inner">
          <div>
            <p className="fieldr-demo__eyebrow" data-demo-reveal="eyebrow">Demo request &middot; Field operations</p>
            <h1 className="fieldr-demo__headline" data-demo-reveal="headline">Show us the gap. We&apos;ll show you the loop.</h1>
            <p className="fieldr-demo__subhead" data-demo-reveal="subhead">
              This is a focused product walkthrough, not a sales tour. We&apos;ll map your field-to-office gap, show the queue and quote path, and tell you plainly where Fieldr fits and where it does not yet.
            </p>

            <div className="fieldr-demo__notes">
              <div className="fieldr-demo__note">
                <div className="fieldr-demo__note-kicker">Format</div>
                <div className="fieldr-demo__note-title">20 minutes, product-first</div>
                <div className="fieldr-demo__note-copy">We stay inside capture, queue, quotes, and job history. No fake platform pitch.</div>
              </div>
              <div className="fieldr-demo__note">
                <div className="fieldr-demo__note-kicker">Best fit</div>
                <div className="fieldr-demo__note-title">Contractors losing work between the field and the office</div>
                <div className="fieldr-demo__note-copy">Calls, texts, dictated notes, and uploads are where Fieldr is strongest today.</div>
              </div>
              <div className="fieldr-demo__note">
                <div className="fieldr-demo__note-kicker">Output</div>
                <div className="fieldr-demo__note-title">You leave with a concrete fit / no-fit answer</div>
                <div className="fieldr-demo__note-copy">If the current product is not ready for your workflow, we should say that directly.</div>
              </div>
            </div>
          </div>

          <form className="fieldr-demo__form" onSubmit={handleSubmit}>
            <div className="fieldr-demo__form-grid">
              <label className="fieldr-demo__field">
                <div className="fieldr-demo__label">Name</div>
                <input className="fieldr-demo__input" value={values.name} onChange={handleChange('name')} placeholder="Caleb Ventura" />
              </label>

              <label className="fieldr-demo__field">
                <div className="fieldr-demo__label">Company</div>
                <input className="fieldr-demo__input" value={values.company} onChange={handleChange('company')} placeholder="Ventura Construction" />
              </label>

              <label className="fieldr-demo__field">
                <div className="fieldr-demo__label">Email</div>
                <input className="fieldr-demo__input" type="email" value={values.email} onChange={handleChange('email')} placeholder="name@company.com" />
              </label>

              <label className="fieldr-demo__field">
                <div className="fieldr-demo__label">Phone</div>
                <input className="fieldr-demo__input" type="tel" value={values.phone} onChange={handleChange('phone')} placeholder="(423) 555-0101" />
              </label>

              <label className="fieldr-demo__field fieldr-demo__field--full">
                <div className="fieldr-demo__label">Biggest gap</div>
                <select className="fieldr-demo__select" value={values.biggestGap} onChange={handleChange('biggestGap')}>
                  {biggestGapOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="fieldr-demo__field fieldr-demo__field--full">
                <div className="fieldr-demo__label">Notes</div>
                <textarea
                  className="fieldr-demo__textarea"
                  value={values.notes}
                  onChange={handleChange('notes')}
                  placeholder="Tell us what falls through today: scope changes, quote lag, missed follow-ups, paperwork, or all of it."
                />
              </label>
            </div>

            <div className="fieldr-demo__actions">
              <button type="submit" className="fieldr-demo__submit" disabled={!canSubmit || submitState === 'submitting'}>
                {submitState === 'submitting' ? 'Sending...' : 'Request demo'}
              </button>
              <div className="fieldr-demo__meta">
                {hasEndpoint ? 'Form delivery live' : 'Email handoff fallback active'}
              </div>
            </div>

            {errorText ? <div className="fieldr-demo__error">{errorText}</div> : null}
            {submitState === 'submitted' && !errorText ? <div className="fieldr-demo__success">Request captured. We&apos;ll follow up with the right next step.</div> : null}
          </form>
        </div>
      </main>
    </>
  )
}
