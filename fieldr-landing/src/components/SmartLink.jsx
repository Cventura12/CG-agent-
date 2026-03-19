import { Link } from 'react-router-dom'

function isExternalHref(href) {
  return /^(https?:|mailto:|tel:)/i.test(href)
}

export function SmartLink({ to, children, ...props }) {
  if (isExternalHref(to)) {
    return (
      <a href={to} {...props}>
        {children}
      </a>
    )
  }

  return (
    <Link to={to} {...props}>
      {children}
    </Link>
  )
}
