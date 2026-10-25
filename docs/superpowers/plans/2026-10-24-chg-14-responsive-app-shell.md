# CHG-14 Responsive App Shell Implementation Plan

> **For agentic workers:** Follow the three tracked tasks in `openspec/changes/chg-14-responsive-app-shell/tasks.md`; keep implementation and verification within this change.

**Goal:** Make Grace Supply's shared app shell usable at mobile, tablet, and desktop widths without changing its visual identity or authorization behavior.

**Architecture:** Keep the current desktop navigation and add a Radix Sheet-based navigation panel below the desktop breakpoint. Retain `_app.tsx` as the route permission guard; make shared layout, header, table wrapper styles, Sheet, and Dialog handle narrow viewports and keyboard focus consistently.

**Tech Stack:** React, TanStack Router, Tailwind CSS, Radix Dialog/Sheet, Playwright, TypeScript.

**Spec:** `openspec/changes/chg-14-responsive-app-shell/{proposal.md,design.md,specs/responsive-application-shell/spec.md,tasks.md}`

## Scope

- Update `src/components/AppSidebar.tsx`, `src/routes/_app.tsx`, `src/components/PageHeader.tsx`, and `src/styles.css` for a compact mobile/tablet shell, wrapping layout, and internal horizontal table scrolling.
- Update `src/components/ui/sheet.tsx` and `src/components/ui/dialog.tsx` only for Spanish accessible close names and viewport-safe content bounds.
- Add `tests/browser/responsive-app-shell.spec.mjs` to cover route visibility/denial, keyboard open/close and focus return, active navigation, standard widths, table scrolling, dialogs, and a simulated read error against local Supabase.
- Preserve the existing colors, logo, fonts, route map, permission checks, authentication/session behavior, and all financial/database contracts.

## Verification

Write and run the browser regression before UI changes. Then run `npm test`, `npx tsc --noEmit`, `npm run build`, the local browser suite, and `openspec validate chg-14-responsive-app-shell --strict` plus `openspec validate --changes --strict`. Do not reset Supabase or target Cloud.
