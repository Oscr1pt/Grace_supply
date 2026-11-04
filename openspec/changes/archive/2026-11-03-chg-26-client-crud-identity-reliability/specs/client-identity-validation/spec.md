# Spec Delta

## MODIFIED Requirements

### Requirement: Datos de cliente validados y recuperables
El formulario SHALL validar nombre, correo y teléfono cuando se aporten, y documento de identidad (cédula o RNC) SHALL ser obligatorio para nuevas altas identificadas. La validación documental SHALL incluir normalización y reglas de formato/dígito de control documentadas, sin afirmar verificación oficial de identidad.

#### Scenario: Nueva alta sin documento
- **WHEN** se intenta registrar un cliente identificado sin cédula o RNC
- **THEN** la UI muestra un error de campo y el servidor rechaza la escritura sin crear la fila.

#### Scenario: Cliente aporta cédula mal formada
- **WHEN** el usuario intenta guardar una cédula inválida o un valor documental arbitrario
- **THEN** la UI muestra error de campo y el servidor rechaza la escritura inválida sin crear ni modificar el cliente.

#### Scenario: Cliente sin documento fiscal
- **WHEN** un cliente no fiscal se registra sin documento y el flujo lo clasifica como histórico/no identificado
- **THEN** puede guardarse si satisface las demás validaciones, sin inventar cédula ni RNC.

#### Scenario: Cliente histórico sin documento
- **WHEN** se consulta o edita un cliente legado sin documento
- **THEN** conserva su UUID e historial y puede mantenerse sin documento hasta un proceso autorizado de completado.

#### Scenario: Fallo de validación o transporte
- **WHEN** falla la validación, la red o la autorización al guardar
- **THEN** el formulario conserva sus valores y muestra un mensaje específico sin anunciar éxito.

### Requirement: Prevención segura de clientes duplicados
La aplicación MUST impedir duplicados de un mismo documento normalizado en todos los clientes, activos o inactivos, incluso mediante API directa y operaciones concurrentes. Los nombres iguales SHALL generar señales para desambiguar, sin asumir que indican la misma identidad.

#### Scenario: Documento repetido con distinto formato
- **WHEN** una segunda ficha utiliza la misma cédula/RNC con o sin guiones
- **THEN** el servidor rechaza el nuevo registro y la UI ofrece recuperar el cliente previo sin crear una identidad duplicada.

#### Scenario: Dos personas comparten nombre
- **WHEN** una persona nueva comparte nombre normalizado con otra, pero tiene documento o contacto diferente
- **THEN** la UI muestra las coincidencias autorizadas y exige confirmar que son personas diferentes antes de guardar.

#### Scenario: Edición de registro existente
- **WHEN** se guardan cambios de un cliente sin cambiar su documento ni UUID
- **THEN** el payload excluye columnas generadas y la operación no se considera duplicación del propio registro.

### Requirement: Integridad histórica y migraciones seguras
La restricción de documentos SHALL implementarse en PostgreSQL mediante migración versionada, sin relajar RLS ni alterar ventas, créditos o identidades históricas. La preparación SHALL detectar datos preexistentes incompatibles y detener la aplicación insegura de restricciones.

#### Scenario: Legacy con documentos duplicados
- **WHEN** el preflight detecta dos clientes históricos que comparten documento normalizado
- **THEN** no se eliminan ni fusionan, la migración informa conflicto y queda pendiente de resolución autorizada.

#### Scenario: Acceso no autorizado a registros
- **WHEN** un actor sin permiso de clientes intenta consultar o mutar fichas por REST o UI
- **THEN** PostgreSQL deniega según RLS vigente y no se exponen datos privados.

## ADDED Requirements

### Requirement: Payloads de cliente limitados a campos editables
Las operaciones de alta y edición SHALL enviar únicamente campos editables por el usuario. Columnas generadas, UUID, timestamps y valores administrados por el servidor MUST quedar fuera del payload salvo que una RPC autorizada los establezca.

#### Scenario: Edición de fila cargada
- **WHEN** se edita un cliente que incluye `rnc_normalized` en la respuesta
- **THEN** la petición PATCH omite esa columna y PostgreSQL no devuelve 428C9.

#### Scenario: Conflicto concurrente
- **WHEN** dos operaciones intentan registrar el mismo documento normalizado
- **THEN** solo una se confirma; la otra recibe un conflicto recuperable sin relajar la restricción.
