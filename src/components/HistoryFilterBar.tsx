import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { HistoryPeriod } from "@/lib/historyDateRange.js";

type Props = {
  kind: "sales" | "purchases";
  search: string;
  onSearch: (value: string) => void;
  period: HistoryPeriod;
  onPeriodChange: (period: HistoryPeriod) => void;
  from: string;
  onFromChange: (value: string) => void;
  to: string;
  onToChange: (value: string) => void;
  dateError?: string | null;
  onClear: () => void;
};

export function HistoryFilterBar({
  kind,
  search,
  onSearch,
  period,
  onPeriodChange,
  from,
  onFromChange,
  to,
  onToChange,
  dateError = null,
  onClear,
}: Props) {
  const [draft, setDraft] = useState(search);
  const composing = useRef(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<number | null>(null);
  const hasFilters = Boolean(search.trim() || period !== "all" || from || to);
  const counterpart = kind === "sales" ? "cliente" : "proveedor";
  const accessibleHistory = kind === "sales" ? "ventas" : "compras";

  useEffect(() => setDraft(search), [search]);

  useEffect(() => {
    if (composing.current || draft === search) return;
    const timer = window.setTimeout(() => {
      searchTimer.current = null;
      onSearch(draft);
    }, 300);
    searchTimer.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (searchTimer.current === timer) searchTimer.current = null;
    };
  }, [draft, onSearch, search]);

  return (
    <section
      aria-label={`Filtros del historial de ${accessibleHistory}`}
      className="grid min-w-0 gap-3 rounded-lg border border-border bg-card p-3 sm:p-4 lg:grid-cols-[minmax(14rem,1fr)_12rem_auto] lg:items-end"
    >
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={`${kind}-history-search`}>Buscar</Label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={searchInput}
            id={`${kind}-history-search`}
            type="search"
            className="pr-10 pl-9"
            placeholder={`N.º de ${kind === "sales" ? "recibo" : "factura"} o ${counterpart}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onCompositionStart={() => {
              composing.current = true;
              if (searchTimer.current !== null) window.clearTimeout(searchTimer.current);
              searchTimer.current = null;
            }}
            onCompositionEnd={(event) => {
              composing.current = false;
              setDraft(event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !composing.current) {
                event.preventDefault();
                if (searchTimer.current !== null) window.clearTimeout(searchTimer.current);
                searchTimer.current = null;
                onSearch(draft);
              }
            }}
            aria-label={`Buscar ${accessibleHistory} por identificador o ${counterpart}`}
          />
          {draft && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
              onClick={() => {
                if (searchTimer.current !== null) window.clearTimeout(searchTimer.current);
                searchTimer.current = null;
                setDraft("");
                onSearch("");
                searchInput.current?.focus();
              }}
              aria-label="Limpiar búsqueda"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={`${kind}-history-period`}>Período</Label>
        <Select value={period} onValueChange={(value) => onPeriodChange(value as HistoryPeriod)}>
          <SelectTrigger id={`${kind}-history-period`} aria-label="Filtrar por período">
            <SelectValue placeholder="Selecciona un período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="today">Hoy</SelectItem>
            <SelectItem value="last7Days">Últimos 7 días</SelectItem>
            <SelectItem value="thisMonth">Este mes</SelectItem>
            <SelectItem value="custom">Personalizado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {period === "custom" && (
        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(8.5rem,1fr)_auto_minmax(8.5rem,1fr)] sm:items-end lg:col-span-2 lg:grid-cols-[minmax(8.5rem,1fr)_auto_minmax(8.5rem,1fr)]">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={`${kind}-history-from`}>Fecha desde</Label>
            <Input
              id={`${kind}-history-from`}
              type="date"
              className="w-full min-w-0"
              value={from}
              onChange={(event) => onFromChange(event.target.value)}
              aria-label="Fecha desde"
              aria-invalid={Boolean(dateError)}
              aria-describedby={dateError ? `${kind}-history-date-error` : undefined}
            />
          </div>
          <span className="hidden pb-2 text-sm text-muted-foreground sm:block" aria-hidden="true">
            hasta
          </span>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={`${kind}-history-to`}>Fecha hasta</Label>
            <Input
              id={`${kind}-history-to`}
              type="date"
              className="w-full min-w-0"
              value={to}
              min={from || undefined}
              onChange={(event) => onToChange(event.target.value)}
              aria-label="Fecha hasta"
              aria-invalid={Boolean(dateError)}
              aria-describedby={dateError ? `${kind}-history-date-error` : undefined}
            />
          </div>
        </div>
      )}

      <div className="flex justify-start lg:justify-end">
        <Button type="button" variant="outline" onClick={onClear} disabled={!hasFilters}>
          Limpiar filtros
        </Button>
      </div>
      {dateError && (
        <p
          id={`${kind}-history-date-error`}
          role="alert"
          className="text-sm text-destructive lg:col-span-full"
        >
          {dateError}
        </p>
      )}
    </section>
  );
}
