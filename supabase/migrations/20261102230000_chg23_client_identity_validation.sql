-- CHG-23: validated, normalized and unique client identity documents.
BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_client_document(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
RETURNS NULL ON NULL INPUT
AS $$
  SELECT NULLIF(regexp_replace(btrim(value), '[^0-9]', '', 'g'), '');
$$;

CREATE OR REPLACE FUNCTION public.is_valid_client_document(value text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
RETURNS NULL ON NULL INPUT
AS $$
DECLARE
  normalized text := public.normalize_client_document(value);
  total integer := 0;
  remainder integer;
  expected integer;
  weights integer[] := ARRAY[7,9,8,6,5,4,3,2];
  index integer;
  product integer;
BEGIN
  IF btrim(value) = '' THEN RETURN true; END IF;
  IF value !~ '^[0-9[:space:]-]+$' OR normalized IS NULL THEN RETURN false; END IF;
  IF normalized ~ '^(.)\1+$' THEN RETURN false; END IF;
  IF length(normalized) = 11 THEN
    FOR index IN 1..10 LOOP
      product := substring(normalized, index, 1)::integer * CASE WHEN index % 2 = 1 THEN 1 ELSE 2 END;
      total := total + CASE WHEN product > 9 THEN product - 9 ELSE product END;
    END LOOP;
    RETURN ((10 - (total % 10)) % 10) = substring(normalized, 11, 1)::integer;
  ELSIF length(normalized) = 9 THEN
    FOR index IN 1..8 LOOP
      total := total + substring(normalized, index, 1)::integer * weights[index];
    END LOOP;
    remainder := total % 11;
    expected := CASE WHEN remainder IN (0, 1) THEN 0 ELSE 11 - remainder END;
    RETURN expected = substring(normalized, 9, 1)::integer;
  END IF;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_client_document(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_valid_client_document(text) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  invalid_count integer;
  duplicate_count integer;
BEGIN
  SELECT count(*) INTO invalid_count
  FROM public.clients
  WHERE rnc IS NOT NULL AND btrim(rnc) <> '' AND NOT public.is_valid_client_document(rnc);
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'CHG-23 preflight blocked: % existing client documents are invalid; no rows were changed', invalid_count USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO duplicate_count
  FROM (
    SELECT public.normalize_client_document(rnc)
    FROM public.clients
    WHERE rnc IS NOT NULL AND btrim(rnc) <> ''
    GROUP BY public.normalize_client_document(rnc)
    HAVING count(*) > 1
  ) conflicts;
  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'CHG-23 preflight blocked: % normalized client documents are duplicated; resolve them without deleting history', duplicate_count USING ERRCODE = '23505';
  END IF;
END;
$$;

ALTER TABLE public.clients
  ADD COLUMN rnc_normalized text GENERATED ALWAYS AS (public.normalize_client_document(rnc)) STORED;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_rnc_format_check
  CHECK (rnc IS NULL OR btrim(rnc) = '' OR public.is_valid_client_document(rnc));

CREATE UNIQUE INDEX clients_rnc_normalized_unique
  ON public.clients (rnc_normalized)
  WHERE rnc_normalized IS NOT NULL;

GRANT SELECT (rnc_normalized) ON public.clients TO authenticated;

COMMIT;
