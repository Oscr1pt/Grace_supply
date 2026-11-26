import { useState, type ReactNode, type Ref } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { matchesSearch } from "@/lib/searchableOptions.js";
import { cn } from "@/lib/utils";

type SearchableEntitySelectProps<T> = {
  options: T[];
  value: string;
  onValueChange: (value: string) => void;
  getOptionValue: (option: T) => string;
  getSearchFields: (option: T) => Array<string | number | null | undefined>;
  renderOption: (option: T) => ReactNode;
  renderValue?: (option: T) => ReactNode;
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage?: string;
  disabled?: boolean;
  isOptionDisabled?: (option: T) => boolean;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  className?: string;
  triggerRef?: Ref<HTMLButtonElement>;
  "data-testid"?: string;
};

export function SearchableEntitySelect<T>({
  options,
  value,
  onValueChange,
  getOptionValue,
  getSearchFields,
  renderOption,
  renderValue,
  placeholder,
  searchPlaceholder,
  emptyMessage = "No hay coincidencias.",
  disabled = false,
  isOptionDisabled,
  className,
  triggerRef,
  ...triggerProps
}: SearchableEntitySelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedOption = options.find((option) => getOptionValue(option) === value);
  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full min-w-0 justify-between text-left font-normal", className)}
          {...triggerProps}
        >
          <span className="min-w-0 truncate">
            {selectedOption ? (renderValue ?? renderOption)(selectedOption) : placeholder}
          </span>
          <ChevronDown aria-hidden="true" className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        collisionPadding={8}
        className="w-[var(--radix-popover-trigger-width)] min-w-0 p-0"
      >
        <Command
          className="relative rounded-md"
          filter={(itemValue, search) => (matchesSearch([itemValue], search) ? 1 : 0)}
        >
          <CommandInput
            autoComplete="off"
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={setQuery}
            className="pr-10"
          />
          {query && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Limpiar búsqueda"
              className="absolute right-1 top-1 z-10 h-8 w-8"
              onClick={() => setQuery("")}
            >
              <X aria-hidden="true" />
            </Button>
          )}
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            {options.map((option) => {
              const optionValue = getOptionValue(option);
              const fields = getSearchFields(option);
              return (
                <CommandItem
                  key={optionValue}
                  value={[optionValue, ...fields.filter((field) => field != null)].join(" ")}
                  disabled={isOptionDisabled?.(option)}
                  onSelect={() => {
                    onValueChange(optionValue);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="min-w-0"
                >
                  <Check
                    aria-hidden="true"
                    className={cn("shrink-0", value === optionValue ? "opacity-100" : "opacity-0")}
                  />
                  <span className="min-w-0 flex-1 truncate">{renderOption(option)}</span>
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
