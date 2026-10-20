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
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8 pb-4 border-b border-border/60">
      <div>
        <h1 className="text-3xl sm:text-4xl font-display font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2.5 shrink-0">{actions}</div>}
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
