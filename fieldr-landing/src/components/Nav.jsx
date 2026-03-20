import { useLayoutEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { gsap } from 'gsap'
import { APP_FLOW_HREF, BOOK_DEMO_HREF } from './siteLinks'
import { SmartLink } from './SmartLink'

const navStyle = {
  position: 'fixed',
  inset: '0 0 auto 0',
  zIndex: 1000,
  height: '56px',
  borderBottom: '1px solid var(--rule)',
  backdropFilter: 'blur(14px)',
  background: 'rgba(13,12,10,0.72)',
}

const innerStyle = {
  height: '100%',
  maxWidth: '1200px',
  margin: '0 auto',
  padding: '0 20px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '16px',
}

const leftStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '26px',
  minWidth: 0,
}

const navLinksStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
  flexWrap: 'wrap',
}

const wordmarkStyle = {
  fontFamily: 'var(--serif)',
  fontSize: '15px',
  lineHeight: 1,
  letterSpacing: '0.01em',
  color: 'var(--bright)',
  textDecoration: 'none',
}

const navLinkBaseStyle = {
  fontFamily: 'var(--mono)',
  fontSize: '9px',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  textDecoration: 'none',
}

const rightStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  flexShrink: 0,
}

const buttonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '32px',
  padding: '7px 18px',
  border: 'none',
  borderRadius: '5px',
  background: 'var(--sienna)',
  color: 'var(--bright)',
  fontFamily: 'var(--sans)',
  fontSize: '12px',
  fontWeight: 500,
  lineHeight: 1,
  cursor: 'pointer',
  textDecoration: 'none',
}

const agentButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '32px',
  padding: '0 14px',
  borderRadius: '999px',
  textDecoration: 'none',
}

const mobileMenuButtonStyle = {
  display: 'none',
  alignItems: 'center',
  justifyContent: 'center',
  width: '32px',
  height: '32px',
  padding: 0,
  border: '1px solid var(--rule2)',
  borderRadius: '5px',
  background: 'rgba(22,20,18,0.9)',
  color: 'var(--bright)',
  cursor: 'pointer',
}

const mobilePanelStyle = {
  borderTop: '1px solid var(--rule)',
  borderBottom: '1px solid var(--rule)',
  background: 'rgba(13,12,10,0.96)',
  padding: '12px 20px 16px',
}

const mobileNavStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
}

const mobileLinkStyle = {
  fontFamily: 'var(--mono)',
  fontSize: '10px',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  textDecoration: 'none',
  color: 'var(--bright)',
  padding: '6px 0',
}

