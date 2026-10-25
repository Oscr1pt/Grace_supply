# CHG-20-SETTINGS-LABEL-SAFETY — Ajustes comprensibles y configuración de etiquetas

## Why
La pantalla Ajustes presenta un campo de tasa tributaria configurable mientras la venta permanece bloqueada por política no aprobada; 'Restablecer' aplica valores por defecto remotos sin confirmación, y 'Zona de peligro' dice eliminar todos los datos cuando solo borra caché local. Existe guardado de etiquetas independiente del formulario.

## What Changes
- Corregir microcopy, estados y validaciones de datos del negocio; aclarar que la tasa no aprueba la política fiscal.
- Diferenciar guardar/restablecer y cambios de etiquetas con confirmación de persistencia, revisión de conflictos y errores.
- Renombrar y restringir descriptivamente la limpieza de caché local; nunca insinuar borrado de datos Cloud.

## Capabilities
### New Capabilities
- `safe-business-settings-ui`: experiencia funcional y visual revisada de Grace Supply.

## Impact
- `src/routes/_app/settings.tsx`
- `src/lib/settings.ts`
- `src/components/BarcodeLabel.tsx`
- `src/routes/_app/inventory.tsx`
- `tests/**`

## Boundaries
- No modificar `tax_policy_approved` ni desbloquear ventas mediante ajustes; es una aprobación de negocio separada.
- 'Restablecer' debe informar sus efectos y pedir confirmación porque escribe ajustes remotos.
- La limpieza de caché local no borra PostgreSQL; preservar aislamiento de sesiones y datos privados.
- Evitar estado de formulario obsoleto si se guardaron dimensiones de etiqueta en un diálogo aparte.

## Acceptance
Tres tareas verificables; mejoras acotadas, sin alterar contratos financieros/Auth existentes, con regresión funcional, accesibilidad, build y OpenSpec estricto.
