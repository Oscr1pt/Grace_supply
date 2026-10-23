-- Cleanup for the synthetic local HTTP probe.
DROP FUNCTION IF EXISTS public.chg00_http_rpc_probe();
DROP TABLE IF EXISTS public.chg00_http_access_probe;