export function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const rootRef = useRef(null)

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power2.out' } })

      tl.from('[data-nav-reveal="wordmark"]', { y: -10, opacity: 0, duration: 0.36 })
        .from('[data-nav-reveal="primary"] > *', { y: -10, opacity: 0, duration: 0.28, stagger: 0.05 }, '-=0.2')
        .from('[data-nav-reveal="actions"] > *', { y: -10, opacity: 0, duration: 0.28, stagger: 0.06 }, '-=0.18')
    }, rootRef)

    return () => ctx.revert()
  }, [])

  const closeMobile = () => setMobileOpen(false)

  return (
    <header ref={rootRef} style={navStyle}>
      <div style={innerStyle}>
        <div style={leftStyle}>
          <NavLink to="/" style={wordmarkStyle} onClick={closeMobile} data-nav-reveal="wordmark" className="fieldr-nav-wordmark">
            Fieldr
          </NavLink>

          <nav aria-label="Primary" style={navLinksStyle} className="fieldr-nav-hide-mobile" data-nav-reveal="primary">
            <NavLink to="/" end style={navLinkBaseStyle} className={({ isActive }) => `fieldr-nav-link${isActive ? ' is-active' : ''}`}>
              Home
            </NavLink>
            <NavLink to="/how-it-works" style={navLinkBaseStyle} className={({ isActive }) => `fieldr-nav-link${isActive ? ' is-active' : ''}`}>
              How It Works
            </NavLink>
            <NavLink to="/product" style={navLinkBaseStyle} className={({ isActive }) => `fieldr-nav-link${isActive ? ' is-active' : ''}`}>
              Product
            </NavLink>
          </nav>
        </div>

        <div style={rightStyle} data-nav-reveal="actions">
          <SmartLink to={APP_FLOW_HREF} style={agentButtonStyle} className="fieldr-nav-agent fieldr-nav-hide-mobile fieldr-nav-mobile-hide-action" onClick={closeMobile}>
            Agent
          </SmartLink>
          <SmartLink to={BOOK_DEMO_HREF} style={buttonStyle} className="fieldr-nav-demo fieldr-nav-mobile-hide-action">
            Book a Demo
          </SmartLink>
          <button
            type="button"
            aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((value) => !value)}
            style={mobileMenuButtonStyle}
            className="fieldr-nav-mobile-trigger"
          >
            <span className="fieldr-nav-mobile-icon" aria-hidden="true" />
          </button>
        </div>
      </div>
      {mobileOpen ? (
        <div style={mobilePanelStyle} className="fieldr-nav-mobile-panel">
          <nav aria-label="Mobile" style={mobileNavStyle}>
            <div className="fieldr-nav-mobile-actions">
              <SmartLink to={APP_FLOW_HREF} className="fieldr-nav-agent fieldr-nav-agent--mobile" onClick={closeMobile}>
                Agent
              </SmartLink>
              <SmartLink to={BOOK_DEMO_HREF} className="fieldr-nav-demo fieldr-nav-demo--mobile" onClick={closeMobile}>
                Book a Demo
              </SmartLink>
            </div>
            <NavLink to="/" end style={mobileLinkStyle} onClick={closeMobile}>
              Home
            </NavLink>
            <NavLink to="/how-it-works" style={mobileLinkStyle} onClick={closeMobile}>
              How It Works
            </NavLink>
            <NavLink to="/product" style={mobileLinkStyle} onClick={closeMobile}>
              Product
            </NavLink>
          </nav>
        </div>
      ) : null}
      <style>{`
        .fieldr-nav-wordmark {
          position: relative;
          transition: opacity 180ms ease, transform 180ms ease;
        }

        .fieldr-nav-wordmark:hover {
          opacity: 0.92;
          transform: translateY(-1px);
        }

        .fieldr-nav-link {
          position: relative;
          color: var(--muted);
          text-decoration: none;
          transition: color 160ms ease;
        }

        .fieldr-nav-link::after {
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          bottom: -8px;
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--sienna-lt), transparent);
          opacity: 0;
          transform: scaleX(0.5);
          transition: transform 180ms ease, opacity 180ms ease;
        }

        .fieldr-nav-link:hover,
        .fieldr-nav-link.is-active {
          color: var(--bright) !important;
        }

        .fieldr-nav-link:hover::after,
        .fieldr-nav-link.is-active::after {
          opacity: 1;
          transform: scaleX(1);
        }

        .fieldr-nav-demo {
          box-shadow: 0 10px 26px rgba(184,83,46,0.18);
          transition: transform 180ms ease, background 180ms ease, box-shadow 180ms ease;
        }

        .fieldr-nav-demo:hover {
          background: var(--sienna-lt) !important;
          transform: translateY(-1px);
          box-shadow: 0 14px 30px rgba(184,83,46,0.24);
        }

        .fieldr-nav-agent {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 32px;
          min-width: 108px;
          padding: 0 16px;
          border-radius: 999px;
          position: relative;
          gap: 10px;
          border: 1px solid var(--rule2);
          background: linear-gradient(180deg, rgba(28,26,23,0.94) 0%, rgba(18,16,14,0.98) 100%);
          color: var(--bright);
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.025), 0 10px 24px rgba(0,0,0,0.18);
          transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease, color 180ms ease;
          text-decoration: none;
          white-space: nowrap;
        }

        .fieldr-nav-agent::before {
          content: '';
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: var(--sienna-lt);
          box-shadow: 0 0 0 4px rgba(212,103,63,0.12);
          animation: fieldrAgentPulse 1.9s ease-in-out infinite;
          flex: 0 0 auto;
        }

        .fieldr-nav-agent:hover {
          color: var(--bright);
          border-color: rgba(212,103,63,0.28);
          transform: translateY(-1px);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.03), 0 14px 30px rgba(0,0,0,0.24);
          text-decoration: none;
        }

        .fieldr-nav-mobile-actions {
          display: none;
        }

        .fieldr-nav-demo--mobile,
        .fieldr-nav-agent--mobile {
          min-height: 38px;
          width: 100%;
          justify-content: center;
        }

        .fieldr-nav-demo--mobile {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 8px;
          padding: 0 16px;
          background: linear-gradient(135deg, var(--sienna), var(--sienna-lt));
          color: var(--bright);
          font-family: var(--sans);
          font-size: 13px;
          font-weight: 500;
          text-decoration: none;
          box-shadow: 0 14px 28px rgba(184,83,46,0.18);
        }

        @keyframes fieldrAgentPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(1.15); }
        }

        @media (max-width: 900px) {
          .fieldr-nav-hide-mobile {
            display: none !important;
          }

          .fieldr-nav-mobile-hide-action {
            display: none !important;
          }

          .fieldr-nav-mobile-trigger {
            display: inline-flex !important;
          }

          .fieldr-nav-mobile-actions {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-bottom: 12px;
            align-items: stretch;
          }
        }

        .fieldr-nav-mobile-icon {
          position: relative;
          width: 14px;
          height: 10px;
          display: inline-block;
        }

        .fieldr-nav-mobile-icon::before,
        .fieldr-nav-mobile-icon::after {
          content: '';
          position: absolute;
          left: 0;
          width: 14px;
          height: 1px;
          background: currentColor;
        }

        .fieldr-nav-mobile-icon::before {
          top: 1px;
          box-shadow: 0 4px 0 currentColor;
        }

        .fieldr-nav-mobile-icon::after {
          bottom: 1px;
        }

        @media (max-width: 520px) {
          .fieldr-nav-mobile-panel {
            padding-left: 16px !important;
            padding-right: 16px !important;
          }

          .fieldr-nav-demo {
            padding-left: 14px !important;
            padding-right: 14px !important;
            font-size: 11px !important;
          }
        }
      `}</style>
    </header>
  )
}
