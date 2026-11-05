-- Isolated PostgreSQL fixture only; never run against a Supabase project.
-- Load the deployed RPC definition (including PT409 conflict codes) afterwards.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
