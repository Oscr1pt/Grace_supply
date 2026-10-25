# verified-user-identity Specification

## Purpose

Mantener inicio de sesión con username y contraseña mediante Supabase Auth, con perfiles y permisos verificables y recuperación por correo asociado.

## Requirements

### Requirement: Autenticación con username y contraseña respaldada por Supabase Auth

La interfaz MUST aceptar username y password y el servicio MUST validar la contraseña con Supabase Auth. El username MUST resolver a una identidad Auth individual mediante un mecanismo de servidor confiable, sin almacenar contraseñas en perfiles.

#### Scenario: Login válido

- **WHEN** una cuenta activa presenta username y password correctos
- **THEN** Supabase Auth autentica su identidad vinculada y la aplicación carga el perfil autorizado.

#### Scenario: Usuario o contraseña inválidos

- **WHEN** el username no existe, la cuenta está inactiva o la contraseña no coincide
- **THEN** se devuelve un error genérico sin revelar qué dato falló y se aplican límites contra abuso.

### Requirement: Recuperación por correo asociado

Cada identidad MUST tener un correo de recuperación verificado en Supabase Auth. El flujo de recuperación MUST usar mecanismos seguros de Auth y no revelar el correo asociado durante la resolución del username.

#### Scenario: Solicitud de recuperación

- **WHEN** se solicita recuperar una cuenta
- **THEN** el sistema responde sin permitir enumeración y envía el flujo únicamente al correo verificado asociado.

#### Scenario: Empleado sin correo individual bajo su control

- **WHEN** un empleado no dispone de una direccion individual que pueda verificar
- **THEN** su cuenta permanece inactiva y sin recuperacion; no se inventa ni comparte una direccion y la excepcion requiere aprobacion separada.

#### Scenario: Entorno Cloud sin correo transaccional verificado

- **WHEN** SMTP transaccional o las URL autorizadas del entorno Cloud no estan configuradas y verificadas
- **THEN** recovery y provisioning permanecen apagados en Cloud aunque el flujo local se haya probado.

### Requirement: Perfiles sin secretos y con identidad única

Cada perfil MUST vincularse de forma única a auth.users.id y MUST NOT almacenar, consultar, comparar o devolver contraseñas. Los usernames normalizados MUST ser únicos.

#### Scenario: Cuenta legacy de prueba

- **WHEN** se prepara el nuevo entorno de desarrollo
- **THEN** se crean cuentas de prueba nuevas en Auth y no se importan usuarios ni contraseñas legacy.

### Requirement: Sesión y permisos verificados

Las operaciones privadas MUST validar identidad Auth, estado activo y permisos vigentes; objetos locales y metadata editable MUST NOT otorgar autoridad.

#### Scenario: Token de cuenta revocada

- **WHEN** una cuenta revocada usa un token que aún no expiró
- **THEN** las rutas privadas y REST/RPC deniegan la operación.

### Requirement: Administración sin autoelevación
El registro público MUST NOT conceder privilegios. Solo la administración privada verificada puede aprovisionar o cambiar perfiles y roles. El primer administrador de un proyecto vacío MUST crearse mediante un procedimiento único, ejecutado en un contexto confiable y cerrado después de verificar la cuenta.

#### Scenario: Bootstrap inicial
- **WHEN** un proyecto vacío no tiene perfiles ni administrador activo
- **THEN** un operador autorizado crea una identidad por Supabase Auth y la vincula con un perfil administrador inactivo mediante un procedimiento confiable fuera del registro público; ninguna clave privilegiada se expone al frontend.

#### Scenario: Activación del primer administrador
- **WHEN** la identidad Auth vinculada confirma el correo de invitación y el operador verifica la identidad
- **THEN** el perfil inicial puede activarse mediante el contexto administrativo aprobado y las mismas restricciones de identidad confirmada de los demás perfiles.

#### Scenario: Bootstrap repetido o concurrente
- **WHEN** existe un perfil, un administrador activo o una operación de bootstrap ya iniciada
- **THEN** una segunda ejecución no crea otra identidad ni otro perfil y devuelve un resultado recuperable sin modificar el administrador existente.

#### Scenario: Falla parcial durante el bootstrap
- **WHEN** Auth crea o invita la identidad, pero no se puede persistir o activar su perfil
- **THEN** el procedimiento no informa éxito, compensa la identidad parcial o deja una incidencia recuperable que bloquea la activación hasta su resolución administrativa.

#### Scenario: Cierre del bootstrap
- **WHEN** el primer administrador fue verificado y activado
- **THEN** el mecanismo temporal de bootstrap queda inutilizado y las altas posteriores requieren la administración privada autenticada existente.
### Requirement: Compensacion de identidad Auth ante fallo del perfil

La invitacion MUST tratar Auth y PostgreSQL como persistencias separadas. Si falla el INSERT del perfil, el servidor MUST intentar eliminar la identidad Auth y devolver error, nunca exito.

#### Scenario: Persistencia del perfil falla y la compensacion funciona

- **WHEN** PostgreSQL rechaza guardar el perfil de una identidad Auth recien creada
- **THEN** el servidor elimina la identidad parcial y no deja un perfil huerfano.

### Requirement: Incidencia recuperable cuando falla la compensacion

Si tambien falla la eliminacion Auth, el servidor MUST registrar una incidencia privada, bloquear la activacion y permitir su resolucion administrativa verificable. Si la resolucion falla, la incidencia MUST permanecer abierta.

#### Scenario: Falla tambien la compensacion Auth

- **WHEN** falla el INSERT del perfil y Auth no puede eliminar la identidad
- **THEN** se devuelve error, se registra la incidencia, se bloquea la activacion y un administrador puede resolverla de forma verificable.

#### Scenario: Alta normal despues de la prueba de fallo

- **WHEN** el administrador invita a un empleado valido y no hay fallos de persistencia
- **THEN** se crea un perfil inactivo vinculado a Auth, sin exponer secretos ni activar prematuramente la cuenta.

### Requirement: Activación conjunta con RLS

La habilitación de identidades MUST coordinarse con CHG-05 para que ningún intervalo exponga datos a anon.

#### Scenario: Auth o RLS incompletos

- **WHEN** falla cualquier comprobación conjunta
- **THEN** se mantiene cerrado el acceso privado hasta corregirla.
