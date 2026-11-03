# Spec Delta — secure-user-creation-editing

## Purpose

Alta, activación inicial y edición de usuarios desde administración, separadas de recuperación de contraseñas, sin debilitar Supabase Auth, RLS ni las restricciones de identidad verificada.

## ADDED Requirements

### Requirement: Creación de usuario desde pantalla administrativa dedicada

Un administrador activo SHALL disponer de una ruta de creación distinta de recuperación que solicite nombre, username único, teléfono, correo individual, rol y contraseña inicial, con validación accesible y mensajes correctos.

#### Scenario: Administrador inicia alta
- **WHEN** un administrador abre «Crear usuario»
- **THEN** accede a un formulario privado separado de `/reset-password`, con los campos previstos, y la aplicación valida las entradas antes de enviar.

#### Scenario: Empleado intenta crear cuenta o rol privilegiado
- **WHEN** un empleado o anónimo intenta abrir la ruta o ejecutar directamente el servicio de alta
- **THEN** el servidor deniega la operación sin crear identidad, perfil ni rol administrativo.

### Requirement: Identidad y contraseña inicial protegidas

La creación SHALL usar Supabase Auth para credenciales, exigir verificación del correo individual antes de activar y MUST NOT almacenar o exponer contraseñas en tablas de perfiles, logs, respuesta o almacenamiento local. Un secreto declarado temporal MUST obligar un cambio seguro antes del acceso privado, aplicado por el servidor y probado.

#### Scenario: Alta con rol seleccionado
- **WHEN** un administrador autorizado crea una identidad nueva con rol empleado o administrador
- **THEN** Auth y el perfil quedan vinculados con ese rol, el perfil nace inactivo y no puede acceder hasta confirmar el correo y recibir activación autorizada; los privilegios se deciden en servidor.

#### Scenario: No es viable garantizar seguridad de contraseña inicial
- **WHEN** la arquitectura no puede cumplir el uso seguro de la contraseña introducida por el administrador ni un cambio obligatorio si se declara temporal
- **THEN** el flujo no se presenta como habilitado o completado, se conserva la alternativa de invitación donde el propio usuario crea la contraseña, y se informa el bloqueo sin rebajar controles.

### Requirement: Edición administrativa de empleados

La administración SHALL poder editar nombre y teléfono y modificar rol/permisos mediante autorización del servidor, guardando resultados reales y sin permitir autopromoción o edición por empleados sin permisos. El username permanece estable salvo un diseño y validación explícitos de cambio de identidad.

#### Scenario: Administrador edita cuenta
- **WHEN** un administrador cambia nombre, teléfono o permisos autorizados
- **THEN** la UI confirma únicamente el estado persistido del perfil y refleja la información actualizada.

#### Scenario: Usuario intenta modificar su propio rol o el último administrador
- **WHEN** se intenta elevar privilegios sin autorización o dejar al sistema sin administrador activo
- **THEN** la operación se rechaza y permanece intacta la autoridad previa.

### Requirement: Transacciones parciales y privacidad

El aprovisionamiento SHALL compensar identidades Auth sin perfil o registrar incidencias administrativas bloqueantes; SHALL evitar duplicados en reintentos y restringir lectura de teléfonos y datos privados.

#### Scenario: Falla el perfil tras crear la identidad
- **WHEN** Auth crea la identidad pero PostgreSQL rechaza el perfil
- **THEN** no se indica éxito, se intenta compensación y, si falla, queda incidencia sin acceso hasta resolver.

#### Scenario: Empleado consulta contacto ajeno por API
- **WHEN** un empleado consulta el teléfono del perfil de otro empleado a través de REST, vista o RPC
- **THEN** la lectura se deniega según los permisos mínimos, aunque conozca el identificador.

### Requirement: Alta inicial y recuperación diferenciadas

La configuración inicial y la recuperación SHALL utilizar interfaces distinguibles y enlaces de Auth verificados, con callbacks y cierre de sesión temporal seguros.

#### Scenario: Enlace de primer acceso
- **WHEN** una persona recibe un enlace válido de alta
- **THEN** abre una pantalla inicial dedicada, configura su acceso según la autorización de Auth y no entra automáticamente a áreas privadas mientras su perfil siga inactivo.

#### Scenario: Enlace vencido o regreso a login
- **WHEN** un enlace de alta está vencido o el usuario decide volver al login
- **THEN** la interfaz comunica el problema y limpia la sesión temporal sin reutilizar credenciales ni generar bucles de redirección.
