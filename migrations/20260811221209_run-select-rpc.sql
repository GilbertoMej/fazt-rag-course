-- Safe SELECT execution for Text-to-SQL edge functions.
-- Only single SELECT/WITH statements allowed. No DDL/DML keywords.
-- Returns rows as jsonb array (or [] when no rows).

CREATE OR REPLACE FUNCTION public.run_select(query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  cleaned text;
  result jsonb;
BEGIN
  cleaned := lower(regexp_replace(query, '^\s+|\s+$', '', 'g'));

  IF cleaned !~ '^(select|with)\s' THEN
    RAISE EXCEPTION 'Solo se permiten sentencias SELECT o WITH';
  END IF;

  IF cleaned ~* '\m(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|vacuum|reindex)\M' THEN
    RAISE EXCEPTION 'SQL contiene palabras prohibidas';
  END IF;

  IF cleaned LIKE '%;%' AND position(';' in cleaned) < length(cleaned) THEN
    RAISE EXCEPTION 'SQL contiene múltiples sentencias';
  END IF;

  EXECUTE 'SELECT coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (' || query || ') AS t'
    INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_select(text) TO anon, authenticated;
