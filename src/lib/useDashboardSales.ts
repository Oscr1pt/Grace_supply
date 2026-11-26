import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  createRequestGuard,
  persistenceFailure,
  setReadFailure,
  userPersistenceMessage,
  type PersistenceErrorKind,
} from "@/lib/persistence.js";
import { fromDb, supabase } from "@/lib/supabase";
import { createScopeRequestGuard } from "@/lib/sessionScope.js";
import { getDashboardPeriod } from "@/lib/dashboardMetrics.js";
import {
  DASHBOARD_MONTH_SALES_FAILURE_KEY,
  DASHBOARD_RECENT_SALES_FAILURE_KEY,
  fetchDashboardMonthlySales,
  fetchRecentDashboardSales,
  getDashboardSalesRangeForMonth,
  type DashboardMonthlySale,
  type DashboardRecentSale,
} from "@/lib/dashboardSales.js";

type ReadState<T extends { id: string }> = {
  scopeKey: string;
  data: T[];
  loading: boolean;
  stale: boolean;
  loadError: string | null;
  loadErrorKind: PersistenceErrorKind | null;
};

const initialReadState = <T extends { id: string }>(scopeKey: string): ReadState<T> => ({
  scopeKey,
  data: [],
  loading: true,
  stale: true,
  loadError: null,
  loadErrorKind: null,
});

export function useDashboardSales(enabled: boolean) {
  const { scopeKey } = useAuth();
  const [now, setNow] = useState(() => new Date());
  const [monthlyState, setMonthlyState] = useState<ReadState<DashboardMonthlySale>>(() =>
    initialReadState(scopeKey),
  );
  const [recentState, setRecentState] = useState<ReadState<DashboardRecentSale>>(() =>
    initialReadState(scopeKey),
  );
  const monthlyGuard = useRef(createRequestGuard());
  const recentGuard = useRef(createRequestGuard());
  const scopeGuard = useRef(createScopeRequestGuard(scopeKey));
  const monthlyAbort = useRef<AbortController | null>(null);
  const recentAbort = useRef<AbortController | null>(null);
  scopeGuard.current.update(scopeKey);
  const monthKey = getDashboardPeriod(now).month;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const refreshMonthly = useCallback(async () => {
    const request = monthlyGuard.current.begin();
    const requestScope = scopeGuard.current.capture();
    monthlyAbort.current?.abort();
    const controller = new AbortController();
    monthlyAbort.current = controller;
    const isCurrent = () =>
      monthlyGuard.current.isCurrent(request) &&
      scopeGuard.current.isCurrent(requestScope) &&
      !controller.signal.aborted;
    setMonthlyState({ ...initialReadState<DashboardMonthlySale>(scopeKey), loading: true });

    try {
      const rows = await fetchDashboardMonthlySales(
        supabase,
        getDashboardSalesRangeForMonth(monthKey),
        controller.signal,
      );
      if (!isCurrent()) return;
      setMonthlyState({
        scopeKey,
        data: rows.map((row) => fromDb<DashboardMonthlySale>(row as Record<string, unknown>)),
        loading: false,
        stale: false,
        loadError: null,
        loadErrorKind: null,
      });
      setReadFailure(DASHBOARD_MONTH_SALES_FAILURE_KEY, null);
    } catch (error) {
      if (!isCurrent()) return;
      const failure = persistenceFailure(error);
      const message = userPersistenceMessage(failure);
      setMonthlyState({
        scopeKey,
        data: [],
        loading: false,
        stale: true,
        loadError: message,
        loadErrorKind: failure.kind,
      });
      setReadFailure(DASHBOARD_MONTH_SALES_FAILURE_KEY, message);
    }
  }, [monthKey, scopeKey]);

  const refreshRecent = useCallback(async () => {
    const request = recentGuard.current.begin();
    const requestScope = scopeGuard.current.capture();
    recentAbort.current?.abort();
    const controller = new AbortController();
    recentAbort.current = controller;
    const isCurrent = () =>
      recentGuard.current.isCurrent(request) &&
      scopeGuard.current.isCurrent(requestScope) &&
      !controller.signal.aborted;
    setRecentState({ ...initialReadState<DashboardRecentSale>(scopeKey), loading: true });

    try {
      const rows = await fetchRecentDashboardSales(supabase, controller.signal);
      if (!isCurrent()) return;
      setRecentState({
        scopeKey,
        data: rows.map((row) => fromDb<DashboardRecentSale>(row as Record<string, unknown>)),
        loading: false,
        stale: false,
        loadError: null,
        loadErrorKind: null,
      });
      setReadFailure(DASHBOARD_RECENT_SALES_FAILURE_KEY, null);
    } catch (error) {
      if (!isCurrent()) return;
      const failure = persistenceFailure(error);
      const message = userPersistenceMessage(failure);
      setRecentState({
        scopeKey,
        data: [],
        loading: false,
        stale: true,
        loadError: message,
        loadErrorKind: failure.kind,
      });
      setReadFailure(DASHBOARD_RECENT_SALES_FAILURE_KEY, message);
    }
  }, [scopeKey]);

  useEffect(() => {
    const monthlyRequestGuard = monthlyGuard.current;
    const recentRequestGuard = recentGuard.current;
    if (!enabled) {
      monthlyAbort.current?.abort();
      recentAbort.current?.abort();
      monthlyRequestGuard.begin();
      recentRequestGuard.begin();
      setMonthlyState({ ...initialReadState<DashboardMonthlySale>(scopeKey), loading: false });
      setRecentState({ ...initialReadState<DashboardRecentSale>(scopeKey), loading: false });
      setReadFailure(DASHBOARD_MONTH_SALES_FAILURE_KEY, null);
      setReadFailure(DASHBOARD_RECENT_SALES_FAILURE_KEY, null);
      return;
    }

    void refreshMonthly();
    void refreshRecent();
    return () => {
      monthlyAbort.current?.abort();
      recentAbort.current?.abort();
      monthlyRequestGuard.begin();
      recentRequestGuard.begin();
    };
  }, [enabled, refreshMonthly, refreshRecent, scopeKey]);

  const visibleMonthlyState =
    monthlyState.scopeKey === scopeKey
      ? monthlyState
      : initialReadState<DashboardMonthlySale>(scopeKey);
  const visibleRecentState =
    recentState.scopeKey === scopeKey
      ? recentState
      : initialReadState<DashboardRecentSale>(scopeKey);

  return {
    now,
    monthlyQuery: { ...visibleMonthlyState, refresh: refreshMonthly },
    recentQuery: { ...visibleRecentState, refresh: refreshRecent },
  };
}
