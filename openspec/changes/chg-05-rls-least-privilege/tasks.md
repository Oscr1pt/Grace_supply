# Tasks

Exactamente tres tareas del roadmap, pendientes. No se activa CHG-05 independientemente de CHG-04.

## 1. Matriz de privilegios

- [ ] 1.1 Especificar y someter a aprobación la matriz propuesta de filas/columnas y operaciones para anon, empleado por módulo, admin y revocado, incluyendo lecturas mínimas indirectas; verificar trazabilidad de cada tabla/vista/RPC y pruebas positivas/negativas por celda sin atribuir al despliegue permisos aún no observados.

## 2. Políticas y grants mínimos

- [ ] 2.1 Implementar versiones de RLS/grants y contratos de ejecución mínima con identidad/estado/permisos de CHG-04, cerrando políticas globales y DML que eluda operaciones financieras; verificar cada objeto con pruebas locales de autorización, campos protegidos y funciones/vistas privilegiadas, y documentar disponibilidad por fase.

## 3. Verificación directa y corte conjunto

- [ ] 3.1 Ejecutar en staging la matriz REST/RPC por rol, incluyendo token revocado vigente, payload adulterado, joins y objetos nuevos; verificar el corte/rollback compartido con CHG-04 y registrar aprobación de reapertura solo si todas las denegaciones y accesos esperados se cumplen.

