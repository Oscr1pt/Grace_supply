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

export type EmployeeInvitationErrors = Partial<Record<keyof EmployeeInvitation, string>>;

export function getEmployeeAccountStatus(active: unknown): EmployeeAccountStatus;
export function validateEmployeeInvitation(
  input: Partial<EmployeeInvitation>,
): EmployeeInvitationErrors;
export function requireConfirmedEmployeeProfile<T = Record<string, unknown>>(
  result: unknown,
  username: string,
  expected?: { active?: boolean; name?: string; role?: Role; permissions?: Permission[] },
): T;
export function employeeActionErrorMessage(
  error: unknown,
  action: "invite" | "activate" | "update" | "revoke",
): string;
