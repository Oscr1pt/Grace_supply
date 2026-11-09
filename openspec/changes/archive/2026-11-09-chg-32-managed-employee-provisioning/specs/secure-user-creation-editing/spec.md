# Spec Delta

## MODIFIED Requirements

### Requirement: Creación de usuario desde pantalla administrativa dedicada
Un administrador activo SHALL disponer de una ruta privada de alta que solicite nombre, username único, correo individual y permisos o rol. El formulario no solicitará ni almacenará la contraseña definitiva del empleado.

#### Scenario: Administrador inicia alta
- **WHEN** un administrador abre «Crear usuario»
- **THEN** accede a un formulario separado de recuperación que valida nombre, usuario, correo y permisos antes de crear la cuenta.

#### Scenario: Empleado intenta crear cuenta o rol privilegiado
- **WHEN** un empleado o anónimo intenta abrir la ruta o ejecutar directamente el servicio de alta
- **THEN** el servidor deniega la operación sin crear identidad, perfil ni rol administrativo.

### Requirement: Identidad y contraseña inicial protegidas
La creación SHALL usar Supabase Auth con correo no confirmado, crear el perfil inactivo con `password_change_required=true` y exigir que la persona establezca su contraseña mediante el endpoint server-side de configuración inicial antes de activar el acceso.

#### Scenario: Alta con rol seleccionado
- **WHEN** un administrador autorizado crea una identidad nueva con rol empleado o administrador
- **THEN** Auth y el perfil quedan vinculados, la contraseña no aparece en perfiles, logs, respuestas ni almacenamiento local, y el perfil permanece inactivo.

#### Scenario: Configuración inicial completada
- **WHEN** la persona usa una URL temporal válida y establece una contraseña que el servidor acepta
- **THEN** el servidor actualiza Auth, limpia `password_change_required` de forma atómica y mantiene el perfil inactivo hasta la activación.

#### Scenario: No es viable garantizar seguridad de contraseña inicial
- **WHEN** el entorno no puede emitir y validar una URL temporal de un solo uso
- **THEN** el alta permanece bloqueada y la UI no ofrece crear cuentas mediante contraseñas compartidas o SMTP no verificado.

### Requirement: Alta inicial y recuperación diferenciadas
La configuración inicial y la recuperación SHALL utilizar interfaces distinguibles y enlaces temporales de Auth verificados, con callbacks seguros, expiración, consumo único y cierre de sesión temporal.

#### Scenario: Enlace de primer acceso
- **WHEN** una persona recibe una URL válida de configuración inicial
- **THEN** abre `/setup-account`, configura su acceso y no entra a áreas privadas mientras el perfil siga inactivo.

#### Scenario: Enlace vencido o regreso a login
- **WHEN** una URL está vencida, ya fue consumida o la persona decide volver al login
- **THEN** se rechaza la operación o se limpia la sesión temporal sin reutilizar credenciales ni generar bucles.

## ADDED Requirements

### Requirement: Compensación y auditoría del alta manual
El aprovisionamiento SHALL compensar una identidad Auth sin perfil, registrar una incidencia bloqueante si la compensación falla y auditar actor, identidad, expiración y estado del enlace sin guardar su secreto.

#### Scenario: Falla la persistencia del perfil
- **WHEN** Auth crea la identidad pero PostgreSQL rechaza el perfil
- **THEN** el servidor intenta cancelar la identidad, no devuelve un enlace utilizable y registra una incidencia si no puede completar la compensación.

#### Scenario: Alta duplicada
- **WHEN** el username, correo o identidad ya están vinculados a una cuenta o incidencia abierta
- **THEN** el servidor rechaza la operación sin emitir otra identidad ni otro enlace.

#### Scenario: Revocación previa a activación
- **WHEN** un administrador revoca la cuenta antes de que se configure la contraseña
- **THEN** la URL queda inutilizable, la sesión temporal se invalida y la activación posterior es rechazada.
