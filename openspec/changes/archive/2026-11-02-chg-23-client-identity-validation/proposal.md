# CHG-23 — Validación y duplicados de clientes

## Why
La ficha de clientes acepta cualquier texto en «RNC / Cédula» y comparte con proveedores un validador que únicamente exige nombre y comprueba correo opcional. No distingue documentos dominicanos con formato inválido, documentos duplicados ni personas con nombres similares. PostgreSQL no tiene una unicidad específica para el documento del cliente.

El usuario requiere validaciones sólidas de nombre, cédula y demás datos, con prevención de clientes duplicados. La cédula estructuralmente correcta no equivale a identidad real certificada; la consulta oficial (cuando proceda y esté autorizada) es una verificación separada.

## What Changes
- Validación propia de clientes: nombre, correo, teléfono cuando se aporte, y tipo/valor de documento dominicano (cédula de 11 dígitos, RNC de 9), normalización, comprobación local de formato y dígito de control según reglas verificadas. Documento opcional para cliente no fiscal; no inventar verificación oficial.
- Detección de posibles duplicados en alta y edición por documento normalizado y coincidencias de nombre + datos de contacto, con mensajes claros y acceso al registro existente. El documento no vacío y válido es único incluso entre activos e inactivos; dos personas que comparten nombre no se bloquean automáticamente sin más evidencia.
- Integridad efectiva en PostgreSQL por migración versionada y pruebas reales, manteniendo IDs estables, RLS, registros e historial de crédito/ventas. No normalizar ni eliminar silenciosamente datos legacy; preflight de documentos duplicados/inválidos y estrategia explícita de resolución.

## Capabilities
### New Capabilities
- `client-identity-validation`: validación y deduplicación segura de fichas de clientes.

## Impact
`src/routes/_app/clients.tsx`, nuevo helper/validador de clientes (evitar cambios de comportamiento para proveedores), tipos necesarios, tests unitarios, browser e integración, migración SQL estrictamente acotada. Revisar `src/lib/creditWorkflows.js` y tablas existentes antes de decidir extracción.

## Boundaries
- No crear dependencia de una API externa de DGII/JCE sin autorización, disponibilidad y política de datos. No presentar «cédula real/verificada por JCE» solo por pasar checksum. Si se necesita consulta oficial manual, enlazar a la página oficial de DGII únicamente como ayuda, sin exponer documento a servicios no autorizados.
- El nombre puede coincidir legítimamente entre personas. Detectar coincidencias normalizadas y exigir confirmación/desambiguación de homónimos, no imponer `UNIQUE(name)`.
- No unir ni eliminar clientes automáticamente; no cambiar client_id de ventas/créditos ni reescribir evidencia histórica. No relajar RLS ni otorgar permisos nuevos a empleados.
- No introducir bloqueos que impidan editar perfiles legacy por falta de estrategia explícita. No modificar gestión de proveedores, ventas ni compras salvo pruebas de regresión de la validación compartida.
- Los datos sintéticos para pruebas solo en Supabase local desechable; no Cloud.

## Acceptance
Tres tareas verificables; rechazo de documentos mal formados y duplicados incluso por API y concurrencia, advertencia útil por coincidencia de nombre, edición del mismo registro sin falso duplicado, permiso y aislamiento preservados; pruebas focalizadas y OpenSpec estricto antes de sincronizar/archivar.
