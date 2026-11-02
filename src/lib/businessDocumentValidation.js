function validDateOnly(value) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function validateSaleDraft({ clientId, clients, lines, inventory, paymentType, dueDate }) {
  const errors = {};
  if (!clients.some((client) => client.id === clientId && client.status === "activo")) {
    errors.clientId = "Selecciona un cliente activo.";
  }
  if (!lines.length) errors.lines = "Agrega al menos un artículo.";
  else {
    for (const line of lines) {
      const current = inventory.find((item) => item.id === line.itemId);
      if (!current) {
        errors.lines = `No se pudo confirmar el artículo ${line.name}; actualiza la lista.`;
        break;
      }
      if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) {
        errors.lines = `La cantidad de ${line.name} debe ser un entero mayor que cero.`;
        break;
      }
      if (line.quantity > Number(current.quantity)) {
        errors.lines = `La cantidad de ${line.name} supera la existencia disponible (${current.quantity}).`;
        break;
      }
      if (Number(line.unitPrice) !== Number(current.price)) {
        errors.lines = `El precio de ${line.name} cambió. Retíralo y agrégalo de nuevo.`;
        break;
      }
    }
  }
  if (paymentType === "credito" && !validDateOnly(dueDate)) {
    errors.dueDate = "Escribe una fecha de vencimiento válida.";
  }
  return errors;
}

export function validatePurchaseDraft({
  supplierId,
  supplierName,
  suppliers,
  paymentType,
  invoiceNo,
  dueDate,
  description,
  itemId,
  inventory,
  quantity,
  unitCost,
  restock,
  quickPurchase = false,
}) {
  const errors = {};
  const supplier = quickPurchase ? null : suppliers.find((entry) => entry.id === supplierId);
  if (!quickPurchase && !supplierName.trim())
    errors.supplierName = "Escribe el nombre del proveedor o elige uno registrado.";
  if (!quickPurchase && supplierId && (!supplier || supplier.status !== "activo")) {
    errors.supplierId = "El proveedor seleccionado no está activo. Actualiza la lista.";
  }
  if (paymentType === "credito" && (quickPurchase || !supplier)) {
    errors.supplierId = "La compra a crédito requiere un proveedor registrado y activo.";
  }
  if (paymentType === "credito" && !invoiceNo.trim()) {
    errors.invoiceNo = "La compra a crédito requiere el número de factura del proveedor.";
  }
  if (paymentType === "credito" && !validDateOnly(dueDate)) {
    errors.dueDate = "Escribe una fecha de vencimiento válida.";
  }
  if (!description.trim() && !itemId) {
    errors.description = "Describe la compra o vincula un artículo de inventario.";
  }
  if (!Number.isSafeInteger(Number(quantity)) || Number(quantity) < 1) {
    errors.quantity = "La cantidad debe ser un número entero mayor que cero.";
  }
  const cost = Number(unitCost);
  if (!Number.isFinite(cost) || cost < 0 || Math.round(cost * 100) !== cost * 100) {
    errors.unitCost = "El costo debe ser cero o mayor y tener hasta dos decimales.";
  }
  if (itemId && !inventory.some((item) => item.id === itemId)) {
    errors.itemId = "El artículo activo no está disponible. Actualiza la lista.";
  }
  if (restock && !itemId) errors.restock = "Vincula un artículo para reabastecer existencias.";
  return errors;
}
