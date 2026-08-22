-- Phase 4.5 security hardening.
-- Remove default PUBLIC/anon execution from exposed SECURITY DEFINER functions.
-- Keep only the explicitly intended authenticated RPC surface.

alter function private.uid() set search_path = pg_catalog;

revoke all on function public.handle_new_user() from public, anon, authenticated;

revoke all on function public.is_system_admin() from public, anon;
revoke all on function public.assume_demo_persona(text) from public, anon;
revoke all on function public.exit_demo_persona() from public, anon;
revoke all on function public.switch_active_organization(uuid) from public, anon;
revoke all on function public.submit_role_request(public.onboarding_intent, text) from public, anon;
revoke all on function public.review_role_request(uuid, text) from public, anon;
revoke all on function public.set_user_status(uuid, public.app_user_status) from public, anon;
revoke all on function public.set_organization_status(uuid, public.organization_status) from public, anon;
revoke all on function public.assign_membership_role(uuid, text) from public, anon;
revoke all on function public.revoke_membership_role(uuid, text) from public, anon;
revoke all on function public.record_auth_event(text) from public, anon;
revoke all on function public.grant_system_admin_if_none(text) from public, anon, authenticated;

grant execute on function public.is_system_admin() to authenticated;
grant execute on function public.assume_demo_persona(text) to authenticated;
grant execute on function public.exit_demo_persona() to authenticated;
grant execute on function public.switch_active_organization(uuid) to authenticated;
grant execute on function public.submit_role_request(public.onboarding_intent, text) to authenticated;
grant execute on function public.review_role_request(uuid, text) to authenticated;
grant execute on function public.set_user_status(uuid, public.app_user_status) to authenticated;
grant execute on function public.set_organization_status(uuid, public.organization_status) to authenticated;
grant execute on function public.assign_membership_role(uuid, text) to authenticated;
grant execute on function public.revoke_membership_role(uuid, text) to authenticated;
grant execute on function public.record_auth_event(text) to authenticated;
