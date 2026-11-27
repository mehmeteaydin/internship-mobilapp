import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "danger" | "info" | "outline";
}

const badgeStyles: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default: "bg-slate-900 text-white",
  success: "bg-emerald-100 text-emerald-800 border border-emerald-200",
  warning: "bg-amber-100 text-amber-800 border border-amber-200",
  danger: "bg-red-100 text-red-800 border border-red-200",
  info: "bg-blue-100 text-blue-800 border border-blue-200",
  outline: "border border-slate-300 text-slate-700 bg-white",
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        badgeStyles[variant],
        className
      )}
      {...props}
    />
  );
}
