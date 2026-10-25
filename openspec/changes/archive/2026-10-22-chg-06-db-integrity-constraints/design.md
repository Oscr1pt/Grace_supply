# Design

## Context

El esquema actual tiene referencias de texto sin FK, líneas de venta embebidas en objetos y validación de importes/estados incompleta. La base actual contiene filas de prueba sin obligación de conservar. El diseño debe crear integridad para operaciones nuevas desde una instalación limpia.

## Goals / Non-Goals

**Goals:** relaciones tipadas, dominios financieros/de inventario válidos y snapshots estables para documentos nuevos.

**Non-Goals:** mapear IDs legacy, migrar o conciliar transacciones ficticias, limpiar datos existentes automáticamente ni diseñar la atomicidad de CHG-07.

## Decisions

### Modelo limpio y relaciones

Usar UUID generados en PostgreSQL como convención canónica de claves. Normalizar líneas de venta para relacionarlas con ventas e inventario; referenciar clientes/proveedores desde los documentos y créditos. Los pagos usan una referencia tipada a crédito de cliente o proveedor con exactamente una FK válida, no un ID polimórfico libre. Compras descriptivas sin artículo pueden tener item_id nulo; una compra a crédito requiere proveedor identificado. Definir reglas de borrado restrictivas para registros vinculados a operaciones.

Las migraciones iniciales de CHG-03 crean este modelo desde base vacía. No hacer backfill desde JSON ni crear un mapeo histórico para filas ficticias. Crear únicamente fixtures sintéticas para probar relaciones y errores.

### Dominios e importes

Usar importes NUMERIC(14,2) y moneda DOP como convención inicial, salvo justificación técnica del análisis de esquema. Aplicar CHECK para cantidades positivas, stock no negativo, total/paid/balance coherentes y estados válidos. Usar UNIQUE para números internos según alcance, usernames, relaciones de crédito y claves naturales confirmadas. Añadir índices solo para FK y consultas representativas.

El cálculo exacto y reglas tributarias siguen pendientes de confirmación del negocio y se detallan con CHG-07. No declarar aprobada una tasa o inclusión/exclusión de impuestos. Guardar en cada línea de documento el precio aplicado al contabilizar como snapshot, para que cambios futuros del catálogo no alteren documentos reales nuevos.

### Detección de datos inesperados

Una instalación de desarrollo limpia no necesita conservar filas de prueba. Antes de una operación que pueda descartar datos, verificar entorno y alcance. Si aparecen datos reales inesperados, no aplicar limpieza ni transformación y solicitar autorización explícita por separado.

## Risks / Trade-offs

- Un modelo normalizado cambia adaptadores TypeScript → generar y validar un contrato único en CHG-03.
- CHECK demasiado estricto bloquea reglas válidas → probar límites con fixtures y confirmar reglas comerciales pendientes.
- Filas inesperadas en el destino → detener cualquier acción destructiva y escalar.

## Migration Plan

Definir tablas, FK, CHECK y UNIQUE en migraciones iniciales y probar bootstrap desde cero en Supabase local/aislado. Verificar operaciones válidas e inválidas, tipos generados/adaptados y consultas indexadas. Las pruebas usan datos sintéticos. No migrar filas ficticias; cambios posteriores a una primera entrega con datos reales requerirán un plan de migración específico.

