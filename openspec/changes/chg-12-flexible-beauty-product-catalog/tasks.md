# Tasks — CHG-12

## 1. Contrato de catálogo flexible
- [ ] 1.1 Contrastar modelo PostgreSQL local vigente, funciones financieras, tipos y filas existentes; aprobar contrato neutro configurable de SKU, nombre, descripción, categoría, marca, presentación, unidad, costo, precio y estado, con categorías personalizables.

## 2. Migración aditiva y adaptación tipada
- [ ] 2.1 Crear migración versionada nueva (sin editar las ya aplicadas), compatibilidad y mapeo verificado de atributos heredados; actualizar tipos/repositorios/RPC afectados sin ampliar privilegios ni saltarse las operaciones auditadas de stock.

## 3. Pruebas de preservación e integridad
- [ ] 3.1 Verificar reconstrucción limpia, upgrade sintético, catálogo vacío, CRUD autorizado, categorías nuevas, restricciones, referencias históricas, finanzas, RLS, idempotencia, build y OpenSpec; documentar plan Cloud y no aplicar migración remota sin autorización separada.
