/** @param {{ authUserId?: string; role?: string; permissions?: string[] } | null} user */
export function createAuthorizationScopeKey(user) {
  if (!user?.authUserId) return "anonymous";
  return JSON.stringify({
    authUserId: user.authUserId,
    role: user.role ?? "employee",
    permissions: [...new Set(user.permissions ?? [])].sort(),
  });
}

/** @param {string} initialScope */
export function createScopeRequestGuard(initialScope) {
  let scope = initialScope;
  let generation = 0;
  return {
    /** @param {string} nextScope */
    update(nextScope) {
      if (nextScope !== scope) {
        scope = nextScope;
        generation += 1;
      }
    },
    capture() {
      return generation;
    },
    /** @param {number} requestGeneration */
    isCurrent(requestGeneration) {
      return requestGeneration === generation;
    },
  };
}
