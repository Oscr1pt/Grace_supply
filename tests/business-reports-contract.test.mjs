import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  parseBusinessReportResponse,
  classifyBusinessReportError,
} from "../src/lib/businessReportsContract.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const validReport = {
  period: {
    type: "month",
    anchorDate: "2026-02",
    startDate: "2026-02-01",
    endDateExclusive: "2026-03-01",
  },
  generatedAt: "2026-02-28T21:00:00Z",
  hasMovements: true,
  metrics: {
    salesSubtotal: "120.50",
    operatingExpenses: "20.00",
    merchandisePurchases: "45.25",
    salesTax: "21.69",
  },
  buckets: [
    {
      startDate: "2026-02-01",
      label: "Semana 1",
      salesSubtotal: "120.50",
      operatingExpenses: "20.00",
    },
    {
      startDate: "2026-02-02",
      label: "Semana 2",
      salesSubtotal: "0.00",
      operatingExpenses: "0.00",
    },
    {
      startDate: "2026-02-09",
      label: "Semana 3",
      salesSubtotal: "0.00",
      operatingExpenses: "0.00",
    },
    {
      startDate: "2026-02-16",
      label: "Semana 4",
      salesSubtotal: "0.00",
      operatingExpenses: "0.00",
    },
    {
      startDate: "2026-02-23",
      label: "Semana 5",
      salesSubtotal: "0.00",
      operatingExpenses: "0.00",
    },
  ],
  expenseCategories: [{ category: "alquiler", label: "Alquiler", amount: "20.00" }],
};

test("parses aggregate RPC response with decimal strings and the requested period", () => {
  const result = parseBusinessReportResponse(validReport, validReport.period);
  assert.equal(result.metrics.salesSubtotal, "120.50");
  assert.equal(result.buckets[0].operatingExpenses, "20.00");
  assert.equal(result.expenseCategories[0].category, "alquiler");
});

test("rejects stale periods and malformed or non-decimal amounts instead of displaying zero", () => {
  assert.throws(
    () =>
      parseBusinessReportResponse(validReport, { ...validReport.period, anchorDate: "2026-03" }),
    /period/i,
  );
  assert.throws(
    () =>
      parseBusinessReportResponse(
        { ...validReport, metrics: { ...validReport.metrics, salesSubtotal: "NaN" } },
        validReport.period,
      ),
    /amount/i,
  );
});

test("rejects incomplete chart aggregates rather than allowing a misleading printable report", () => {
  const incomplete = {
    ...validReport,
    buckets: validReport.buckets.map((bucket, index) =>
      index === 0 ? { ...bucket, salesSubtotal: "120.49" } : bucket,
    ),
  };
  assert.throws(() => parseBusinessReportResponse(incomplete, validReport.period), /inconsistent/i);
});

test("maps authorization errors to denied and connection errors to error", () => {
  assert.equal(classifyBusinessReportError({ code: "42501", status: 403 }), "denied");
  assert.equal(classifyBusinessReportError({ status: 401 }), "denied");
  assert.equal(classifyBusinessReportError({ message: "Failed to fetch" }), "error");
});

test("RPC migration is invoker-only, read-only, admin-gated, and restricted to authenticated execution", () => {
  const migrationPath = join(
    root,
    "supabase",
    "migrations",
    "20261125181237_business_reports_readonly_rpc.sql",
  );
  const sql = readFileSync(migrationPath, "utf8");
  const body = sql.match(/AS \$function\$([\s\S]*?)\$function\$/)?.[1] ?? "";
  assert.match(sql, /SECURITY INVOKER/i);
  assert.match(sql, /SET search_path = pg_catalog/i);
  assert.match(body, /auth\.uid\(\) IS NULL OR NOT private\.is_active_admin\(\)/i);
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.get_business_report\(text, date\) FROM PUBLIC, anon, authenticated/i,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.get_business_report\(text, date\) TO authenticated/i,
  );
  assert.doesNotMatch(body, /\b(?:INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM|TRUNCATE)\b/i);
  assert.match(body, /public\.sales/);
  assert.match(body, /public\.purchases/);
  assert.match(body, /public\.expenses/);
  assert.match(body, /America\/Santo_Domingo/);
  assert.match(body, /voided_at IS NULL/i);
  assert.doesNotMatch(body, /credit_payments|client_credits|supplier_credits/i);
});

test("local PostgreSQL assertions exercise access, amounts, annulments, and periods transactionally", () => {
  const sql = readFileSync(join(root, "supabase", "tests", "business_reports_rpc.sql"), "utf8");
  assert.match(sql, /admin_report/);
  assert.match(sql, /employee/);
  assert.match(sql, /anonymous/);
  assert.match(sql, /no_session/);
  assert.match(sql, /revoked/);
  assert.match(sql, /reports-admin-secondary-synthetic/);
  assert.match(sql, /active_admin_b/);
  assert.match(sql, /last_admin_guard/);
  assert.match(sql, /salesSubtotal.*150\.00/s);
  assert.match(sql, /salesTax.*27\.00/s);
  assert.match(sql, /voided purchase|Voided purchase/i);
  assert.match(sql, /expenseCategories/);
  assert.match(sql, /ROLLBACK;/);
});

test("host PostgreSQL harness creates only a unique temporary Supabase project", () => {
  const script = readFileSync(join(root, "scripts", "test-business-reports-local.ps1"), "utf8");
  assert.match(script, /GetTempPath/);
  assert.match(script, /gracereports/);
  assert.match(script, /supabase\/migrations/);
  assert.match(script, /db', 'reset', '--local'/);
  assert.match(script, /business_reports_rpc\.sql/);
  assert.doesNotMatch(
    script,
    /db', 'push|--linked|supabase_db_jewel-sales-hub|Remove-Item.*Recurse/i,
  );
});
