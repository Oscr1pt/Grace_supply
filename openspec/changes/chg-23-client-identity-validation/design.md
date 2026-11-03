# Design — CHG-23: Validación y deduplicación de clientes

## Evidencia revisada
- `src/routes/_app/clients.tsx` guarda con `validatePartyForm(form)`, luego `useSupabaseTable('clients').insert/update`. `formErrors` tipa solo `name|email`; el campo `rnc` se introduce libremente.
- `validatePartyForm` en `src/lib/creditWorkflows.js` es compartido con proveedores y solo valida nombre/correo. Sus pruebas actuales permiten identificaciones arbitrarias: no cambiarlo indiscriminadamente.
- `public.clients`: `name` obligatorio, `rnc` nullable y sin unicidad. `client_credits` y `sales` usan UUID del cliente; conservar referencias e historial.
- `clients_insert/update` ya requieren permiso `clients` mediante RLS. La UI puede sugerir coincidencias, pero PostgreSQL debe rechazar duplicaciones documentales concurrentes.

## D1 — Reglas de datos y UX (tarea 1.1)
- Separar `validateClientForm` de `validatePartyForm` para no modificar proveedores. Documento opcional si no aplica; si se aporta, admitir cédula de 11 dígitos o RNC de 9 dígitos, eliminando únicamente separadores admitidos para comparar. No aceptar texto libre, caracteres extraños ni secuencias triviales; aplicar algoritmos de dígito verificador con tests de vectores correctos y erróneos. **El checksum no verifica identidad real, pertenencia ni estado ante JCE/DGII**.
- Mostrar error inline accesible, formato esperado y opción explícita de cliente sin documento cuando no se requiere fiscalmente. En nombre, trim, espacios repetidos, longitud razonable y caracteres válidos sin prohibir tildes/ñ. Teléfonos dominicanos o internacionales si se informan, con validación sensata (no asumir que solo existen +1).
- Detectar un documento ya utilizado por cualquier cliente, activo/inactivo, al cargar/cambiar; ofrecer navegación al registro existente. Para coincidencia de nombre normalizado, dar alerta y disambiguación con teléfono/correo; bloquear duplicado evidente de identidad y permitir homónimos con confirmación explícita y datos diferenciadores. En edición, excluir el mismo UUID.
- No asumir lista local completa si falla carga o permisos; en caso de duda, depender de rechazo transaccional del servidor. No retener información privada en logs o analytics.

## D2 — Integridad PostgreSQL y compatibilidad (tarea 2.1)
- Agregar una migración forward-only que normalice la comparación de documento no vacío (sin perder original si se necesita mostrar formato) y garantice unicidad efectiva en DB, con índices/constraints adecuados. Las comprobaciones no deben depender de lectura previa de UI ni fallar con solicitudes paralelas.
- Revisar datasets legacy mediante preflight read-only: duplicados entre registros, documentos inválidos y valores vacíos. No borrar/combinar ni reasignar referencias automáticamente. Si datos existentes impiden índice/constraint, registrar IDs y bloquear la migración con instrucción de remediación segura; para constraints incrementales considerar una estrategia sin bloqueo destructivo y explicar limitaciones.
- Asegurar rechazo de escritura inválida desde REST/API cuando corresponda, preservando permisos, RLS y privilegios de columnas. No entregar errores con listados ajenos; mapear constraint violations a errores amigables y recuperables en UI.
- Los clientes sin documento siguen permitidos para operaciones no fiscales. La creación de cliente con cédula válida no autoriza facturación fiscal por sí sola (fase CHG-25 define política tributaria). No alterar pagos o documentos existentes.

## D3 — Verificación acotada (tarea 3.1)
- Ejecutar exclusivamente en proyecto Supabase local **desechable y confirmado**; nunca Cloud ni stacks ajenos. Preparar fixtures propios y limpiar solo lo creado por las pruebas.
- Pruebas unitarias: nombre normalizado, acentos/espacios, correo opcional, teléfonos, identificaciones válidas/erróneas y longitud, formato con/sin guiones, homónimos, mismo UUID en edición, documento vacío.
- Integración DB: duplicidad con distintas formas del mismo documento, cliente activo/inactivo, concurrencia, API directa saltando frontend, migración sobre baseline y remediación preflight, denegación RLS, conservación de créditos/ventas. Browser: alta, edición, errores inline, sugerencia de registro existente, confirmación de homónimo, red/respuesta fallida y responsive/teclado.
- Ejecutar `npm test`, TypeScript, ESLint afectado, build, `git diff --check`, `openspec validate chg-23-client-identity-validation --strict` y suites focalizadas relevantes. Informar suites omitidas, no afirmar validación oficial externa.

## Riesgos
1. Nombres iguales no significan identidad igual; un índice `UNIQUE(name)` bloquearía usuarios legítimos.
2. Un documento matemáticamente válido puede no haber sido emitido o pertenecer a otra persona. DGII publica consulta por RNC/cédula, pero la consulta de contribuyentes y la de registrados tienen coberturas distintas; no inferir existencia general de JCE.
3. No se debe desplegar constraint sobre datos legacy desconocidos sin preflight.
4. No adaptar las pruebas rebajando seguridad o borrando historial comercial.
