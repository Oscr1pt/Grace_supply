# Spec Delta

## MODIFIED Requirements

### Requirement: Configuración tributaria administrable y pendiente por defecto
La aplicación MUST ofrecer en Ajustes un único interruptor «Aplicar ITBIS» y mantener internamente la tasa V1 fija de 18%, sin permitir que el usuario edite una tasa arbitraria. Guardar ajustes MUST persistir la configuración operativa válida mediante el servidor autorizado y registrar el actor.

#### Scenario: Guardar ITBIS desactivado
- **WHEN** un administrador autorizado guarda Ajustes con «Aplicar ITBIS» desactivado
- **THEN** el servidor conserva `tax_rate = 18`, no agrega impuesto a ventas y la UI confirma el estado guardado tras recargar.

#### Scenario: Tasa fija en V1
- **WHEN** una petición intenta enviar una tasa distinta de 18
- **THEN** PostgreSQL rechaza la operación sin cambiar la configuración efectiva ni habilitar ventas.

#### Scenario: Se guarda la propuesta del 18%
- **WHEN** un administrador guarda la tasa V1 y el interruptor sin autorización tributaria comercial
- **THEN** PostgreSQL conserva la configuración operativa, registra el actor y mantiene separada la habilitación comercial de Cloud.

### Requirement: Coincidencia entre puerta de UI y autoridad de PostgreSQL
El estado `sales_posting_status` SHALL reflejar las condiciones reales de `post_sale`. La UI MUST distinguir un objeto de backend ausente o incompatible de una denegación de permisos y MUST bloquear ventas mientras el servidor no pueda confirmar una política soportada.

#### Scenario: Backend desactualizado
- **WHEN** `save_sales_tax_v1` o `sales_posting_status` no existe, o falta una columna requerida
- **THEN** la UI muestra que el servidor requiere una actualización, conserva el formulario y no afirma que el usuario carece de permisos.

#### Scenario: Permiso insuficiente
- **WHEN** un usuario autenticado sin permiso administrativo intenta guardar Ajustes
- **THEN** PostgreSQL devuelve denegación y la UI muestra un mensaje de autorización sin alterar la configuración.

#### Scenario: Política desconocida por error de lectura
- **WHEN** falla leer el estado de la política o el usuario carece de acceso
- **THEN** la UI muestra estado desconocido y no habilita el botón de contabilización.

#### Scenario: Se fuerza llamada RPC sin aprobación
- **WHEN** un cliente invoca `post_sale` directamente sin política válida
- **THEN** el servidor deniega sin aplicar ningún efecto contable o de inventario.

## ADDED Requirements

### Requirement: Reconciliación de esquema antes de habilitar Cloud
El proyecto SHALL disponer de un procedimiento verificable para comparar migraciones locales, `schema_migrations`, funciones, vistas, permisos y dependencias antes de aplicar cambios en Cloud.

#### Scenario: Plan de actualización seguro
- **WHEN** el historial Cloud no contiene las migraciones requeridas
- **THEN** se documentan respaldo, orden, dry-run, riesgos, verificación posterior y rollback sin ejecutar escrituras automáticamente.

#### Scenario: Cloud no habilitado
- **WHEN** faltan objetos de CHG-18, CHG-25 o CHG-28
- **THEN** no se habilitan ventas ni ITBIS comercial y la evidencia local se conserva separada del estado Cloud.
