---
version: alpha
name: Grace Supply
description: Business operations for a small jewelry retailer, presented as a calm, dense administrative workspace.
colors:
  primary: "light oklch(0.12 0.005 90); dark #D4AF37"
  accent: "#D4AF37"
  background: "oklch(0.985 0.002 90)"
  foreground: "oklch(0.12 0.005 90)"
  surface: "#FFFFFF"
  muted: "oklch(0.96 0.002 90)"
  border: "oklch(0.91 0.003 90)"
  danger: "oklch(0.55 0.22 25)"
typography:
  sans:
    fontFamily: "Inter, system-ui, sans-serif"
  display:
    fontFamily: "Cormorant Garamond, serif"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, monospace"
omitted:
  - section: spacing
    reason: "The application uses existing Tailwind spacing utilities; src/styles.css does not define a separate global spacing scale."
rounded:
  DEFAULT: "var(--radius)"
  sm: "calc(var(--radius) - 4px)"
  md: "calc(var(--radius) - 2px)"
  lg: "var(--radius)"
components:
  button: { }
  card: { }
  dialog: { }
  input: { }
  table: { }
---

# Grace Supply Design System

## Overview

Grace Supply uses a restrained black, white, and gold visual language for daily retail operations. The interface favors clear data hierarchy and familiar controls over decorative treatments.

- **Audience and primary job:** A small jewelry business team managing sales, purchasing, inventory, clients, suppliers, expenses, and settings.
- **Markets and locale:** Dominican Republic; application copy is Spanish, with Dominican peso formatting and business dates interpreted in `America/Santo_Domingo` where specified by the relevant contract.
- **Usage scene:** Repeated desk and mobile use; dense administrative tables must remain legible and controls usable at narrow widths.
- **Register:** Quiet operational tool with restrained luxury cues.
- **Memorable signature:** A small metallic-gold action accent against mostly neutral surfaces.
- **Restraint:** Keep colors, shadows, animation, and large display typography out of dense history rows and filter controls.
- **Token ownership:** This document mirrors the runtime tokens in `src/styles.css`; that stylesheet and shared UI components are the source of truth.

## Colors and typography

Use the exact runtime CSS variables and Tailwind mappings from `src/styles.css`. Gold indicates the primary action or focus accent, not success or warning. Destructive actions use the existing destructive semantic tokens. Use Inter for controls, tables, and body copy; Cormorant Garamond is reserved for established display headings. Numeric identifiers may use the existing monospace utility.

## Layout and components

Follow the application shell and `PageHeader`. Use the existing spacing and border tokens, rounded controls, Radix-based selects, and shared button/input components. History filters stack on narrow screens and form a compact responsive grid on wider screens. Tables may scroll within their own bordered container; the document itself must not acquire unintended horizontal overflow. Pagination remains adjacent to the table and reachable by keyboard.

## Interaction states

Use explicit loading, error, no-records, and no-matches states. Errors stay visible with a retry action when retry is safe. Search has a clear control, respects input composition, and ignores stale responses. Filters reset pagination to the first page. Do not use optimistic state for history reads.

## Do and don't

- **Do:** Preserve existing module vocabulary, shared controls, focus indicators, and permission-gated actions.
- **Do:** Keep the tax, receipt, and financial document content unchanged while improving history navigation.
- **Don't:** Add decorative panels, charts, or new component-library dependencies for history filters.
- **Don't:** shrink the document layout to hide table overflow; contain scrolling within the existing table surface.
