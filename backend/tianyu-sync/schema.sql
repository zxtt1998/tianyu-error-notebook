-- Provisioned through Supabase migration tianyu_private_encrypted_sync.
-- Vault IDs are provisioned separately; personal capability keys must never be committed.
create table public.tianyu_sync_vault (
 id text primary key check (id ~ '^[a-f0-9]{64}$'),
 revision bigint not null default 0 check (revision >= 0),
 encrypted jsonb,
 updated_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 constraint tianyu_payload_limit check (encrypted is null or octet_length(encrypted::text) <= 4000000)
);
alter table public.tianyu_sync_vault enable row level security;
revoke all on public.tianyu_sync_vault from anon, authenticated;
grant select, insert, update, delete on public.tianyu_sync_vault to service_role;
