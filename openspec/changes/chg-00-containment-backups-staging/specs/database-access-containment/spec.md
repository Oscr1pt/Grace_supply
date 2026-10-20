# Spec Delta

## Purpose

Contener exposición de información de Grace Supply y exigir recuperación probada antes de habilitar cambios del despliegue.

## ADDED Requirements

### Requirement: Verificación de exposición sin datos privados
El procedimiento de verificación MUST usar metadatos y sondas que no recuperen filas privadas ni contraseñas, y MUST distinguir evidencia observada, antecedentes reportados y verificaciones pendientes.

#### Scenario: Estado remoto aún desconocido
- **WHEN** solo se dispone del roadmap y código local
- **THEN** se registra la exposición previa como antecedente urgente y el estado actual como no verificado, sin declarar contención lograda.

#### Scenario: Sonda autorizada
- **WHEN** se comprueba acceso en el entorno aprobado
- **THEN** se usan metadatos, peticiones sin cuerpo de datos privados y recursos sintéticos, conservando solo resultado, fecha, entorno y alcance.

### Requirement: Barrera de contención efectiva
El sistema SHALL impedir lectura y mutación anónima de las tablas sensibles y ejecución anónima de funciones que puedan exponerlas; ocultar la interfaz no constituye contención.

#### Scenario: Cliente sin identidad
- **WHEN** un cliente anónimo intenta acceder por REST o RPC a recursos sensibles
- **THEN** no obtiene filas ni cambios y se prueba la denegación con una fixture sintética o inspección de privilegios y políticas, sin inferir seguridad de un resultado vacío.

#### Scenario: Incompatibilidad del cliente heredado
- **WHEN** mantener el cliente funcionando requiere acceso anónimo a datos privados
- **THEN** permanece cerrado el acceso de datos y se informa interrupción hasta disponer de una ruta autenticada segura.

### Requirement: Recuperación aislada verificable
El proceso de despliegue MUST exigir respaldo protegido y restauración ensayada en un destino aislado, con RPO/RTO aprobados y comprobación de esquema, permisos y consistencia.

#### Scenario: Ensayo de recuperación
- **WHEN** se restaura un respaldo sintético o un respaldo real en entorno restringido autorizado
- **THEN** se comprueban integridad, conteos, relaciones, permisos y tiempo de recuperación contra los objetivos aprobados sin copiar información sensible al repositorio.

#### Scenario: Recuperación no demostrada
- **WHEN** no hay evidencia de restauración exitosa dentro de los objetivos
- **THEN** los despliegues posteriores quedan bloqueados.

### Requirement: Separación de entornos y rotación controlada
El proceso SHALL separar staging de producción, usar datos sintéticos en pruebas funcionales y registrar responsables y comprobaciones de invalidación de secretos realmente expuestos.

#### Scenario: Credenciales expuestas
- **WHEN** se confirma exposición de una credencial o sesión heredada
- **THEN** se planifica su invalidación, distribución segura y comprobación de rechazo sin registrar su valor; la recuperación de cuentas se coordina con CHG-04.

### Requirement: Autorización y recuperación sin regresión
Todo corte de seguridad MUST tener propietario, aprobación humana, evidencia de salida y una recuperación que conserve la denegación de acceso inseguro.

#### Scenario: Fallo durante el corte
- **WHEN** falla un criterio obligatorio de seguridad o recuperación
- **THEN** se mantiene o retorna a mantenimiento seguro y nunca se reabre el acceso anónimo para recuperar disponibilidad.

