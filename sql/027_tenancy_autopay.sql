-- Tenant autopay: charge saved Paystack authorization on rent due day.

alter table public.tenancies
  add column if not exists autopay_enabled boolean not null default false;

alter table public.tenancies
  add column if not exists autopay_payment_method_id uuid
    references public.payment_methods (id) on delete set null;

alter table public.tenancies
  add column if not exists autopay_days_before integer not null default 0;

comment on column public.tenancies.autopay_enabled is
  'When true, cron charges rent via saved Paystack card on due day.';
comment on column public.tenancies.autopay_payment_method_id is
  'Saved payment_methods row owned by tenant_user_id.';
comment on column public.tenancies.autopay_days_before is
  'Days before due day to charge (0 = on due day). Clamped 0–7.';
