-- Migration: Secure SECURITY DEFINER functions from PUBLIC execution
-- This revokes default public execution permissions on database helper functions
-- to prevent anonymous users or arbitrary authenticated users from executing them directly.

-- 1. Secure handle_new_user function (only database triggers need to run this)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

-- 2. Secure has_role function (only authenticated and service_role can execute)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
