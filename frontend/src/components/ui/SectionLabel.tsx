export interface SectionLabelProps {
  children: string;
}

export function SectionLabel({ children }: SectionLabelProps) {
  return <div className="py-1 font-mono text-[10px] font-medium uppercase tracking-[0.7px] text-[var(--t3)]">{children}</div>;
}
