export type AuthCallbackFlow = "pkce" | "implicit";

export function readAuthCallback(url: string | URL): {
  present: boolean;
  flowType: AuthCallbackFlow;
  type: string | null;
  hasError: boolean;
  errorCode: string | null;
};

export const initialAuthCallback: {
  present: boolean;
  flowType: AuthCallbackFlow;
  type: string | null;
  hasError: boolean;
  errorCode: string | null;
};
