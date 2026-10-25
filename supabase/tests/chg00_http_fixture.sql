-- Local-only HTTP probe objects. The verification wrapper always removes these
-- in a finally block; they contain synthetic values only.
CREATE TABLE public.chg00_http_access_probe (
  id integer PRIMARY KEY,
  secret text NOT NULL
);
ALTER TABLE public.chg00_http_access_probe ENABLE ROW LEVEL SECURITY;
INSERT INTO public.chg00_http_access_probe VALUES (1, 'chg00-synthetic-only');

CREATE FUNCTION public.chg00_http_rpc_probe()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS 'SELECT ''chg00-synthetic-rpc''::text';
