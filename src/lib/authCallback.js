export function readAuthCallback(url) {
  const current = url instanceof URL ? url : new URL(url);
  const query = current.searchParams;
  const fragment = new URLSearchParams(current.hash.replace(/^#/, ""));
  const value = (name) => query.get(name) ?? fragment.get(name);
  const code = query.get("code");
  const accessToken = value("access_token");
  const error = value("error") ?? value("error_code") ?? value("error_description");
  const present = Boolean(code || accessToken || error);

  return {
    present,
    flowType: accessToken ? "implicit" : "pkce",
    type: value("type"),
    hasError: Boolean(error),
  };
}

export const initialAuthCallback = typeof window === "undefined"
  ? { present: false, flowType: "pkce", type: null, hasError: false }
  : readAuthCallback(window.location.href);
