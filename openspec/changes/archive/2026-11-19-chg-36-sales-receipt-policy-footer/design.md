# Design

## Context

`src/routes/_app/sales.tsx` contains the sole `ReceiptDialog`. Both a newly posted sale and a sale reopened from history render through this component. The view is generated from the `Sale` object and uses `createdAt`; sales do not snapshot this commercial policy. `src/styles.css` currently has only generic print rules, while the dialog uses a portal and fixed overlay.

## Goals / Non-Goals

**Goals:** Keep the existing receipt layout, insert the approved footer once after the totals, preserve the non-fiscal label and all displayed amounts, and make historical policy display depend on the sale's creation time relative to the release cutoff. Keep the footer legible in browser preview and print without prescribing paper size.

**Non-Goals:** No sales data changes, database migration, receipt persistence, tax or financial changes, new configuration UI, or changes to other printable documents.

## Decisions

- Reuse `ReceiptDialog`; replace its existing single-line thank-you note with the exact approved heading so gratitude is not duplicated, then add the policy title and four approved paragraphs below the totals.
- Keep the copy as a fixed Spanish constant. Preserve punctuation and wording verbatim; do not trim or normalize the copy or add conditions.
- Use `sale.createdAt` against the build-time public value `VITE_RECEIPT_POLICY_EFFECTIVE_AT`, set by the release process to the planned publication instant. The value contains only the effective date/time, not policy copy; it is not editable in the UI. It must be a strict ISO-8601 UTC timestamp ending in `Z` (for example, `YYYY-MM-DDTHH:mm:ss.sssZ`) and is compiled into the frontend bundle. The release process must set the intended effective instant, not the local build time, and inspect the built JavaScript for the exact value before publication. Missing, invalid, non-UTC, or impossible timestamps fail closed by omitting the policy. Receipts dated before the cutoff omit the policy; receipts on or after it include it. This avoids a migration, backfill, and retroactive claim while keeping reprints deterministic across browsers. Test the date boundary with an injected/pure comparison rather than relying on the developer machine clock.
- Scope print styles to the receipt dialog and `#receipt-print`: hide the application chrome and overlay, remove modal positioning, transform/translate, entry animation, transition, and overflow constraints for print, preserve the receipt's normal document flow, and avoid breaks inside the policy footer. Keep the translate reset in Tailwind's utilities layer so it wins the utility cascade. Do not add `@page size`; the browser/printer controls paper dimensions.
- Keep the current body type and neutral border treatment. Add a thin divider, centered thank-you line, restrained policy heading, compact paragraph spacing, and readable line height; no new visual tokens or shared component changes.
- Gate production builds through a Node prebuild hook and a pinned, read-only Supabase CLI query for the active public key. Compare the full key in memory; never print or persist it. Require the exact approved project URL, auth feature flags, and an explicitly approved UTC receipt cutoff.
- Verify the emitted auth client chunk after Vite finishes. Every compiled Vite environment value for the Supabase URL/key, auth flags, and receipt cutoff must be present and consistent, and the effective URL/key must exactly match the approved project configuration. Scan browser assets for privileged Supabase credentials. A known unused localhost fallback constant embedded by Supabase Auth is not treated as the active endpoint; the effective client URL is checked directly.
- Use `npm run build:production -- --receipt-policy-effective-at=<UTC> --approved-receipt-policy-effective-at=<same-UTC>` as the deterministic build entry point. The second explicit value must match, reducing accidental reuse of a stale cutoff. The `build` npm lifecycle also runs prebuild and postbuild checks, so a direct `npm run build` cannot bypass them. Both hooks require the cutoff to remain in the future, and the publication entry point checks again immediately before deploy. Publication tooling must run the same validated build and dry-run sequence before any explicitly authorized publish.

## Risks / Trade-offs

- [The release cutoff is not known until publication is scheduled] → Keep it as one build-time public variable and require preflight to set and verify the exact instant before the production build; an unset or invalid cutoff must fail closed by omitting the policy.
- [A4 and thermal printer widths vary by driver] → Do not force page dimensions; test print media at A4 and narrow viewport widths, prevent horizontal overflow, and keep paragraph blocks together where possible.
- [The shared global print stylesheet could affect other modules] → Scope every new print selector to the receipt dialog or `#receipt-print` and confirm existing print modules are unchanged.

## Migration Plan

No database migration or data backfill. Build and publish the frontend only after the release cutoff is fixed. Rollback is the previous frontend version; no financial or stored receipt data changes require reversal.
