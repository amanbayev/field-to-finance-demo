-- Origination O1: deny direct client access to private evidence buckets.
-- App reads/writes only through service-role signed URLs after authorization.
-- Restrictive policy does not grant access to any other bucket.

do $$ begin
  create policy origination_private_buckets_restrict
    on storage.objects
    as restrictive
    for all
    to anon, authenticated
    using (bucket_id not in ('field-documents', 'scas-evidence'))
    with check (bucket_id not in ('field-documents', 'scas-evidence'));
exception when duplicate_object then null;
end $$;
