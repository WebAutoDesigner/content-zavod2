# Supabase Setup

Main schema migration:

```text
supabase/content_factory_schema.sql
```

Apply it in one of these ways:

1. Supabase Dashboard -> SQL Editor -> paste and run the file.
2. Supabase CLI / psql with a Postgres connection string.
3. A project-specific SQL RPC/management token, if configured.

The stored project API key found in historical memory was not enough to apply DDL from Codex: REST returned `401`, and SQL RPC endpoints were unavailable. For direct application from Codex, provide/update one of:

```text
SUPABASE_DB_URL
SUPABASE_ACCESS_TOKEN
working service role key plus an existing SQL RPC
```

Do not commit real secrets.

## Applied Status

Applied to Supabase project ref `xxnzqridvepixzireqjh` via Supabase Management API on 2026-05-13.

Verification result:

```text
tables: 13
indexes: 17
rls enabled tables: 13
storage buckets: competitors, packages
```
