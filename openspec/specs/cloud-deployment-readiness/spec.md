# cloud-deployment-readiness Specification

## Purpose

Define controles verificables para preparar y evaluar despliegues Supabase de Grace Supply, diferenciando desarrollo de producción y evitando escrituras remotas hasta contar con autorización explícita.

## Requirements

### Requirement: Destino Cloud explícito y separado
El proceso de preparación MUST identificar el proyecto Cloud mediante el ref aprobado y MUST mantener separados el entorno Cloud de desarrollo y producción. Si la identidad no puede verificarse, el proceso MUST detenerse antes de cualquier operación remota.

#### Scenario: Ref de destino no coincide
- **WHEN** el proyecto enlazado no tiene el ref `qazjfofpfcwopcefupjl` o el ref no puede confirmarse
- **THEN** el operador detiene el procedimiento sin consultar ni modificar ese proyecto.

#### Scenario: Desarrollo y producción usan configuraciones distintas
- **WHEN** se prepara el entorno Cloud de desarrollo
- **THEN** sus URL, secretos, dominio y cuentas de prueba se mantienen separados de producción y no se reutilizan credenciales productivas.

### Requirement: Preflight de historial de migraciones
Antes de proponer una aplicación de migraciones, el operador MUST comparar el historial local y remoto y revisar una simulación de los cambios pendientes. La simulación MUST NOT aplicar migraciones; una historia desconocida o un plan inesperado MUST detener el despliegue.

#### Scenario: Historial conocido y dry run revisado
- **WHEN** el historial remoto coincide con la base esperada y el dry run enumera únicamente las migraciones pendientes aprobadas
- **THEN** el informe registra el resultado como preflight preparado, sin afirmar que las migraciones fueron aplicadas.

#### Scenario: Historial desconocido o divergente
- **WHEN** el remoto contiene una versión desconocida, una discrepancia, drift o una migración inesperada
- **THEN** el operador detiene el proceso y no ejecuta `db push`, `db reset` ni `migration repair`.

#### Scenario: Push real sin aprobación
- **WHEN** no existe autorización específica para modificar el proyecto Cloud
- **THEN** el operador no ejecuta un push real ni despliega Edge Functions.

### Requirement: Configuración Cloud verificada antes de habilitar cuentas
Recovery y provisioning MUST permanecer desactivados en Cloud hasta verificar dominio HTTPS, URLs de redirección exactas, entrega SMTP y secretos de Edge Functions requeridos. Las claves privilegiadas MUST permanecer en el contexto confiable del servidor.

#### Scenario: Correo o redirect sin verificar
- **WHEN** SMTP, remitente, origen HTTPS o allowlist de redirects no han sido probados
- **THEN** `ACCOUNT_RECOVERY_ENABLED` y `ACCOUNT_PROVISIONING_ENABLED` permanecen en `false`.

#### Scenario: Secreto privilegiado en cliente
- **WHEN** una clave `service_role` o secret key aparece en bundle, configuración pública o tráfico del navegador
- **THEN** se detiene la preparación y no se habilitan Auth ni operaciones privadas en Cloud.

### Requirement: Criterios de aceptación y bloqueo del negocio
La preparación MUST registrar verificaciones de RLS, Auth, aislamiento de caché, transacciones, auditoría y Edge Functions, así como los bloqueos pendientes. Las ventas MUST permanecer bloqueadas mientras no exista una política tributaria aprobada.

#### Scenario: Verificaciones de seguridad y negocio satisfactorias
- **WHEN** las pruebas de acceso por rol, revocación, operaciones atómicas, auditoría y aislamiento de sesión pasan en el entorno objetivo
- **THEN** el informe puede recomendar el siguiente paso de despliegue, sujeto a aprobación independiente.

#### Scenario: Falta política tributaria
- **WHEN** tasa, inclusión de impuestos y reglas de redondeo no han sido aprobadas
- **THEN** el flujo de ventas contabilizadas permanece deshabilitado aunque otras verificaciones pasen.
