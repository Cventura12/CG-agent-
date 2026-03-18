import clsx from "clsx";

type BadgeColor = "green" | "amber" | "blue" | "red" | "purple" | "accent" | "muted";

const toneClasses: Record<BadgeColor, string> = {
  green: "bg-[var(--green-b)] text-[var(--green)]",
  amber: "bg-[var(--amber-b)] text-[var(--amber)]",
  blue: "bg-[var(--blue-b)] text-[var(--blue)]",
  red: "bg-[var(--red-b)] text-[var(--red)]",
  purple: "bg-[var(--purple-b)] text-[var(--purple)]",
  accent: "bg-[var(--acl)] text-[var(--accent-2)]",
  muted: "bg-[var(--bg-4)] text-[var(--t2)]",
};

export interface BadgeProps {
  label: string;
  color: BadgeColor;
  className?: string;
}

export function Badge({ label, color, className }: BadgeProps) {
  return (
    <span className={clsx("inline-flex items-center rounded-[4px] px-1.5 py-0.5 font-mono text-[9px] font-medium", toneClasses[color], className)}>
      {label}
    </span>
  );
}
