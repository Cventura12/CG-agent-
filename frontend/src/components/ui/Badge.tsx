import clsx from "clsx";
import type { HTMLAttributes, ReactNode } from "react";

type BadgeTone = "neutral" | "accent" | "success" | "warn" | "blue";

const toneClasses: Record<BadgeTone, string> = {
  neutral: "border border-[var(--line-2)] bg-[var(--bg-4)] text-[var(--t2)]",
  accent: "border border-[var(--acl)] bg-[var(--acl-2)] text-[var(--accent-2)]",
  success: "border border-[var(--green)] bg-[var(--green-b)] text-[var(--green)]",
  warn: "border border-[var(--amber)] bg-[var(--amber-b)] text-[var(--amber)]",
  blue: "border border-[var(--blue)] bg-[var(--blue-b)] text-[var(--blue)]",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  children: ReactNode;
}

export function Badge({ tone = "neutral", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-[6px] px-[7px] py-[3px] text-[9px] font-medium uppercase tracking-[0.08em]",
        "font-mono",
        toneClasses[tone],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
