# Tasks

## 1. Formulario y validación

- [x] 1.1 Añadir existencia inicial con valor cero, validación entera no negativa, límites y estados recuperables; verificar stock 0, positivo, decimal, negativo, inválido y responsive.

## 2. Persistencia autorizada

- [x] 2.1 Crear primero el producto en cero y registrar el delta positivo mediante `postBusinessOperation("inventory_adjustment", ...)` con motivo y clave estable; verificar autorización, auditoría, conflictos y reconciliación sin duplicados.

## 3. Pruebas y compatibilidad

- [x] 3.1 Ejecutar pruebas unitarias, Auth/RLS, integración financiera y Playwright del alta y ajuste, además de TypeScript, ESLint, build, `git diff --check` y OpenSpec estricto; confirmar si hace falta migración adicional.
