# Spec Delta

## Purpose

Contener el acceso anónimo a datos privados y definir condiciones reproducibles de desarrollo y recuperación previa a la entrega de Grace Supply.

## ADDED Requirements

### Requirement: Verificación de identidad del nuevo destino

Antes de toda consulta u operación remota, el operador MUST confirmar que la URL configurada para `supabase-grace-v2-write` contiene exactamente el project ref aprobado `qazjfofpfcwopcefupjl`.

#### Scenario: Solo hay evidencia local

- **WHEN** solo se dispone del roadmap, del código y de los SQL locales
- **THEN** se registra el riesgo como antecedente y el estado remoto como no verificado, sin afirmar que el proyecto correcto fue inspeccionado.

#### Scenario: Verificación de metadatos

- **WHEN** la URL del MCP coincide con `qazjfofpfcwopcefupjl`
- **THEN** el operador puede comenzar la inspección de metadatos del proyecto nuevo.

#### Scenario: La URL del MCP no coincide

- **WHEN** el MCP informa una URL distinta o no permite verificar el project ref
- **THEN** se detienen las consultas y operaciones remotas y no se accede a ningún proyecto.

### Requirement: Separación de evidencia histórica e inicial

La auditoría sobre `ooytnnqxlxxgyenrutky` MUST permanecer como registro histórico solamente. La verificación del nuevo proyecto MUST documentar por separado los metadatos efectivamente observados, los recursos ausentes y las preguntas pendientes. MUST NOT leer filas privadas ni declarar controles verificados sin evidencia del nuevo destino.

#### Scenario: Inspección inicial del proyecto nuevo

- **WHEN** la identidad del destino nuevo ya fue confirmada
- **THEN** se inspeccionan tablas, historial de migraciones, grants, RLS/policies, vistas y RPC mediante metadatos de solo lectura, sin consultar datos de negocio.

### Requirement: Denegación anónima de datos privados

El nuevo sistema MUST denegar lectura y mutación anónima de recursos privados y ejecución anónima de funciones que los expongan, independientemente de que la interfaz esté publicada. Las verificaciones MUST evaluar privilegios PostgreSQL efectivos y RLS/policies para cada rol cliente. La disponibilidad de GraphQL o una respuesta HTTP 200 MUST NOT considerarse prueba de acceso a datos.

#### Scenario: Cliente anónimo llama REST/RPC

- **WHEN** un cliente sin identidad intenta leer o mutar un recurso privado
- **THEN** no obtiene filas ni realiza cambios y la denegación se verifica con metadatos y fixtures sintéticas.

#### Scenario: Endpoint GraphQL disponible sin permiso sobre recursos

- **WHEN** `anon` o `authenticated` pueden ejecutar la función GraphQL, pero carecen de privilegios efectivos sobre una relación privada
- **THEN** la relación y sus campos de lectura o mutación no son accesibles a ese rol; el resultado se verifica con una relación sintética reversible y no solo por el código HTTP.

#### Scenario: El cliente heredado requiere acceso anónimo

- **WHEN** una ruta antigua depende de permisos anónimos para operar
- **THEN** esa ruta permanece cerrada hasta que Auth y RLS permitan un reemplazo seguro.

### Requirement: Entornos de desarrollo aislados

Las pruebas de desarrollo MUST usar Supabase local o un proyecto de pruebas aislado y datos sintéticos. No se requiere un proyecto independiente de staging para cada cambio. La preparación de entrega MUST separar la configuración productiva.

#### Scenario: Prueba de migraciones

- **WHEN** se valida una instalación o flujo de Auth/RLS
- **THEN** se usan datos y cuentas sintéticas fuera de cualquier entorno productivo.

#### Scenario: Datos reales inesperados

- **WHEN** se detectan filas reales o una aplicación compartida en el proyecto que se iba a resetear
- **THEN** se detiene el proceso destructivo y se solicita autorización con alcance específico.

### Requirement: Migraciones reproducibles y entorno aislado

Los cambios de seguridad propios de CHG-00 MUST poder reproducirse desde sus migraciones versionadas y verificarse en una base local o aislada con cuentas y fixtures sintéticas. CHG-00 MUST conservar el esquema de referencia y los archivos de migración. La construcción y reconstrucción integral del esquema comercial se valida en CHG-03, coordinado con CHG-06.

#### Scenario: Instalación limpia

- **WHEN** se crea una base aislada vacía para validar los cambios propios de CHG-00
- **THEN** las migraciones de seguridad de CHG-00 instalan y permiten verificar sus controles sin exigir que exista el esquema comercial, que corresponde a CHG-03/CHG-06.

### Requirement: Recuperación reproducible durante desarrollo

Durante CHG-00, la recuperación de sus propios cambios MUST ensayarse en una base aislada o mediante una transacción reversible con fixtures sintéticas. El ensayo MUST incluir un fallo controlado y verificar rollback, objetos de CHG-00 e historial de migraciones. La reconstrucción integral del esquema comercial se prueba en CHG-03/CHG-06. No se requiere preservar filas de prueba ni datos históricos del proyecto anterior.

#### Scenario: Recuperación del entorno de desarrollo

- **WHEN** se realiza el ensayo de recuperación
- **THEN** se usan datos sintéticos y se registran los pasos, resultado y evidencia del esquema e historial preservados, sin exponer secretos ni filas privadas.

### Requirement: Decisiones de recuperación previas a producción

La cobertura de backups, sus límites, custodio, RPO, RTO y presupuesto MUST quedar documentados como decisiones pendientes para acordarse con el cliente antes de la entrega a producción. Esas decisiones MUST NOT bloquear el inicio o la validación del desarrollo de CHG-00.

#### Scenario: Desarrollo antes del acuerdo de objetivos productivos

- **WHEN** los objetivos RPO/RTO y el presupuesto de producción siguen pendientes
- **THEN** pueden completarse las verificaciones y la recuperación sintética de CHG-00, registrando esas decisiones para la entrega.

