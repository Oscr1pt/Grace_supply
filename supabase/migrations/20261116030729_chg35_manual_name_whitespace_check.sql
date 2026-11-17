-- CHG-35: reject ASCII whitespace-only or whitespace-padded manual line names at the DB boundary.
BEGIN;

ALTER TABLE public.purchase_lines
  ADD CONSTRAINT purchase_lines_manual_name_whitespace_check CHECK (
    item_id IS NOT NULL OR (
      char_length(name_snapshot) <= 500
      AND char_length(btrim(name_snapshot, ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13))) > 0
      AND name_snapshot = btrim(name_snapshot, ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13))
    )
  );

COMMIT;
