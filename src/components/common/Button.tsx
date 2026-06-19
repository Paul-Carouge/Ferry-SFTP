import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-accent text-accent-foreground hover:bg-accent-hover",
  secondary: "bg-surface-2 text-foreground hover:brightness-110 border border-border",
  ghost: "text-foreground-muted hover:bg-surface-2 hover:text-foreground",
  danger: "bg-danger text-white hover:brightness-110",
};

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
    />
  );
}
