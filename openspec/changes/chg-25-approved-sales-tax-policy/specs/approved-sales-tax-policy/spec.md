# Spec Delta — approved-sales-tax-policy

## Purpose
Habilitar ventas únicamente bajo una política fiscal definida, autorizada y soportada por el servidor, conservando transacciones, inventario, créditos, evidencia y documentos históricos.

## ADDED Requirements

### Requirement: Política fiscal explícita como condición de venta
La aplicación MUST mantener el posting bloqueado cuando la política de cálculo/recibo no esté aprobada por el negocio, esté incompleta o utilice una modalidad no implementada. La tasa editable en Ajustes no constituye aprobación y una configuración sintética de pruebas MUST NOT trasladarse a Cloud.

#### Scenario: Existe tasa configurada pero política pendiente
- **WHEN** un administrador guarda una tasa de impuestos pero no existe evidencia de la política aplicable
- **THEN** `sales_posting_status` niega capacidad y `post_sale` rechaza contabilizar sin cambiar stock, saldos ni comprobantes.

#### Scenario: Configuración formalmente aprobada pero no implementada
- **WHEN** la configuración exige cálculo por producto, impuesto incluido o factura fiscal sin soporte disponible
- **THEN** la app indica que es una modalidad no soportada y no contabiliza ni finge emitir documentos tributarios.

### Requirement: Importes autorizados y redondeo determinista
El servidor SHALL calcular con `NUMERIC` el impuesto, subtotal y total de cada venta según reglas de redondeo aprobadas, con instantánea inmutable de tasas/precios aplicada. La previsualización de UI SHALL concordar con la política confirmada y el servidor MUST NOT confiar en totales enviados por el navegador.

#### Scenario: Venta con impuesto y política soportados
- **WHEN** un usuario autorizado confirma una venta de artículos disponibles bajo política aprobada y compatible
- **THEN** el servidor guarda una única operación de venta, líneas, importes exactos, créditos si aplican y descuentos de stock, devolviendo totales canónicos.

#### Scenario: Se cambia tasa después de facturar
- **WHEN** la política del negocio cambia luego de una venta confirmada
- **THEN** los documentos anteriores conservan sus importes y evidencia; ninguna operación histórica se recalcula silenciosamente.

### Requirement: Coincidencia entre puerta de UI y autoridad de PostgreSQL
El estado `sales_posting_status` SHALL reflejar exactamente las condiciones de posting realmente implementadas en `post_sale`. La UI MUST detener operaciones sin permiso, con políticas desconocidas o pendientes; nunca suplanta la autorización de la RPC.

#### Scenario: Política desconocida por error de lectura
- **WHEN** falla leer el estado de la política o el usuario carece de acceso
- **THEN** la UI muestra estado desconocido y no habilita el botón de contabilización.

#### Scenario: Se fuerza llamada RPC sin aprobación
- **WHEN** un cliente invoca `post_sale` directamente sin política válida
- **THEN** el servidor deniega sin aplicar ningún efecto contable o de inventario.

### Requirement: Evidencia de aprobación y separación de recibos fiscales
La aplicación SHALL conservar quién y cuándo aprobó la política, qué reglas fueron aprobadas y su vigencia, mediante un mecanismo confiable, sin permitir que cambiar `tax_rate` signifique por sí solo emitir facturas fiscales. Los documentos internos MUST NOT afirmar validez NCF/e-CF o cumplimiento DGII que no esté implementado y autorizado.

#### Scenario: Se solicita comprobante fiscal sin integración autorizada
- **WHEN** se intenta emitir un NCF/e-CF y el sistema no cuenta con capacidad certificada o procedimiento aprobado
- **THEN** no presenta el recibo interno como comprobante válido y mantiene el flujo fiscal bloqueado hasta implementar sus requisitos.

### Requirement: Preservar invariantes comerciales y seguridad
Toda venta autorizada SHALL mantener controles de sesión, permiso `sales`, idempotencia por actor, bloqueo de filas, stock no negativo, comprobación de precio, atomicidad de créditos y conservación de evidencia. La validación de producción SHALL exigir además acceso administrativo y recuperación de cuenta operativos.

#### Scenario: Doble envío o venta concurrente
- **WHEN** dos operaciones venden la última unidad o se reenvía una clave tras respuesta incierta
- **THEN** no hay sobreventa ni doble contabilización y el resultado se recupera por identidad de operación.

#### Scenario: Acceso a Cloud no verificado
- **WHEN** la cuenta habitual o su recuperación siguen sin funcionar en el entorno real
- **THEN** no se afirma que la publicación de ventas está operativamente lista aunque todas las pruebas sintéticas hayan aprobado.
