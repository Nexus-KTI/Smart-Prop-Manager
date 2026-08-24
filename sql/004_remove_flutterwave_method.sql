-- Paystack + manual only (Flutterwave was never implemented).
-- Safe to re-run.

update public.transactions
set method = 'manual'
where method = 'flutterwave';

alter table public.transactions
  drop constraint if exists transactions_method_check;

alter table public.transactions
  add constraint transactions_method_check
  check (
    method is null
    or method = any (array['paystack'::text, 'manual'::text])
  );
