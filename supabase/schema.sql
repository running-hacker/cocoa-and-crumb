-- Rolling Pin — shared database schema for Supabase.
--
-- HOW TO USE:
--   1. Create a free project at https://supabase.com
--   2. Open the project's "SQL Editor", paste this whole file, and click "Run".
--   3. Copy "Project URL" and the "service_role" key from Settings -> API into
--      the server .env (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) and restart.
--
-- Re-running this file is safe — every statement is written to be idempotent.

-- One row per order. Column names are snake_case here and mapped to the app's
-- camelCase shape in server/store.js.
create table if not exists orders (
  id             uuid primary key,
  code           text unique not null,
  product_id     text,
  product_name   text,
  emoji          text,
  art            text,
  weight         text,
  qty            integer,
  unit_price     numeric,
  fulfillment    text,
  date           text,            -- fulfillment date as 'YYYY-MM-DD' (opaque string)
  address        text,
  customer_name  text,
  customer_phone text,
  customer_email text,
  message        text,
  total          numeric,
  amount_paid    numeric,
  balance        numeric,
  payment_ref    text unique,     -- unique => verify + webhook can't duplicate an order
  payment_channel text,
  payment_status text,
  status         text not null default 'New',
  created_at     timestamptz not null default now()
);

-- Dashboard lists newest-first and filters by status/date.
create index if not exists orders_created_at_idx on orders (created_at desc);
create index if not exists orders_status_idx on orders (status);

-- The menu. The server seeds the starting cakes the first time this table is empty.
create table if not exists products (
  id        text primary key,
  name      text not null,
  category  text,
  emoji     text,
  tag       text,
  blurb     text,
  art       text,
  price     numeric not null default 0,
  image     text,             -- public URL of an uploaded photo, or null for the emoji
  weight    text,
  sold_out  boolean not null default false,
  sort      integer not null default 0
);

create index if not exists products_sort_idx on products (sort);

-- Editable business details, kept as one JSONB blob (always id = 1). The server
-- seeds it on first run and merges edits in.
create table if not exists business (
  id   integer primary key,
  data jsonb not null default '{}'::jsonb
);

-- Single-row settings table (always id = 1).
create table if not exists settings (
  id              integer primary key,
  whatsapp_backup boolean not null default false,
  accepting_orders boolean not null default true
);

-- Add accepting_orders if you created the table before this column existed.
alter table settings add column if not exists accepting_orders boolean not null default true;

insert into settings (id, whatsapp_backup, accepting_orders)
values (1, false, true)
on conflict (id) do nothing;

-- Lock every table down. The server talks to Supabase with the service_role key,
-- which BYPASSES row-level security, so it keeps full access. Enabling RLS with no
-- public policies means the anon/public key cannot read anything — orders and
-- customer details are only ever reachable through our own server.
alter table orders enable row level security;
alter table products enable row level security;
alter table business enable row level security;
alter table settings enable row level security;

-- Product photos are stored in a public Storage bucket named "product-images".
-- The server creates it automatically on the first upload, so there is no manual
-- step here. Photos are not private (they're shown on the storefront); only the
-- order/customer data is protected, and that lives in the RLS-locked tables above.
