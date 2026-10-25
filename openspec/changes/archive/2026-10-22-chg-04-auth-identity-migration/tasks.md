# Tasks

Progreso verificado: **3/3 tareas completas**. Auth/Mailpit local cubre invitacion, verificacion, login, recovery/cambio de clave, logout, enlaces invalidos, expiracion y revocacion. La prueba de persistencia confirma compensacion Auth, incidencia recuperable y bloqueo de activacion cuando falla la compensacion. Cloud recovery/provisioning siguen apagados hasta verificar SMTP y URLs. Ver [decision y evidencia](../../../docs/chg-04-recovery-decision.md).

Tres tareas principales. Crear cuentas de prueba nuevas; no trasladar identidades ni contraseñas legacy ficticias. CHG-04/05 se habilitan juntas para datos privados.

## 1. Perfil Auth y recuperación

- [x] 1.1 Disenar el perfil vinculado a `auth.users`, el alias username unico y la resolucion segura username->identidad Auth; verificar unicidad y recuperacion con correo asociado. El propietario aprobo que cada empleado controle su correo individual; las excepciones sin correo permanecen pendientes. No importar cuentas ni contrasenas legacy.

## 2. Identidad y administración verificadas

- [x] 2.1 Sustituir comparación de contraseñas, sesión local y auto-admin por identidad verificada y administración privada con roles protegidos; verificar sesiones falsificadas/expiradas, elevación rechazada, alta parcial inactiva y protección del último admin, documentando el contrato que consume CHG-05.

## 3. Ensayo integrado y corte compartido

- [x] 3.1 Probar bootstrap, login username/password, recuperacion por correo, logout, revocacion con token vigente y matriz CHG-05 en Supabase local/aislado; verificar altas sinteticas, errores genericos, rate limiting y rollback seguro antes de la entrega. Coordinar la ventana de integracion con CHG-05 y facilitar la identidad autorizada que CHG-01 requiere para su lectura PostgreSQL real. No habilitar acceso privado hasta que ambas matrices pasen. Evidencia 22/22: CHECK PostgreSQL fuerza fallo de perfil, Auth compensatorio elimina identidad; fallo de compensacion deja incidencia privada abierta, bloquea activacion y se resuelve por admin verificado, con consulta Auth/PostgreSQL final sin huerfanos.
