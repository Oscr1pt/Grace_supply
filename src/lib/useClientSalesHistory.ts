import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  createRequestGuard,
  persistenceFailure,
  userPersistenceMessage,
  type PersistenceErrorKind,
} from "@/lib/persistence.js";
import { createScopeRequestGuard } from "@/lib/sessionScope.js";
import { fromDb, supabase } from "@/lib/supabase";
import {
  fetchClientSalesHistoryPage,
  setClientSalesHistoryFailure,
  type ClientSalesHistorySale,
} from "@/lib/clientSales.js";

const initialState = (scopeKey: string, clientId: string | null) => ({
  scopeKey,
  clientId,
  data: [] as ClientSalesHistorySale[],
  hasMore: false,
  loading: Boolean(clientId),
  error: null as string | null,
  errorKind: null as PersistenceErrorKind | null,
});

export function useClientSalesHistory(clientId: string | null, enabled: boolean) {
  const { scopeKey } = useAuth();
  const [page, setPage] = useState(0);
  const [state, setState] = useState(() => initialState(scopeKey, clientId));
  const requestGuard = useRef(createRequestGuard());
  const scopeGuard = useRef(createScopeRequestGuard(scopeKey));
  const abortController = useRef<AbortController | null>(null);
  scopeGuard.current.update(scopeKey);

  const refresh = useCallback(async () => {
    if (!clientId || !enabled) return;
    const request = requestGuard.current.begin();
    const requestScope = scopeGuard.current.capture();
    abortController.current?.abort();
    const controller = new AbortController();
    abortController.current = controller;
    const isCurrent = () =>
      requestGuard.current.isCurrent(request) &&
      scopeGuard.current.isCurrent(requestScope) &&
      !controller.signal.aborted;
    setState({ ...initialState(scopeKey, clientId), loading: true });

    try {
      const result = await fetchClientSalesHistoryPage(supabase, clientId, page, controller.signal);
      if (!isCurrent()) return;
      const data = result.sales.map((sale) => {
        const parsed = fromDb<ClientSalesHistorySale>(sale);
        return {
          ...parsed,
          lines: sale.lines.map((line) => fromDb<ClientSalesHistorySale["lines"][number]>(line)),
        };
      });
      setState({
        scopeKey,
        clientId,
        data,
        hasMore: result.hasMore,
        loading: false,
        error: null,
        errorKind: null,
      });
      setClientSalesHistoryFailure(null);
    } catch (error) {
      if (!isCurrent()) return;
      const failure = persistenceFailure(error);
      const message = userPersistenceMessage(failure);
      setState({
        ...initialState(scopeKey, clientId),
        loading: false,
        error: message,
        errorKind: failure.kind,
      });
      setClientSalesHistoryFailure(message);
    }
  }, [clientId, enabled, page, scopeKey]);

  useEffect(() => {
    const currentRequestGuard = requestGuard.current;
    if (!clientId || !enabled) {
      abortController.current?.abort();
      currentRequestGuard.begin();
      setState({ ...initialState(scopeKey, clientId), loading: false });
      return;
    }

    void refresh();
    return () => {
      abortController.current?.abort();
      currentRequestGuard.begin();
    };
  }, [clientId, enabled, refresh, scopeKey]);

  const visibleState =
    state.scopeKey === scopeKey && state.clientId === clientId
      ? state
      : initialState(scopeKey, clientId);

  return { ...visibleState, page, setPage, refresh };
}
