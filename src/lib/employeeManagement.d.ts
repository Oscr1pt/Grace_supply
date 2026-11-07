import type { Permission, Role } from "./auth";

export type EmployeeAccountStatus = {
  label: string;
  description: string;
  tone: "active" | "inactive";
};

export type EmployeeInvitation = {
  username: string;
  name: string;
  email: string;
};

export type EmployeeCreation = EmployeeInvitation & {
  phone: string;
  role: Role;
  initialPassword: string;
  confirmPassword: string;
};

export type EmployeeInvitationErrors = Partial<Record<keyof EmployeeInvitation, string>>;

export function getEmployeeAccountStatus(
  active: unknown,
  passwordChangeRequired?: unknown,
  emailConfirmed?: unknown,
): EmployeeAccountStatus;
export function validateEmployeeInvitation(
  input: Partial<EmployeeInvitation>,
): EmployeeInvitationErrors;
export function validateEmployeeCreation(
  input: Partial<EmployeeCreation>,
): Partial<Record<keyof EmployeeCreation, string>>;
export function requireConfirmedEmployeeProfile<T = Record<string, unknown>>(
  result: unknown,
  username: string,
  expected?: {
    active?: boolean;
    name?: string;
    phone?: string | null;
    role?: Role;
    permissions?: Permission[];
  },
): T;
export function employeeActionErrorMessage(
  error: unknown,
  action: "create" | "invite" | "activate" | "update" | "revoke",
): string;
