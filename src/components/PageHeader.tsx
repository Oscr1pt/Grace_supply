import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex min-w-0 flex-col justify-between gap-4 border-b border-border/60 pb-4 sm:mb-8 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        <h1 className="break-words font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
          {title}
        </h1>
        {description && <p className="mt-1 max-w-prose break-words text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex w-full min-w-0 flex-wrap items-center gap-2.5 sm:w-auto sm:shrink-0 sm:justify-end">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="group rounded-xl border border-border bg-card p-5 transition-all duration-200 hover:border-[#D4AF37]/60 hover:shadow-md hover:shadow-[#D4AF37]/5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        {icon && (
          <div className="text-[#D4AF37] opacity-80 group-hover:opacity-100 transition-opacity">
            {icon}
          </div>
        )}
      </div>
      <div className="mt-3 text-3xl font-display font-semibold tracking-tight text-foreground group-hover:text-[#D4AF37] transition-colors">
        {value}
      </div>
      {hint && <div className="text-xs text-muted-foreground mt-1 font-medium">{hint}</div>}
    </div>
  );
}
