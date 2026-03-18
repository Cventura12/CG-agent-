import { Link } from 'react-router-dom'

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

const wordmarkStyle = {
  fontFamily: 'var(--serif)',
  fontSize: '15px',
  lineHeight: 1,
  letterSpacing: '0.01em',
  color: 'var(--bright)',
  textDecoration: 'none',
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
}

export function Nav() {
  return (
    <header style={navStyle}>
      <div style={innerStyle}>
        <Link to="/" style={wordmarkStyle}>
          Fieldr
        </Link>
        <button type="button" style={buttonStyle}>
          Book a Demo
        </button>
      </div>
    </header>
  )
}
