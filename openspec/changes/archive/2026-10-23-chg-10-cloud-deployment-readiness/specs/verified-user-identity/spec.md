# Spec Delta

## MODIFIED Requirements

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
