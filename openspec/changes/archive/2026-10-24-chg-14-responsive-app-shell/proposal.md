# CHG-14-RESPONSIVE-APP-SHELL — Navegación, layout y accesibilidad compartida

## Why
El layout principal usa un sidebar fijo de 256 px y contenido con padding horizontal fijo; no existe una navegación móvil explícita. Los controles reutilizados necesitan estados de foco, teclado y densidad coherentes.

## What Changes
- Conservar paleta negro/dorado, tipografías, logo, jerarquía de navegación y rutas existentes.
- Dar navegación de escritorio/tablet/móvil accesible, con control de apertura/cierre, foco, nombres y estado activo.
- Uniformar contenedor, encabezados, tablas desbordables, modales, mensajes de lectura obsoleta y estados vacíos sin un rediseño completo.

## Capabilities
### New Capabilities
- `responsive-application-shell`: experiencia funcional y visual revisada de Grace Supply.

## Impact
- `src/routes/_app.tsx`
- `src/components/AppSidebar.tsx`
- `src/components/PageHeader.tsx`
- `src/styles.css`
- `src/components/ui/**`

## Boundaries
- No sustituir el sistema visual; preferir tokens existentes a crear otros incompatibles.
- El menú solo muestra rutas permitidas; ocultar navegación NO se considera autorización.
- Tablas grandes deben mantener acceso al dato sin scroll horizontal de toda la página; priorizar contenido en pantallas reducidas.
- Preservar banners de error de lectura y separación de sesión ya implementada.

## Acceptance
Tres tareas verificables; mejoras acotadas, sin alterar contratos financieros/Auth existentes, con regresión funcional, accesibilidad, build y OpenSpec estricto.
