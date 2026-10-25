# Design — CHG-14-RESPONSIVE-APP-SHELL: Navegación, layout y accesibilidad compartida

## Evidencia observada en main
El layout principal usa un sidebar fijo de 256 px y contenido con padding horizontal fijo; no existe una navegación móvil explícita. Los controles reutilizados necesitan estados de foco, teclado y densidad coherentes.

## Archivos y áreas de trabajo
- `src/routes/_app.tsx`
- `src/components/AppSidebar.tsx`
- `src/components/PageHeader.tsx`
- `src/styles.css`
- `src/components/ui/**`

## Diseño propuesto
- Conservar paleta negro/dorado, tipografías, logo, jerarquía de navegación y rutas existentes.
- Dar navegación de escritorio/tablet/móvil accesible, con control de apertura/cierre, foco, nombres y estado activo.
- Uniformar contenedor, encabezados, tablas desbordables, modales, mensajes de lectura obsoleta y estados vacíos sin un rediseño completo.

## Restricciones y decisiones
- No sustituir el sistema visual; preferir tokens existentes a crear otros incompatibles.
- El menú solo muestra rutas permitidas; ocultar navegación NO se considera autorización.
- Tablas grandes deben mantener acceso al dato sin scroll horizontal de toda la página; priorizar contenido en pantallas reducidas.
- Preservar banners de error de lectura y separación de sesión ya implementada.

## Estrategia de verificación
- Validación del comportamiento autorizado y persistencia real; fallos de API, carga, cero filas y cambios de sesión.
- Captura visual comparativa escritorio/tablet/móvil y revisión de accesibilidad por teclado; no introducir una nueva identidad visual.
- Ejecutar pruebas aplicables del módulo, `npm test`, TypeScript, build y `openspec validate chg-14-responsive-app-shell --strict` tras implementar.
- Las listas exhaustivas de QA manual (happy/sad/edge) corresponden a la fase 2, una vez completados estos Changes.
