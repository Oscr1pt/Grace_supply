import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, fromDb, toDb } from "./supabase";
import type { Settings } from "./types";
import type { UUID } from "./database.types";
import {
  confirmMutation,
  persistenceFailure,
  setReadFailure,
  userPersistenceMessage,
} from "./persistence.js";
import { createSettingsWriter } from "./settings-writer.js";

export const defaultSettings: Settings = {
  businessName: "GRACE SUPPLY",
  businessAddress: "Santo Domingo, República Dominicana",
  businessPhone: "+1 (809) 000-0000",
  taxRate: 18,
  taxCalculationEnabled: false,
  taxPolicyStatus: "pending",
  taxPricesInclude: false,
  taxPolicyVersion: null,
  taxPolicyApprovedAt: null,
  taxPolicyApprovedBy: null,
  taxReceiptMode: "internal",
  currency: "DOP",
  labelWidthMm: 50,
  labelHeightMm: 30,
  labelBarWidth: 2,
  labelBarHeight: 50,
  labelShowPrice: true,
};

export const labelPresets = [
  {
    key: "compacta",
    label: "Compacta (25 × 12 mm)",
    widthMm: 25,
    heightMm: 12,
    barWidth: 1,
    barHeight: 22,
  },
  {
    key: "pequena",
    label: "Pequeña (38 × 19 mm)",
    widthMm: 38,
    heightMm: 19,
    barWidth: 1.4,
    barHeight: 32,
  },
  {
    key: "mediana",
    label: "Mediana (50 × 30 mm)",
    widthMm: 50,
    heightMm: 30,
    barWidth: 2,
    barHeight: 50,
  },
  {
    key: "grande",
    label: "Grande (70 × 40 mm)",
    widthMm: 70,
    heightMm: 40,
    barWidth: 2.6,
    barHeight: 65,
  },
] as const;

const SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

export async function approveSalesTaxPolicy(request: {
  enabled: boolean;
  rate: number;
  policyVersion: string;
  approve?: boolean;
}) {
  const { data, error } = await supabase.rpc(
    "approve_sales_tax_policy" as never,
    {
      p_request: {
        enabled: request.enabled,
        rate: request.rate,
        policy_version: request.policyVersion,
        prices_include: false,
        receipt_mode: "internal",
        approve: request.approve !== false,
      },
    } as never,
  );
  if (error) throw persistenceFailure(error);
  return data as Record<string, unknown>;
}

export function useSettings() {
  const [settings, setSettingsState] = useState<Settings>(defaultSettings);
  const [readStatus, setReadStatus] = useState<"loading" | "ready" | "failed">("loading");
  const confirmedRef = useRef(settings);
  const loadRevision = useRef(0);
  const writerRef = useRef<ReturnType<typeof createSettingsWriter> | null>(null);

  if (!writerRef.current) {
    writerRef.current = createSettingsWriter({
      getConfirmed: () => confirmedRef.current,
      persist: async (next, patch) => {
        const usesV1TaxSettings = [
          "businessName",
          "businessAddress",
          "businessPhone",
          "taxRate",
          "taxCalculationEnabled",
        ].some((key) => key in patch);
        if (usesV1TaxSettings) {
          const { data, error } = await supabase.rpc(
            "save_sales_tax_v1" as never,
            {
              p_request: {
                business_name: next.businessName,
                business_address: next.businessAddress,
                business_phone: next.businessPhone,
                tax_rate: Number(next.taxRate),
                tax_calculation_enabled: next.taxCalculationEnabled === true,
              },
            } as never,
          );
          if (error) throw persistenceFailure(error);
          return {
            ...defaultSettings,
            ...fromDb<Partial<Settings>>(data as Record<string, unknown>),
          };
        }
        const response = await supabase
          .from("settings")
          .update(toDb(patch as Record<string, unknown>) as never)
          .eq("id", SETTINGS_ID as UUID)
          .select("*");
        const persisted = await confirmMutation(response, { id: SETTINGS_ID });
        return {
          ...defaultSettings,
          ...fromDb<Partial<Settings>>(persisted as Record<string, unknown>),
        };
      },
      commit: (confirmed) => {
        confirmedRef.current = confirmed;
        setSettingsState(confirmed);
      },
    });
  }

  useEffect(() => {
    let active = true;
    const requestRevision = loadRevision.current;
    const commitRead = (value: Settings) => {
      if (!active || requestRevision !== loadRevision.current) return;
      confirmedRef.current = value;
      setSettingsState(value);
      setReadStatus("ready");
      setReadFailure("settings", null);
    };
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from("settings")
          .select("*")
          .eq("id", SETTINGS_ID as UUID)
          .single();
        if (error) {
          // Sales users receive only the receipt projection, never the settings table.
          const receipt = await supabase
            .from("sales_receipt_settings")
            .select("business_name,business_address,business_phone,tax_rate,currency")
            .maybeSingle();
          if (receipt.error || !receipt.data) throw persistenceFailure(error);
          commitRead({
            ...defaultSettings,
            businessName: receipt.data.business_name,
            businessAddress: receipt.data.business_address,
            businessPhone: receipt.data.business_phone,
            taxRate: receipt.data.tax_rate,
            currency: receipt.data.currency,
          });
          return;
        }
        if (!data) throw persistenceFailure(new Error("Settings row was not returned"));
        commitRead({
          ...defaultSettings,
          ...fromDb<Partial<Settings>>(data as Record<string, unknown>),
        });
      } catch (error) {
        if (active && requestRevision === loadRevision.current) {
          setReadStatus("failed");
          setReadFailure(
            "settings",
            `${userPersistenceMessage(error)} Se muestran valores predeterminados hasta confirmar la lectura.`,
          );
        }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const setSettings = useCallback(
    (patch: Partial<Settings>) => {
      if (readStatus !== "ready") {
        return Promise.reject(
          new Error(
            "Los ajustes aún no se han podido leer; vuelve a cargar la página antes de guardar.",
          ),
        );
      }
      loadRevision.current += 1;
      return writerRef.current!(patch);
    },
    [readStatus],
  );

  return [settings, setSettings, readStatus] as const;
}
