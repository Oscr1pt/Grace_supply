-- CHG-23: generated client-document validation runs with the inserting role.
-- Keep the functions non-public while allowing authenticated client writes to
-- evaluate the generated column and CHECK constraint.
GRANT EXECUTE ON FUNCTION public.normalize_client_document(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_valid_client_document(text) TO authenticated;
