import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "@/styles.css";
import { SearchableEntitySelect } from "@/components/SearchableEntitySelect";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const products = [
  { id: "product-cafe", name: "Café molido", sku: "CAF-02", quantity: 4, price: 125 },
  { id: "product-cafe-decaf", name: "Café descafeinado", sku: "CAF-03", quantity: 0, price: 150 },
  { id: "product-te", name: "Té de canela", sku: "TE-01", quantity: 8, price: 90 },
];
const clients = [
  { id: "client-100", name: "José Núñez", phone: "809-555-0100" },
  { id: "client-200", name: "Comercial Norte", phone: "809-555-0200" },
];
const suppliers = [
  { id: "supplier-100", name: "Distribuidora Central", rnc: "101-02030-4" },
  { id: "supplier-200", name: "Suministros del Norte", rnc: "131-04050-6" },
];

function Preview() {
  const [selectedId, setSelectedId] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  return (
    <main className="min-h-screen bg-background p-4">
      <Dialog>
        <DialogTrigger asChild>
          <Button>Abrir formulario</Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Agregar producto</DialogTitle>
          </DialogHeader>
          <label id="client-label" htmlFor="client-selector" className="text-sm font-medium">
            Cliente
          </label>
          <SearchableEntitySelect
            id="client-selector"
            data-testid="client-selector"
            options={clients}
            value={selectedClientId}
            onValueChange={setSelectedClientId}
            getOptionValue={(client) => client.id}
            getSearchFields={(client) => [client.name, client.id, client.phone]}
            renderOption={(client) => (
              <span className="flex min-w-0 flex-col">
                <span>{client.name}</span>
                <span className="text-xs text-muted-foreground">
                  {client.phone} · ID {client.id}
                </span>
              </span>
            )}
            renderValue={(client) => client.name}
            placeholder="Elige un cliente"
            searchPlaceholder="Buscar cliente por nombre, teléfono o ID…"
            aria-labelledby="client-label"
          />
          <output data-testid="selected-client-id">{selectedClientId}</output>
          <label id="supplier-label" htmlFor="supplier-selector" className="text-sm font-medium">
            Proveedor
          </label>
          <SearchableEntitySelect
            id="supplier-selector"
            data-testid="supplier-selector"
            options={suppliers}
            value={selectedSupplierId}
            onValueChange={setSelectedSupplierId}
            getOptionValue={(supplier) => supplier.id}
            getSearchFields={(supplier) => [supplier.name, supplier.rnc, supplier.id]}
            renderOption={(supplier) => (
              <span className="flex min-w-0 flex-col">
                <span>{supplier.name}</span>
                <span className="text-xs text-muted-foreground">
                  RNC {supplier.rnc} · ID {supplier.id}
                </span>
              </span>
            )}
            renderValue={(supplier) => supplier.name}
            placeholder="Elige un proveedor"
            searchPlaceholder="Buscar proveedor por nombre, RNC o ID…"
            aria-labelledby="supplier-label"
          />
          <output data-testid="selected-supplier-id">{selectedSupplierId}</output>
          <label id="product-label" htmlFor="product-selector" className="text-sm font-medium">
            Producto
          </label>
          <SearchableEntitySelect
            id="product-selector"
            data-testid="product-selector"
            options={products}
            value={selectedId}
            onValueChange={setSelectedId}
            getOptionValue={(item) => item.id}
            getSearchFields={(item) => [item.name, item.sku, item.id]}
            isOptionDisabled={(item) => item.quantity < 1}
            renderOption={(item) => (
              <span className="flex min-w-0 flex-col">
                <span>{item.name}</span>
                <span className="text-xs text-muted-foreground">
                  {item.sku} · {item.quantity} disponibles · RD$ {item.price}
                </span>
              </span>
            )}
            renderValue={(item) => `${item.sku} — ${item.name}`}
            placeholder="Elige un producto"
            searchPlaceholder="Buscar por nombre, SKU o código…"
            emptyMessage="No se encontraron productos."
            aria-labelledby="product-label"
          />
          <output data-testid="selected-product-id">{selectedId}</output>
        </DialogContent>
      </Dialog>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<Preview />);
