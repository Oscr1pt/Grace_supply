import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";

type Props = {
  kind: "sales" | "purchases";
  page: number;
  totalCount: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
};

export function HistoryPagination({ kind, page, totalCount, pageSize = 25, onPageChange }: Props) {
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const visiblePage = totalCount === 0 ? 0 : Math.min(page, pageCount);
  const historyName = kind === "sales" ? "ventas" : "compras";

  return (
    <div className="flex min-w-0 flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
      <p
        className="text-sm text-muted-foreground"
        aria-live="polite"
        data-testid={`${kind}-history-count`}
      >
        {totalCount.toLocaleString("es-DO")} {totalCount === 1 ? "resultado" : "resultados"}
        {totalCount > 0 && ` · Página ${visiblePage} de ${pageCount}`}
      </p>
      <Pagination
        aria-label={`Paginación del historial de ${historyName}`}
        className="mx-0 w-auto justify-start sm:justify-end"
      >
        <PaginationContent>
          <PaginationItem>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page <= 1 || totalCount === 0}
              aria-label="Página anterior"
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Anterior
            </Button>
          </PaginationItem>
          <PaginationItem>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.min(pageCount, page + 1))}
              disabled={page >= pageCount || totalCount === 0}
              aria-label="Página siguiente"
            >
              Siguiente
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
