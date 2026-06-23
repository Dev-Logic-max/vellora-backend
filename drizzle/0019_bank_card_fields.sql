-- Optional linked payment card on a bank account (network + last 4). Additive/idempotent.
ALTER TABLE "employee_bank_accounts" ADD COLUMN IF NOT EXISTS "card_network" text;--> statement-breakpoint
ALTER TABLE "employee_bank_accounts" ADD COLUMN IF NOT EXISTS "card_last4" text;