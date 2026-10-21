# Grace Supply — Estado real del proyecto y decisiones de desarrollo

**Actualizado:** 2026-10-20 (hora local de República Dominicana; confirmado por el propietario en conversación)  
**Repositorio:** `Oscr1pt/Grace_supply`  
**Rama de trabajo:** `feature/database-remediation`  
**Estado:** criterios de planificación; este documento no autoriza escrituras a Supabase.

## Hechos confirmados por el propietario

1. **Grace Supply aún está en desarrollo.** No se ha publicado en un dominio, no está en producción, no ha sido entregado a su cliente y no tiene usuarios finales operando.
2. **La base de datos actual contiene solamente registros de prueba.** Su conservación histórica no es necesaria: el propietario acepta que estos datos de prueba pueden descartarse durante la preparación del producto, previa revisión de alcance y autorización explícita antes de ejecutar acciones destructivas.
3. El destino GitHub correcto es `Oscr1pt/Grace_supply`. El propietario informa haber corregido el remote local `origin`. Codex debe volver a comprobarlo; las referencias anteriores a `Oscr1pt/Imperio_gold.git` en los artefactos son **observaciones históricas ya comunicadas como resueltas**, no prueba de que el error siga presente.
4. No se implementará integración con DGII, NCF ni e-CF en esta entrega. Los recibos son internos.
5. Se conservará el **inicio de sesión mediante nombre de usuario y contraseña**, respaldado por **Supabase Auth**; el identificador username no sustituye el identificador nativo de Auth. El backend hará la vinculación segura y verificará la contraseña mediante el servicio de Auth. El correo de recuperación podrá asignarse; **aún debe decidirse si cada empleado dispondrá de un buzón individual controlado por él o si habrá recuperación asistida por el administrador**.

## Consecuencias técnicas para OpenSpec

### CHG-00 — Contención y entorno
- Tratar Supabase actual como **base de desarrollo**, siempre que el project ref se contraste con el proyecto correcto. La ausencia de dominio no implica que la API PostgREST no sea accesible por Internet: verificar grants, políticas RLS y accesos anónimos de todas formas.
- No existe todavía corte productivo ni ventana de mantenimiento para empleados del cliente. La contención de la API sigue siendo prioritaria.
- No exigir un proyecto de staging independiente *como prerrequisito absoluto* para cada cambio de desarrollo. Las pruebas de instalación desde cero pueden usar un Supabase local o un proyecto de pruebas aislado. **Antes de la entrega** sí deberán existir proceso de despliegue, configuración separada de producción, ensayos de recuperación y pruebas integrales.
- Preservar **el código, las migraciones versionadas, la configuración no secreta y el esquema de referencia**; no es necesario conservar las filas de negocio de prueba. Nunca publicar dumps con secretos ni credenciales.

### CHG-03 / CHG-06 — Esquema
- Preferir **diseñar un esquema limpio desde cero**, reproducible desde migraciones, en lugar de dedicar esfuerzo a mapeos exhaustivos de IDs, backfills financieros y conciliación de registros de prueba.
- Elegir y documentar una única convención de claves (por ejemplo UUID generado en PostgreSQL), claves foráneas, precisión monetaria y constraints, y actualizar el código TypeScript a ese contrato.
- La instalación limpia y datos semilla sintéticos reemplazan la obligación de migrar ventas, compras y créditos ficticios. Si se detectan datos reales inesperados, **detener y pedir confirmación**.
- Nunca ejecutar `DROP`, `TRUNCATE`, `DELETE`, `supabase db reset` ni recrear Auth sin aprobación separada del usuario, aunque los datos sean de prueba.

### CHG-04 / CHG-05 — Auth y RLS
- No es necesario conservar las contraseñas ni identidades legacy de prueba. Se podrán crear **nuevas cuentas de prueba** en Supabase Auth, sin trasladar credenciales viejas.
- Mantener username + password en la UI; Supabase Auth valida la contraseña. No crear un endpoint público que exponga el correo interno por username; diseñar resolución segura, rate limiting, protección contra enumeración y errores genéricos.
- Los correos de recuperación deben identificar una cuenta de forma única y ser controlados por el titular o un procedimiento administrativo con verificación explícita.
- Desplegar Auth y RLS de forma coherente; denegar `anon` acceso a información privada.

### CHG-07 / CHG-08 — Finanzas y trazabilidad
- No hay obligaciones de preservar transacciones históricas reales en la base actual, pero **el sistema entregado sí deberá conservar historial y auditoría de todas las operaciones reales futuras**.
- Diseñar y probar transacciones, idempotencia, anulaciones, compensaciones y conciliación con datos sintéticos. Las reglas de negocio del cliente deben confirmarse antes de declararlas aprobadas.

## Pendientes de decisión (NO asumir)
- Confirmar el project ref y que el proyecto Supabase conectado se usa exclusivamente para desarrollo/pruebas.
- Confirmar que no hay datos reales ni otra aplicación compartiendo el proyecto antes de solicitar un reset.
- Aprobar expresamente cualquier operación destructiva, con lista concreta de tablas/objetos afectados y plan de reconstrucción desde migraciones.
- Confirmar correo de recuperación **único por empleado** (preferible) o flujo verificado de administración si no dispone de correo propio.
- Confirmar matriz de permisos, cálculo de impuestos/precios, reglas de anulaciones, unidades y política de retención antes de finalizar operaciones productivas.
- Antes de entregar: responsables del negocio, infraestructura final, procedimientos de backups/restauración y RPO/RTO realistas para el plan contratado.

## Instrucción de revisión para Codex

**Revisar los ocho Changes OpenSpec** de `openspec/changes/` para alinear `proposal.md`, `design.md`, `specs/` y `tasks.md` con este estado. En particular, eliminar supuestos de que el sistema ya tiene datos reales en producción y sustituir las tareas de migración histórica y preservación de datos de prueba por instalación limpia y pruebas de migraciones. **No aumentar de tres tareas principales por Change.** Corregir notas obsoletas sobre el remote tras comprobarlo localmente.

Esta revisión es **solo de planificación**. No aplicar cambios de código, migraciones, reseteos, políticas, credenciales, Auth, ni datos en Supabase hasta recibir autorización explícita para la acción concreta.
