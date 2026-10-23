export function createAuthorizationScopeKey(user: {
  authUserId?: string;
  role?: string;
  permissions?: string[];
} | null): string;

export function createScopeRequestGuard(initialScope: string): {
  update(nextScope: string): void;
  capture(): number;
  isCurrent(requestGeneration: number): boolean;
};
