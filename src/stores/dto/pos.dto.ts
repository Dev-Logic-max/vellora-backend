import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// ── Checkout / orders ────────────────────────────────────────────────────────
export const checkoutItemSchema = z.object({
  productId: z.uuid(),
  quantity: z.coerce.number().int().min(1).max(9999),
  /** Optional per-line discount amount (absolute, in currency units). */
  lineDiscount: z.coerce.number().min(0).optional(),
});

export const checkoutSchema = z.object({
  items: z.array(checkoutItemSchema).min(1),
  registerId: z.uuid().optional(),
  sessionId: z.uuid().optional(),
  customerId: z.uuid().optional(),
  discountId: z.uuid().optional(),
  /** Order-level discount override; else derived from `discountId`. */
  orderDiscount: z.coerce.number().min(0).optional(),
  paymentMethod: z.enum(['cash', 'card', 'wallet']).default('cash'),
  /** Cash tendered (for change calc); ignored for non-cash. */
  tendered: z.coerce.number().min(0).optional(),
  note: z.string().max(500).optional(),
});
export class CheckoutDto extends createZodDto(checkoutSchema) {}

export const refundOrderSchema = z.object({
  reason: z.string().max(500).optional(),
  /** Restock the sold items back into inventory (default true). */
  restock: z.coerce.boolean().optional(),
});
export class RefundOrderDto extends createZodDto(refundOrderSchema) {}

// ── Customers ────────────────────────────────────────────────────────────────
export const createCustomerSchema = z.object({
  name: z.string().min(1).max(160),
  email: z.string().email().max(200).optional().or(z.literal('')),
  phone: z.string().max(40).optional(),
  storeId: z.uuid().optional(),
  notes: z.string().max(1000).optional(),
});
export class CreateCustomerDto extends createZodDto(createCustomerSchema) {}
export const updateCustomerSchema = createCustomerSchema.partial();
export class UpdateCustomerDto extends createZodDto(updateCustomerSchema) {}

export const adjustLoyaltySchema = z.object({
  /** Signed points delta (e.g. -100 redeem, +50 grant). */
  delta: z.coerce.number().int(),
});
export class AdjustLoyaltyDto extends createZodDto(adjustLoyaltySchema) {}

// ── Discounts ────────────────────────────────────────────────────────────────
export const createDiscountSchema = z.object({
  name: z.string().min(1).max(120),
  code: z.string().max(40).optional(),
  kind: z.enum(['percent', 'fixed']).default('percent'),
  value: z.coerce.number().min(0),
  storeId: z.uuid().optional(),
  active: z.coerce.boolean().optional(),
});
export class CreateDiscountDto extends createZodDto(createDiscountSchema) {}
export const updateDiscountSchema = createDiscountSchema.partial();
export class UpdateDiscountDto extends createZodDto(updateDiscountSchema) {}

// ── Registers + sessions ─────────────────────────────────────────────────────
export const createRegisterSchema = z.object({
  name: z.string().min(1).max(80),
});
export class CreateRegisterDto extends createZodDto(createRegisterSchema) {}

export const openSessionSchema = z.object({
  registerId: z.uuid(),
  openingCash: z.coerce.number().min(0).optional(),
  note: z.string().max(500).optional(),
});
export class OpenSessionDto extends createZodDto(openSessionSchema) {}

export const closeSessionSchema = z.object({
  countedCash: z.coerce.number().min(0),
  note: z.string().max(500).optional(),
});
export class CloseSessionDto extends createZodDto(closeSessionSchema) {}

// ── Inventory / restock ──────────────────────────────────────────────────────
export const restockSchema = z.object({
  /** Signed delta (e.g. +50 receive stock, -3 shrinkage). */
  delta: z.coerce.number().int(),
  reason: z.enum(['restock', 'adjust']).default('restock'),
  note: z.string().max(300).optional(),
});
export class RestockDto extends createZodDto(restockSchema) {}

// ── Store tax config (persisted on stores.settings) ──────────────────────────
export const setTaxSchema = z.object({
  /** Tax rate percent (0-100). Stored on stores.settings.taxRate. */
  taxRate: z.coerce.number().min(0).max(100),
});
export class SetTaxDto extends createZodDto(setTaxSchema) {}
