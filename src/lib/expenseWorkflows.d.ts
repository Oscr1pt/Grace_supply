import type { Expense, ExpenseCategory, PaymentMethod } from "./types";

export function localExpenseDate(date?: Date): string;
export function normalizeExpenseAmount(amount: string | number): string;
export function validateExpenseDraft(draft: {
  concept?: string;
  beneficiary?: string;
  amount?: string | number;
  date?: string;
  category?: ExpenseCategory;
  paymentMethod?: PaymentMethod | "cheque";
}): Partial<
  Record<"concept" | "beneficiary" | "amount" | "date" | "category" | "paymentMethod", string>
>;
export function filterExpenses(
  expenses: Expense[],
  filters: {
    query?: string;
    category?: string;
    method?: string;
    status?: string;
    from?: string;
    to?: string;
  },
): Expense[];
export function summarizeExpenses(
  expenses: Expense[],
  today: string,
): {
  periodTotal: number;
  today: Expense[];
  month: Expense[];
  annulledCount: number;
};
