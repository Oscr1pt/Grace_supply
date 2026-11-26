import { resolveReportPeriod, validateReportPeriodSelection } from "./reportPeriods.js";

function rpcAnchor(periodType, anchorDate) {
  if (periodType === "month") return `${anchorDate.slice(0, 7)}-01`;
  if (periodType === "year") return `${anchorDate.slice(0, 4)}-01-01`;
  return anchorDate;
}

export function buildBusinessReportRequest(periodType, selectorValue, currentYear) {
  const selection = validateReportPeriodSelection(periodType, selectorValue, currentYear);
  if (!selection.valid || !selection.anchorDate) {
    const error = new RangeError(selection.error ?? "Selecciona un período válido.");
    error.code = "INVALID_REPORT_PERIOD";
    throw error;
  }

  const anchorDate = rpcAnchor(periodType, selection.anchorDate);
  const range = resolveReportPeriod(periodType, anchorDate);
  const expectedPeriod = {
    type: periodType,
    anchorDate: selection.selectorValue,
    startDate: range.startDate,
    endDateExclusive: range.endDateExclusive,
  };

  return {
    expectedPeriod,
    args: { p_period_type: periodType, p_anchor_date: anchorDate },
  };
}

export async function invokeBusinessReportRpc(rpc, periodType, selectorValue, currentYear) {
  const request = buildBusinessReportRequest(periodType, selectorValue, currentYear);
  const response = await rpc("get_business_report", request.args);
  return { ...request, response };
}
