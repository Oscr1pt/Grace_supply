import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

type Props = {
  value: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
  className?: string;
};

export function Barcode({ value, width = 2, height = 60, displayValue = true, className }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current && value) {
      try {
        JsBarcode(ref.current, value, {
          format: "CODE128",
          width,
          height,
          displayValue,
          font: "Inter, sans-serif",
          fontSize: 14,
          margin: 8,
          background: "#ffffff",
          lineColor: "#000000",
        });
      } catch (e) {
        console.error(e);
      }
    }
  }, [value, width, height, displayValue]);
  return <svg ref={ref} className={className} />;
}
