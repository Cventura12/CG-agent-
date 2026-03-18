import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "ghost" | "accent" | "destructive" | "outline-accent";

const variantClasses: Record<ButtonVariant, string> = {
  ghost: "border border-[var(--line-3)] bg-transparent text-[var(--t2)] hover:bg-[var(--bg-3)] hover:text-[var(--t1)] active:bg-[var(--bg-4)]",
  accent: "border border-[var(--accent)] bg-[var(--accent)] text-white hover:opacity-90 active:translate-y-px",
  destructive: "border border-[var(--red-b)] bg-[var(--red-b)] text-[var(--red)] hover:opacity-90 active:translate-y-px",
  "outline-accent": "border border-[var(--acl)] bg-transparent text-[var(--accent-2)] hover:bg-[var(--acl-2)] active:bg-[var(--acl)]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  leftIcon?: ReactNode;
}

export function Button({ variant = "ghost", leftIcon, className, children, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-md px-3 py-[5px] text-[12px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--line-4)]",
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
