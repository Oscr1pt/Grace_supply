# Spec Delta

## MODIFIED Requirements

### Requirement: Edición administrativa de empleados

La administración SHALL listar empleados en una tabla compacta con búsqueda por nombre/username y filtros por estado (todos, activos, inactivos y configuración pendiente). La tabla SHALL mostrar nombre/username, rol, teléfono y estado; seleccionar una fila SHALL abrir detalles editables de nombre, teléfono, rol y permisos. El servidor SHALL autorizar cambios y confirmar su persistencia antes de mostrar éxito; los empleados no podrán editar ni autopromoverse.

#### Scenario: Administrador busca y filtra empleados
- **WHEN** un administrador activo busca por nombre o username y selecciona un filtro de estado
- **THEN** la tabla muestra únicamente los resultados que coinciden, y abrir una fila permite consultar los detalles del empleado.

#### Scenario: Administrador edita cuenta
- **WHEN** un administrador cambia nombre, teléfono, rol o permisos autorizados
- **THEN** la UI confirma únicamente los valores persistidos por el servidor y refleja la información actualizada tras recargar.

#### Scenario: Persistencia incierta
- **WHEN** la respuesta de una actualización se pierde o llega incompleta
- **THEN** el cliente consulta el mismo perfil por identidad, muestra el resultado real si coincide y conserva «Resultado no confirmado» si no puede reconciliarlo, sin reintentar automáticamente.

#### Scenario: Usuario intenta modificar su propio rol o el último administrador
- **WHEN** se intenta elevar privilegios sin autorización o dejar al sistema sin administrador activo
- **THEN** la operación se rechaza y permanece intacta la autoridad previa.

### Requirement: Alta inicial y recuperación diferenciadas

La configuración inicial y la recuperación SHALL utilizar interfaces distinguibles y enlaces temporales de Auth verificados, con callbacks seguros, expiración, consumo único y cierre de sesión temporal. La recuperación administrativa SHALL emitir enlaces privados solo a administradores activos y SHALL rechazarse cuando el perfil esté inactivo o la identidad esté bloqueada en Auth.

#### Scenario: Enlace de primer acceso
- **WHEN** una persona recibe una URL válida de configuración inicial
- **THEN** abre `/setup-account`, configura su acceso y no entra a áreas privadas mientras el perfil siga inactivo.

#### Scenario: Enlace vencido o regreso a login
- **WHEN** una URL está vencida, ya fue consumida o la persona decide volver al login
- **THEN** se rechaza la operación o se limpia la sesión temporal sin reutilizar credenciales ni generar bucles.

#### Scenario: Administrador genera recuperación para una cuenta activa
- **WHEN** un administrador activo solicita restablecer la contraseña de un empleado activo y no bloqueado
- **THEN** el servidor genera el enlace para la identidad existente y lo entrega únicamente en la respuesta autorizada, sin enviarlo por correo ni persistirlo en perfiles, logs o almacenamiento del navegador.

#### Scenario: Cuenta inactiva o bloqueada requiere reactivación
- **WHEN** se solicita un enlace para un perfil inactivo o una identidad con bloqueo activo en Supabase Auth
- **THEN** el servidor responde HTTP 409, no devuelve un enlace ni cambia el estado, e indica que un administrador debe reactivar la cuenta antes de solicitar otro.

#### Scenario: Error de cuenta bloqueada no se confunde con enlace inválido
- **WHEN** Auth rechaza una operación de recuperación con `user_banned`, en vez de indicar expiración o invalidez del enlace
- **THEN** la interfaz identifica el bloqueo de cuenta y no lo presenta como un enlace vencido o consumido.

#### Scenario: Cambiar contraseña no reactiva ni altera permisos
- **WHEN** se completa una recuperación de contraseña válida
- **THEN** solo cambia la contraseña de la identidad existente; el estado activo/inactivo, rol y permisos del perfil permanecen sin cambios y la cuenta revocada no recupera acceso.
