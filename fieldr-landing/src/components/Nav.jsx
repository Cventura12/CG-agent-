import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { APP_FLOW_HREF, BOOK_DEMO_HREF } from './siteLinks'
import { SmartLink } from './SmartLink'

const navStyle = {
  position: 'fixed',
  inset: '0 0 auto 0',
  zIndex: 1000,
  height: '56px',
  borderBottom: '1px solid var(--rule)',
  backdropFilter: 'blur(12px)',
  background: 'rgba(13,12,10,0.92)',
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
  color: 'var(--muted)',
  transition: 'color 160ms ease',
}

const navLinkActiveStyle = {
  color: 'var(--bright)',
}

const rightStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
  flexShrink: 0,
}

const appLinkStyle = {
  fontFamily: 'var(--mono)',
  fontSize: '9px',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  textDecoration: 'none',
  color: 'var(--dim)',
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

const mobileMenuButtonStyle = {
  display: 'none',
  alignItems: 'center',
  justifyContent: 'center',
  width: '32px',
  height: '32px',
  padding: 0,
  border: '1px solid var(--rule2)',
  borderRadius: '5px',
  background: 'var(--surface)',
  color: 'var(--bright)',
  cursor: 'pointer',
}

const mobilePanelStyle = {
  borderTop: '1px solid var(--rule)',
  borderBottom: '1px solid var(--rule)',
  background: 'rgba(13,12,10,0.98)',
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

  const closeMobile = () => setMobileOpen(false)

  return (
    <header style={navStyle}>
      <div style={innerStyle}>
        <div style={leftStyle}>
          <NavLink to="/" style={wordmarkStyle} onClick={closeMobile}>
            Fieldr
          </NavLink>

          <nav aria-label="Primary" style={navLinksStyle} className="fieldr-nav-hide-mobile">
            <NavLink to="/" end style={({ isActive }) => (isActive ? { ...navLinkBaseStyle, ...navLinkActiveStyle } : navLinkBaseStyle)}>
              Home
            </NavLink>
            <NavLink
              to="/how-it-works"
              style={({ isActive }) => (isActive ? { ...navLinkBaseStyle, ...navLinkActiveStyle } : navLinkBaseStyle)}
            >
              How It Works
            </NavLink>
            <NavLink
              to="/product"
              style={({ isActive }) => (isActive ? { ...navLinkBaseStyle, ...navLinkActiveStyle } : navLinkBaseStyle)}
            >
              Product
            </NavLink>
          </nav>
        </div>

        <div style={rightStyle}>
          <SmartLink to={APP_FLOW_HREF} style={appLinkStyle} className="fieldr-nav-hide-mobile" onClick={closeMobile}>
            Agent
          </SmartLink>
          <SmartLink to={BOOK_DEMO_HREF} style={buttonStyle}>
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
            <NavLink to="/" end style={mobileLinkStyle} onClick={closeMobile}>
              Home
            </NavLink>
            <NavLink to="/how-it-works" style={mobileLinkStyle} onClick={closeMobile}>
              How It Works
            </NavLink>
            <NavLink to="/product" style={mobileLinkStyle} onClick={closeMobile}>
              Product
            </NavLink>
            <SmartLink to={APP_FLOW_HREF} style={mobileLinkStyle} onClick={closeMobile}>
              Agent
            </SmartLink>
            <SmartLink to={BOOK_DEMO_HREF} style={mobileLinkStyle} onClick={closeMobile}>
              Book a Demo
            </SmartLink>
          </nav>
        </div>
      ) : null}
      <style>{`
        @media (max-width: 760px) {
          .fieldr-nav-hide-mobile {
            display: none;
          }

          .fieldr-nav-mobile-trigger {
            display: inline-flex !important;
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
        }
      `}</style>
    </header>
  )
}
