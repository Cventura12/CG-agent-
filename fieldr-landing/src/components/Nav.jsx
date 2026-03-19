import { NavLink } from 'react-router-dom'
import { APP_FLOW_HREF, BOOK_DEMO_HREF } from './siteLinks'

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

export function Nav() {
  return (
    <header style={navStyle}>
      <div style={innerStyle}>
        <div style={leftStyle}>
          <NavLink to="/" style={wordmarkStyle}>
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
          <a href={APP_FLOW_HREF} style={appLinkStyle} className="fieldr-nav-hide-mobile">
            Open workspace
          </a>
          <a href={BOOK_DEMO_HREF} style={buttonStyle}>
            Book a Demo
          </a>
        </div>
      </div>
      <style>{`
        @media (max-width: 760px) {
          .fieldr-nav-hide-mobile {
            display: none;
          }
        }
      `}</style>
    </header>
  )
}
