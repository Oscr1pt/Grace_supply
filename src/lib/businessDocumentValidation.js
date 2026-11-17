function validDateOnly(value) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function validateSaleDraft({
  customerMode = "registered",
  clientId,
  walkInName = "",
  clients,
  lines,
  inventory,
  paymentType,
  dueDate,
}) {
  const errors = {};
  if (customerMode === "occasional") {
    const name = typeof walkInName === "string" ? walkInName.trim() : "";
    if (!name) errors.walkInName = "Escribe el nombre del cliente ocasional.";
    else if (name.length > 160) errors.walkInName = "El nombre no puede superar 160 caracteres.";
    if (paymentType !== "contado") {
      errors.paymentType = "Las ventas a clientes ocasionales solo se permiten al contado.";
    }
  } else if (!clients.some((client) => client.id === clientId && client.status === "activo")) {
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

export function calculatePurchaseTotalCents(lines) {
  if (!Array.isArray(lines)) return 0;
  return lines.reduce((total, line) => {
    const quantity = Number(line?.quantity);
    const unitCost = Number(line?.unitCost);
    if (
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      !Number.isFinite(unitCost) ||
      unitCost < 0 ||
      Math.round(unitCost * 100) !== unitCost * 100
    ) {
      return total;
    }
    const subtotal = Math.round(unitCost * 100) * quantity;
    return Number.isSafeInteger(total + subtotal) ? total + subtotal : total;
  }, 0);
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
  lines,
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
  if (Array.isArray(lines)) {
    if (lines.length < 1) errors.lines = "Agrega al menos un producto a la compra.";
    else if (lines.length > 100) errors.lines = "Una compra admite hasta 100 productos.";
    else {
      const lineErrors = {};
      const itemIds = new Set();
      let totalCents = 0;
      let firstLineError = "";
      const addLineError = (line, index, field, reason) => {
        const lineKey = typeof line?.key === "string" && line.key ? line.key : `line-${index + 1}`;
        const message = `Línea ${index + 1}: ${reason}`;
        lineErrors[lineKey] ??= {};
        lineErrors[lineKey][field] = message;
        firstLineError ||= message;
      };
      for (const [index, line] of lines.entries()) {
        const manual = line?.kind === "manual";
        const productId = typeof line?.itemId === "string" ? line.itemId : "";
        let validLine = true;
        if (manual) {
          const name = typeof line?.manualName === "string" ? line.manualName : "";
          const withoutBoundaryWhitespace = name.replace(/^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g, "");
          if (!name || !name.replace(/[ \t\n\r\f\v]/g, "")) {
            addLineError(
              line,
              index,
              "manualName",
              "escribe el nombre del producto no registrado.",
            );
            validLine = false;
          } else if (withoutBoundaryWhitespace.length !== name.length) {
            addLineError(
              line,
              index,
              "manualName",
              "elimina los espacios al inicio o al final del nombre.",
            );
            validLine = false;
          } else if ([...name].length > 500) {
            addLineError(line, index, "manualName", "el nombre supera los 500 caracteres.");
            validLine = false;
          }
        } else {
          const product = inventory.find((entry) => entry.id === productId);
          if (!product) {
            addLineError(
              line,
              index,
              "itemId",
              "selecciona un producto activo de inventario para esta línea vinculada.",
            );
            validLine = false;
          }
          if (product && itemIds.has(productId)) {
            addLineError(
              line,
              index,
              "itemId",
              "este producto vinculado está duplicado en la misma compra.",
            );
            validLine = false;
          }
          if (product) itemIds.add(productId);
        }
        if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) {
          addLineError(line, index, "quantity", "la cantidad debe ser un entero mayor que cero.");
          validLine = false;
        }
        const cost = Number(line.unitCost);
        if (!Number.isFinite(cost) || cost < 0 || Math.round(cost * 100) !== cost * 100) {
          addLineError(
            line,
            index,
            "unitCost",
            "el costo debe ser cero o mayor y tener hasta dos decimales.",
          );
          validLine = false;
        }
        if (!validLine) continue;
        const subtotalCents = Math.round(cost * 100) * line.quantity;
        totalCents += subtotalCents;
        if (!Number.isSafeInteger(totalCents) || totalCents > 99_999_999_999_999) {
          errors.lines = "El total de la compra supera el límite permitido.";
          break;
        }
      }
      if (Object.keys(lineErrors).length > 0) {
        errors.lineErrors = lineErrors;
        errors.lines = firstLineError;
      }
    }
  } else {
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
  }
  return errors;
}
