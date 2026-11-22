BEGIN;

DROP TRIGGER IF EXISTS clients_require_document_for_authenticated_insert ON public.clients;

COMMIT;
