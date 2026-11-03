# client-identity-validation Specification

## Purpose
Validación confiable, prevención de duplicados y conservación de historia comercial en fichas de clientes de Grace Supply.

## Requirements

### Requirement: Datos de cliente validados y recuperables
El formulario SHALL validar nombre, correo y teléfono cuando se aporten, y documento de identidad (cédula o RNC) opcional según tipo de cliente. La validación documental SHALL incluir normalización y reglas de formato/dígito de control documentadas, sin afirmar verificación oficial de identidad.

#### Scenario: Cliente aporta cédula mal formada
- **WHEN** el usuario intenta guardar una cédula inválida o un valor documental arbitrario
- **THEN** la UI muestra error de campo y el servidor rechaza la escritura inválida sin crear ni modificar el cliente.

#### Scenario: Cliente sin documento fiscal
- **WHEN** un cliente no fiscal se registra sin documento
- **THEN** puede guardarse si satisface las demás validaciones, sin inventar cédula ni RNC.

### Requirement: Prevención segura de clientes duplicados
La aplicación MUST impedir duplicados de un mismo documento normalizado en todos los clientes, activos o inactivos, incluso mediante API directa y operaciones concurrentes. Los nombres iguales SHALL generar señales para desambiguar, sin asumir que indican la misma identidad.

#### Scenario: Documento repetido con distinto formato
- **WHEN** una segunda ficha utiliza la misma cédula/RNC con o sin guiones
- **THEN** el servidor rechaza el nuevo registro, y la UI ofrece recuperar el cliente previo sin crear una identidad duplicada.

#### Scenario: Dos personas comparten nombre
- **WHEN** una persona nueva comparte nombre con otra, pero tiene identificador o datos de contacto distintos
- **THEN** la UI advierte la coincidencia y permite una confirmación explícita de que son personas diferentes.

#### Scenario: Edición de registro existente
- **WHEN** se guardan cambios de un cliente sin cambiar su documento ni UUID
- **THEN** la operación es válida y no se considera duplicación del propio registro.

### Requirement: Integridad histórica y migraciones seguras
La restricción de documentos SHALL implementarse en PostgreSQL mediante migración versionada, sin relajar RLS ni alterar ventas, créditos o identidades históricas. La preparación SHALL detectar datos preexistentes incompatibles y detener la aplicación insegura de restricciones.

#### Scenario: Legacy con documentos duplicados
- **WHEN** el preflight detecta dos clientes históricos que comparten documento normalizado
- **THEN** no se eliminan ni fusionan, la migración informa conflicto y queda pendiente de resolución autorizada.

#### Scenario: Acceso no autorizado a registros
- **WHEN** un actor sin permiso de clientes intenta consultar o mutar fichas por REST o UI
- **THEN** PostgreSQL deniega según RLS vigente y no se exponen datos privados.
