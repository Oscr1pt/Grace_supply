const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseCalendarDate(value) {
  const match = DATE_PATTERN.exec(value);
  if (!match) throw new RangeError("Invalid date: expected YYYY-MM-DD");

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError("Invalid date: calendar date does not exist");
  }
  return date;
}

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date, count) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + count);
  return result;
}

function mondayFor(date) {
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return addUtcDays(date, -daysSinceMonday);
}

export function resolveReportPeriod(periodType, anchorDate) {
  const anchor = parseCalendarDate(anchorDate);
  let start;
  let endExclusive;
  let bucketCount;

  if (periodType === "week") {
    start = mondayFor(anchor);
    endExclusive = addUtcDays(start, 7);
    bucketCount = 7;
  } else if (periodType === "month") {
    start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
    endExclusive = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1));
    bucketCount = Math.ceil(
      (endExclusive.getTime() - mondayFor(start).getTime()) / (7 * 24 * 60 * 60 * 1000),
    );
  } else if (periodType === "year") {
    start = new Date(Date.UTC(anchor.getUTCFullYear(), 0, 1));
    endExclusive = new Date(Date.UTC(anchor.getUTCFullYear() + 1, 0, 1));
    bucketCount = 12;
  } else {
    throw new RangeError("Invalid period type");
  }

  return {
    startDate: toDateString(start),
    endDateExclusive: toDateString(endExclusive),
    bucketCount,
  };
}

export function formatReportPeriodRange(startDate, endDateExclusive, locale = "es-DO") {
  const start = parseCalendarDate(startDate);
  const end = addUtcDays(parseCalendarDate(endDateExclusive), -1);
  const formatter = new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `Del ${formatter.format(start)} al ${formatter.format(end)}`;
}
