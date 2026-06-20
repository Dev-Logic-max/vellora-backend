-- Pin the RLS helper's search_path (Supabase advisor: function_search_path_mutable).
-- A mutable search_path on a SECURITY-relevant function can be hijacked; pinning
-- it to empty forces fully-qualified name resolution. Behaviour is unchanged —
-- the body only calls the built-in current_setting().

CREATE OR REPLACE FUNCTION app.current_company_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SET search_path = ''
AS $function$
  SELECT NULLIF(current_setting('app.current_company_id', true), '')::uuid;
$function$;
