# Proposal — Ventas a clientes ocasionales y acceso rápido

## Why

El formulario actual exige seleccionar un cliente registrado y `post_sale` rechaza cualquier venta sin un cliente activo. Esto impide registrar ventas al contado de mostrador sin crear fichas que no representan una relación de cliente identificada; además, el Dashboard no ofrece acceso rápido a Nueva venta.

## What Changes

- Admitir en una venta al contado un nombre de cliente ocasional capturado como snapshot de la venta, sin insertar ni asociar una fila de `clients`.
- Mantener la venta de cliente registrado por UUID; las ventas a crédito continuarán requiriendo cliente registrado y activo.
- Mostrar el snapshot del cliente ocasional en la búsqueda, historial y recibo, sin resolver identidad por coincidencia de nombre.
- Añadir «Registrar venta» a Acciones rápidas, visible con permiso `sales` y sujeto a los controles existentes de sesión y política tributaria.
- Conservar sin cambios el cálculo ITBIS, la idempotencia, precios, inventario, anulaciones, créditos y la leyenda fiscal del recibo.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `atomic-business-posting`: ampliar `post_sale` para ventas al contado con cliente ocasional y snapshot de nombre, manteniendo autorización y cálculo financiero de servidor.
- `safe-sales-purchases-ui`: ofrecer las dos modalidades de cliente y la acción rápida de venta con estados y restricciones actuales.
- `financial-evidence-preservation`: conservar el nombre capturado como evidencia histórica inmutable de la contraparte.

## Impact

- PostgreSQL: migración forward-only para permitir `sales.client_id` NULL y agregar snapshot de nombre; actualización de `post_sale` y `search_sales_history`.
- UI/tipos: `src/routes/_app/sales.tsx`, `src/routes/_app/dashboard.tsx`, `src/lib/businessDocumentValidation.js` y declaraciones, `src/lib/historyQueries.ts`, `src/lib/types.ts` y tipos de base de datos.
- Pruebas unitarias, integración/Auth-RLS y Playwright.
- Sin nuevos clientes, cambios a `client_credits`, reglas tributarias ni cambios de permisos/RLS.
