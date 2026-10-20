# Spec Delta

## Purpose

Establecer identidad verificable para Grace Supply sin credenciales heredadas expuestas ni privilegios controlados por el navegador.

## ADDED Requirements

### Requirement: Recuperación de cuentas sin reutilización de secretos
La migración SHALL vincular cada cuenta autorizada con una identidad verificada y MUST exigir credenciales nuevas por un canal de recuperación verificado, sin importar ni reutilizar las contraseñas heredadas.

#### Scenario: Cuenta sin canal verificado
- **WHEN** un registro heredado no tiene un canal de recuperación verificado
- **THEN** queda sin acceso hasta que el operador autorizado verifique su titular, sin inventar una dirección ni entregar credenciales por el cliente.

### Requirement: Ausencia de contraseñas en registros de aplicación
El sistema MUST NOT guardar, consultar, comparar o devolver contraseñas en tablas de perfiles de aplicación; el mecanismo heredado MUST quedar invalidado antes de reabrir tráfico.

#### Scenario: Cliente heredado tras el corte
- **WHEN** intenta autenticar usando la columna de contraseña anterior
- **THEN** no puede leerla ni utilizarla para iniciar sesión y los registros públicos no contienen ese secreto.

### Requirement: Sesión e identidad comprobadas
El sistema SHALL autorizar acceso únicamente con identidad validada por el servicio de autenticación y permisos vigentes de servidor, sin confiar en objetos, roles ni identificadores enviados por el navegador.

#### Scenario: Sesión local falsificada
- **WHEN** se altera el objeto local de usuario o se envía un token inválido o expirado
- **THEN** la interfaz protegida no concede acceso y REST/RPC rechazan el acceso privado.

#### Scenario: Sesión válida después de recargar
- **WHEN** se reabre la aplicación con una sesión existente
- **THEN** se verifica su validez y estado de cuenta antes de mostrar contenido protegido; no basta con un nombre guardado.

### Requirement: Administración exclusiva de cuentas y privilegios
Solo un administrador activo verificado SHALL poder crear, modificar, revocar o asignar privilegios a otras cuentas; el registro público MUST NOT crear administradores.

#### Scenario: Autoelevación
- **WHEN** un empleado intenta modificar rol, permisos o estado de cuenta por endpoint o escritura directa
- **THEN** se deniega sin cambios de privilegios.

#### Scenario: Administrador inicial
- **WHEN** se crea el primer administrador
- **THEN** se usa un procedimiento fuera de banda autorizado, verificable y cerrado después del bootstrap, sin auto-registro público.

### Requirement: Revocación efectiva en cada operación
El sistema MUST rechazar operaciones privadas de cuentas revocadas y aplicar cambios de permisos vigentes aunque el cliente conserve un token previamente válido.

#### Scenario: Token anterior a la revocación
- **WHEN** una cuenta revocada presenta su token aún no expirado por REST/RPC o administración
- **THEN** no obtiene datos ni realiza cambios.

### Requirement: Activación conjunta de identidad y autorización
La activación MUST realizarse en la misma ventana de seguridad que CHG-05, con verificación de identidad y permisos completa antes de habilitar tráfico y recuperación segura ante fallo.

#### Scenario: Solo una parte lista
- **WHEN** Auth o la autorización de base no satisface sus pruebas obligatorias
- **THEN** permanece la contención y no se habilita el sistema con permisos públicos o autenticación heredada.

