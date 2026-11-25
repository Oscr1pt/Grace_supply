# Proposal

## Why

Grace Supply registra ventas, gastos y compras, pero no ofrece una vista unificada para comparar su comportamiento en un período. Un módulo de resumen confiable permitirá a los administradores revisar esos importes con períodos y definiciones explícitos, sin presentar como utilidad cifras que el esquema actual no puede calcular de forma histórica confiable.

## What Changes

- Agregar un módulo de solo lectura **Reportes** para administradores, con períodos semanales, mensuales y anuales en el calendario de Santo Domingo.
- Mostrar ventas sin ITBIS, gastos operativos, compras de mercancía e ITBIS registrado en ventas como cuatro indicadores separados; excluir documentos anulados y no sumar pagos de créditos como ventas.
- Presentar gráficos comparativos de ventas y gastos, y distribución de gastos por categoría, con estados claros de carga, datos vacíos, error y acceso denegado.
- Permitir imprimir o guardar como PDF una vista preparada para impresión que reutilice los mismos resultados de pantalla y explique su carácter informativo interno.
- Proteger los agregados en Supabase con autorización administrativa verificada en la base de datos y respuestas agregadas mínimas.

## Capabilities

### New Capabilities

- `business-reports`: Consulta administrativa de resúmenes financieros agregados por período, con semántica, acceso, estados y salida imprimible verificables.

### Modified Capabilities

- `financial-evidence-preservation`: Aclarar la separación entre resúmenes agregados de gestión y consultas de auditoría que muestran documentos originales y compensaciones vinculadas.

## Impact

Afecta una ruta y acceso lateral nuevos, consultas de solo lectura, una RPC protegida de agregación, componentes Recharts y estilos de impresión. Reutiliza las tablas y snapshots financieros existentes, permisos de administrador, formatos DOP y patrones de lectura confiable. No requiere nuevas dependencias de PDF ni modifica operaciones, saldos, reglas fiscales o datos existentes.
