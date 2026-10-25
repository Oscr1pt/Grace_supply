const localOrigins = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

export function corsHeaders(request: Request): Record<string, string> {
  const configured = (Deno.env.get("APP_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origin = request.headers.get("origin") ?? "";
  const allowed = new Set([...localOrigins, ...configured]);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (allowed.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function json(request: Request, status: number, body: unknown): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json; charset=utf-8" },
  });
}

export function normalizeUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const username = value.trim().toLowerCase();
  return /^[a-z0-9._-]{3,64}$/.test(username) ? username : null;
}
