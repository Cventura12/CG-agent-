import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "ghost" | "accent" | "outline";

const variantClasses: Record<ButtonVariant, string> = {
  ghost:
    "border border-[var(--line-3)] bg-transparent text-[var(--t2)] hover:bg-[var(--bg-3)] hover:text-[var(--t1)]",
  accent:
    "border border-[var(--accent)] bg-[var(--accent)] text-white hover:opacity-85",
  outline:
    "border border-[var(--acl)] bg-[var(--acl-2)] text-[var(--accent-2)] hover:bg-[var(--acl)]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  leftIcon?: ReactNode;
}

export function Button({
  variant = "ghost",
  className,
  leftIcon,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        "inline-flex items-center justify-center gap-[7px] rounded-md px-3 py-[5px] text-[12px] font-medium transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {leftIcon}
      {children}
    </button>
  );
}
