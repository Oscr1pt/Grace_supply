# Spec Delta

## Purpose

Proporciona a administradores de Grace Supply resúmenes financieros agregados, temporales y de solo lectura. Los resultados presentan fuentes y límites de cálculo explícitos y no sustituyen la contabilidad ni los comprobantes fiscales.

## ADDED Requirements

### Requirement: Acceso administrativo de solo lectura

El módulo de reportes SHALL permitir la consulta únicamente a administradores activos, con autorización aplicada en Supabase y sin operaciones de escritura.

#### Scenario: Administrador activo consulta un reporte

- **WHEN** un administrador activo solicita un período permitido
- **THEN** recibe únicamente agregados del período y no se modifican registros comerciales.

#### Scenario: Empleado o usuario anónimo solicita un reporte

- **WHEN** un empleado, usuario anónimo o cuenta revocada invoca directamente la consulta protegida
- **THEN** Supabase deniega la solicitud sin devolver agregados ni datos subyacentes.

### Requirement: Selección de período en calendario de Santo Domingo

El módulo SHALL permitir consultar semanas de lunes a domingo, meses calendario y años calendario, incluidos períodos pasados, e identificar explícitamente sus límites en America/Santo_Domingo.

#### Scenario: Selección de período semanal

- **WHEN** el administrador selecciona una fecha y el modo semanal
- **THEN** el sistema consulta desde el lunes hasta antes del lunes siguiente en el calendario de Santo Domingo y muestra el intervalo exacto.

#### Scenario: Período cambia de mes o año

- **WHEN** el intervalo seleccionado cruza un límite de mes o año
- **THEN** cada registro se incluye una sola vez según su fecha de negocio en Santo Domingo.

#### Scenario: Selección mensual o anual

- **WHEN** el administrador selecciona un mes o año anterior
- **THEN** el sistema consulta el mes calendario completo o enero a diciembre, respectivamente, y muestra sus límites exactos.

### Requirement: Indicadores financieros separados y definidos

El módulo SHALL mostrar ventas registradas sin ITBIS, gastos operativos, compras de mercancía e ITBIS registrado en ventas como importes separados, excluyendo documentos anulados.

#### Scenario: Venta de contado o crédito dentro del período

- **WHEN** una venta no anulada pertenece al período consultado
- **THEN** su subtotal se suma una sola vez a ventas y su impuesto registrado se muestra separado, sin sumar posteriormente sus cobros o abonos como nuevas ventas.

#### Scenario: Gasto o compra anulados

- **WHEN** existen gastos o compras anulados junto con documentos vigentes en el período
- **THEN** los anulados no se suman a sus respectivos indicadores ni categorías.

#### Scenario: ITBIS mostrado como dato informativo

- **WHEN** el reporte muestra ITBIS registrado en ventas
- **THEN** lo identifica como dato informativo y no como impuesto neto a pagar.

### Requirement: Compras y gastos conservan semántica distinta

El módulo SHALL presentar adquisiciones de mercancía separadas de gastos operativos y no inferir costos de venta a partir de inventario actual.

#### Scenario: Período contiene compras y gastos

- **WHEN** hay compras de inventario y gastos operativos en el período
- **THEN** aparecen en indicadores y gráficos como categorías distintas, sin sumarse como si fueran un mismo tipo de egreso.

#### Scenario: Datos insuficientes para calcular utilidad

- **WHEN** se presenta el resumen del período
- **THEN** el sistema no calcula ni etiqueta utilidad, ganancia o pérdida a partir de ventas, compras, gastos o costo actual del inventario.

### Requirement: Agregados y gráficos comparables por intervalo

El módulo SHALL presentar ventas frente a gastos y gastos por categoría con agrupaciones coherentes con el período, importes DOP y visualización utilizable en escritorio y móvil.

#### Scenario: Gráfico para semana, mes y año

- **WHEN** se muestra un período semanal, mensual o anual
- **THEN** el gráfico compara ventas sin ITBIS con gastos operativos agrupados por día, semana o mes, respectivamente.

#### Scenario: Distribución de gastos

- **WHEN** hay gastos registrados en una o más categorías
- **THEN** el gráfico de barras horizontales presenta las categorías existentes y sus importes sin omitir categorías con registros.

#### Scenario: Móvil o período anual con muchos intervalos

- **WHEN** el reporte se muestra en una pantalla móvil o cubre un año calendario
- **THEN** etiquetas, valores y gráficas permanecen legibles sin desbordamiento ni pérdida de intervalos.

### Requirement: Estados de lectura no se confunden con cero

La interfaz SHALL distinguir carga, período vacío, acceso denegado, error de lectura y datos obsoletos.

#### Scenario: Período sin movimientos

- **WHEN** la consulta se completa correctamente sin registros
- **THEN** el módulo indica que no hubo movimientos y muestra ceros solo como resultado confirmado.

#### Scenario: Error o denegación de lectura

- **WHEN** Supabase devuelve un error o deniega acceso
- **THEN** el módulo muestra el estado correspondiente, no presenta el error como RD$0 y ofrece solo acciones seguras.

#### Scenario: Datos anteriores conservados durante una falla

- **WHEN** una actualización falla después de existir resultados válidos
- **THEN** cualquier dato anterior se identifica claramente como obsoleto y no se presenta como resultado actualizado.

### Requirement: Resumen textual basado solo en resultados

El resumen del período SHALL describir cifras consultadas sin atribuir causas, tendencias no calculadas ni rentabilidad.

#### Scenario: Resumen con movimientos

- **WHEN** la consulta del período finaliza correctamente
- **THEN** el texto resume los importes de ventas sin ITBIS y gastos operativos devueltos por la misma consulta.

### Requirement: Impresión y cifras consistentes

El reporte SHALL permitir imprimir o guardar como PDF un documento informativo que use los mismos resultados presentados en pantalla.

#### Scenario: Impresión del reporte

- **WHEN** un administrador imprime o guarda el reporte como PDF
- **THEN** el documento incluye el negocio, título, período, fecha de generación, cuatro indicadores, gráficos, resumen y aviso de uso interno no fiscal, sin navegación de la aplicación.

#### Scenario: Consistencia entre pantalla e impresión

- **WHEN** se imprime un reporte ya cargado
- **THEN** períodos, indicadores, agrupaciones, importes y resumen coinciden con la pantalla para la misma respuesta de consulta.

#### Scenario: La impresión ocurre durante carga o error

- **WHEN** el reporte aún carga, está denegado o presenta error
- **THEN** no se genera un documento que presente resultados incompletos como cifras válidas.
