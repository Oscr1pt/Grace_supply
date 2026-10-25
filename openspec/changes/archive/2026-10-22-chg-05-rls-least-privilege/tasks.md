# Tasks

Progreso verificado: **3/3 tareas completas en Supabase local**. La activación de recovery/provisioning queda gobernada por la decisión pendiente de CHG-04. No se archiva este Change mientras sus dependencias sigan abiertas.

Exactamente tres tareas principales. La matriz cubre cuentas Supabase Auth nuevas y mantiene anon sin acceso privado; habilitar junto con CHG-04.

## 1. Matriz de privilegios

- [x] 1.1 Especificar y someter a aprobación la matriz propuesta de filas/columnas y operaciones para anon, empleado por módulo, admin y revocado, incluyendo lecturas mínimas indirectas; verificar trazabilidad de cada tabla/vista/RPC y pruebas positivas/negativas por celda sin atribuir al despliegue permisos aún no observados. La matriz solicitada por el propietario está documentada en `docs/chg-05-authorization-matrix.md`.

## 2. Políticas y grants mínimos

- [x] 2.1 Implementar versiones de RLS/grants y contratos de ejecución mínima con identidad/estado/permisos de CHG-04, cerrando políticas globales y DML que eluda operaciones financieras; verificar cada objeto con pruebas locales de autorización, campos protegidos y funciones/vistas privilegiadas, y documentar disponibilidad por fase.

## 3. Verificación directa y corte conjunto

- [x] 3.1 Ejecutar en Supabase local/aislado la matriz REST/RPC por rol, incluyendo token revocado vigente, payload adulterado, joins y objetos nuevos; verificar despliegue conjunto con CHG-04 y conservar denegación anónima si falla cualquier caso. Facilitar a CHG-01 identidades autorizadas/denegadas para su contraste de persistencia real. No usar grants generales ni claves privilegiadas en el frontend.
