const BUSINESS_TIME_ZONE = "America/Santo_Domingo";

export class HistoryDateRangeError extends Error {
  constructor(message) {
    super(message);
    this.name = "HistoryDateRangeError";
  }
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function dateParts(formatter, instant) {
  return Object.fromEntries(
    formatter.formatToParts(instant).map(({ type, value }) => [type, value]),
  );
}

function localDateString(instant) {
  const parts = dateParts(dateFormatter, instant);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function parseDateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HistoryDateRangeError("Usa una fecha válida en formato AAAA-MM-DD.");
  }
  const [year, month, day] = value.split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new HistoryDateRangeError("La fecha indicada no existe.");
  }
  return { year, month, day };
}

function addCalendarDays(value, amount) {
  const { year, month, day } = parseDateOnly(value);
  const shifted = new Date(Date.UTC(year, month - 1, day + amount));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function localMidnightIso(value) {
  const { year, month, day } = parseDateOnly(value);
  const localAsUtc = Date.UTC(year, month - 1, day);
  let candidate = localAsUtc;

  // Derive the zone offset at the candidate and correct until the represented
  // local wall time is exactly midnight. This also handles offset transitions.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = dateParts(dateTimeFormatter, new Date(candidate));
    const representedLocal = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const next = localAsUtc - (representedLocal - Math.floor(candidate / 1000) * 1000);
    if (next === candidate) break;
    candidate = next;
  }
  return new Date(candidate).toISOString();
}

function normalizedNow(now) {
  const instant = now === undefined ? new Date() : new Date(now);
  if (Number.isNaN(instant.getTime())) {
    throw new HistoryDateRangeError("No se pudo determinar la fecha actual.");
  }
  return instant;
}

function bounds(startDate, endDateExclusive) {
  return {
    fromInclusive: localMidnightIso(startDate),
    toExclusive: localMidnightIso(endDateExclusive),
  };
}

export function resolveHistoryDateRange({ period, now, from, to } = {}) {
  if (period === "all") return { fromInclusive: null, toExclusive: null };

  if (period === "custom") {
    if (!from || !to) {
      throw new HistoryDateRangeError("Selecciona las fechas desde y hasta.");
    }
    parseDateOnly(from);
    parseDateOnly(to);
    if (from > to) {
      throw new HistoryDateRangeError(
        "La fecha inicial debe ser anterior o igual a la fecha final.",
      );
    }
    return bounds(from, addCalendarDays(to, 1));
  }

  const today = localDateString(normalizedNow(now));
  if (period === "today") return bounds(today, addCalendarDays(today, 1));
  if (period === "last7Days") return bounds(addCalendarDays(today, -6), addCalendarDays(today, 1));
  if (period === "thisMonth") {
    const { year, month } = parseDateOnly(today);
    const first = `${year}-${String(month).padStart(2, "0")}-01`;
    const nextMonth =
      month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
    return bounds(first, nextMonth);
  }

  throw new HistoryDateRangeError("Selecciona un período válido.");
}
