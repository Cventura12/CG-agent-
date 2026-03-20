export function AnimatedWords({ as = 'span', text, className = '', innerClassName = '', ...props }) {
  const Tag = as
  const words = text.split(' ').filter(Boolean)

  return (
    <Tag className={className} {...props}>
      {words.map((word, index) => (
        <span key={`${word}-${index}`} className="fieldr-word">
          <span className={`fieldr-word__inner${innerClassName ? ` ${innerClassName}` : ''}`}>{word}</span>
        </span>
      ))}
    </Tag>
  )
}
