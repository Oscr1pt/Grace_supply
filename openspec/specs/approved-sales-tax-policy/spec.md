# approved-sales-tax-policy Specification

## Purpose
Habilitar ventas únicamente bajo una política fiscal definida, autorizada y soportada por el servidor, conservando transacciones, inventario, créditos, evidencia y documentos históricos.

## Requirements

### Requirement: Configuración tributaria administrable y pendiente por defecto
La aplicación MUST ofrecer junto a los ajustes generales un único interruptor «Aplicar ITBIS» y una tasa V1 inicialmente 18%. Guardar ajustes MUST persistir la configuración operativa válida sin una segunda confirmación de pantalla, manteniendo el control administrativo del servidor.

#### Scenario: Se guarda la propuesta del 18%
- **WHEN** un administrador guarda la tasa V1 y el interruptor sin autorización tributaria comercial
- **THEN** PostgreSQL conserva la configuración operativa, registra el actor y mantiene separada la habilitación comercial de Cloud.

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

#### Scenario: Venta mixta bajo política aprobada
- **WHEN** una política aprobada permite 18% y una venta contiene líneas `gravado` y `exento`
- **THEN** PostgreSQL calcula el impuesto solo sobre las líneas gravadas con redondeo determinista y conserva snapshots de clasificación, tasa, subtotal, impuesto y total.

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

#### Scenario: Recibo interno
- **WHEN** se confirma una venta bajo una política técnicamente soportada sin integración fiscal
- **THEN** el documento se identifica como «Documento interno — sin validez de comprobante fiscal» y no muestra NCF, e-CF ni afirmaciones DGII.

### Requirement: Preservar invariantes comerciales y seguridad
Toda venta autorizada SHALL mantener controles de sesión, permiso `sales`, idempotencia por actor, bloqueo de filas, stock no negativo, comprobación de precio, atomicidad de créditos y conservación de evidencia. La validación de producción SHALL exigir además acceso administrativo y recuperación de cuenta operativos.

#### Scenario: Doble envío o venta concurrente
- **WHEN** dos operaciones venden la última unidad o se reenvía una clave tras respuesta incierta
- **THEN** no hay sobreventa ni doble contabilización y el resultado se recupera por identidad de operación.

#### Scenario: Acceso a Cloud no verificado
- **WHEN** la cuenta habitual o su recuperación siguen sin funcionar en el entorno real
- **THEN** no se afirma que la publicación de ventas está operativamente lista aunque todas las pruebas sintéticas hayan aprobado.

### Requirement: Política V1 soportada como condición de venta
La aplicación MUST permitir ventas con impuesto desactivado bajo una configuración V1 válida, o con 18% activado para `gravado`; `exento` queda en cero y `pendiente` falla cerrado cuando el modo activado requiere clasificación.

#### Scenario: ITBIS desactivado
- **WHEN** existe una configuración V1 válida con el interruptor desactivado
- **THEN** `sales_posting_status` y `post_sale` permiten la venta sin agregar impuesto.

#### Scenario: ITBIS activado
- **WHEN** un administrador guarda el modo activado y una venta contiene productos gravados y exentos
- **THEN** PostgreSQL calcula 18% solo sobre gravados y conserva subtotal, impuesto, total y snapshots.

#### Scenario: Tasa no soportada
- **WHEN** se intenta guardar una tasa distinta de la modalidad V1 soportada
- **THEN** la operación es rechazada sin cambiar la configuración efectiva ni habilitar ventas.

### Requirement: Aprobación comercial separada de la configuración operativa
La aplicación MUST conservar la auditoría y los controles de servidor sin presentar la configuración V1 como certificación DGII ni como aprobación tributaria legal del negocio.

#### Scenario: Recibo V1
- **WHEN** se confirma una venta local bajo una configuración soportada
- **THEN** el recibo muestra «RECIBO INTERNO — NO ES COMPROBANTE FISCAL» y no genera NCF/e-CF.

#### Scenario: Habilitación comercial pendiente
- **WHEN** falta la aprobación tributaria formal del propietario y asesor
- **THEN** la evidencia sintética se conserva como QA técnico y no autoriza Cloud ni cobro comercial de ITBIS.
