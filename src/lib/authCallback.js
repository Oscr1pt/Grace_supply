export function readAuthCallback(url) {
  const current = url instanceof URL ? url : new URL(url);
  const query = current.searchParams;
  const fragment = new URLSearchParams(current.hash.replace(/^#/, ""));
  const value = (name) => query.get(name) ?? fragment.get(name);
  const code = query.get("code");
  const accessToken = value("access_token");
  const errorCode = value("error_code");
  const error = value("error") ?? errorCode ?? value("error_description");
  const present = Boolean(code || accessToken || error);

  return {
    present,
    flowType: accessToken ? "implicit" : "pkce",
    type: value("type"),
    hasError: Boolean(error),
    errorCode,
  };
}

export const initialAuthCallback =
  typeof window === "undefined"
    ? { present: false, flowType: "pkce", type: null, hasError: false, errorCode: null }
    : readAuthCallback(window.location.href);
