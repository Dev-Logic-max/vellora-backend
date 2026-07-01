import { relations } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { stores } from './stores';
import { users } from './users';

/**
 * POS — a full, real point-of-sale suite. Tenant-scoped + RLS on company_id.
 * A product/order/customer/register belongs to a store; everything hangs off
 * company_id for isolation. Checkout persists orders + line items + payments,
 * decrements stock and logs a movement — all inside one withTenant() tx.
 */

/** Product categories within a store (e.g. Beverages, Apparel). */
export const productCategories = pgTable(
  'product_categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('#6366f1'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('product_categories_store_id_idx').on(table.storeId),
    unique('product_categories_store_name_unique').on(table.storeId, table.name),
  ],
);

/** Sellable products in a store. `status` text: 'active' | 'archived'. */
export const products = pgTable(
  'products',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => productCategories.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    sku: text('sku'),
    /** Scannable barcode (EAN/UPC) — drives the register's scan-to-add. */
    barcode: text('barcode'),
    /** Price + currency (currency falls back to the store/company currency in UI). */
    price: numeric('price', { precision: 12, scale: 2 }).notNull().default('0'),
    /** Unit cost — for margin/profit reporting (optional). */
    cost: numeric('cost', { precision: 12, scale: 2 }),
    currency: text('currency').notNull().default('USD'),
    /** Whether store tax applies to this product at checkout. */
    taxable: text('taxable').notNull().default('true'),
    /** On-hand stock; low-stock threshold drives the inventory badge. */
    stock: integer('stock').notNull().default(0),
    lowStockThreshold: integer('low_stock_threshold').notNull().default(5),
    imageUrl: text('image_url'),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('products_store_id_idx').on(table.storeId),
    index('products_category_id_idx').on(table.categoryId),
    index('products_barcode_idx').on(table.barcode),
    unique('products_store_sku_unique').on(table.storeId, table.sku),
  ],
);

// ── Customers (POS directory + loyalty) ──────────────────────────────────────
/** POS customers — attached to orders for loyalty + purchase history. */
export const posCustomers = pgTable(
  'pos_customers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    /** Optional home store; a customer can shop at any company store. */
    storeId: uuid('store_id').references(() => stores.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    email: text('email'),
    phone: text('phone'),
    /** Accrued loyalty points (1 pt / currency unit spent by default). */
    loyaltyPoints: integer('loyalty_points').notNull().default(0),
    /** Lifetime spend (denormalized for the directory + tiers). */
    totalSpent: numeric('total_spent', { precision: 14, scale: 2 }).notNull().default('0'),
    orderCount: integer('order_count').notNull().default(0),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('pos_customers_company_id_idx').on(table.companyId)],
);

// ── Discounts / coupons ──────────────────────────────────────────────────────
/** Discount catalog. `kind` = 'percent' | 'fixed'; `code` optional coupon. */
export const posDiscounts = pgTable(
  'pos_discounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    /** Store-scoped when set, else company-wide. */
    storeId: uuid('store_id').references(() => stores.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    code: text('code'),
    kind: text('kind').notNull().default('percent'),
    /** percent (0-100) or fixed amount, per `kind`. */
    value: numeric('value', { precision: 12, scale: 2 }).notNull().default('0'),
    active: text('active').notNull().default('true'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('pos_discounts_company_id_idx').on(table.companyId)],
);

// ── Registers + sessions (cash drawer) ───────────────────────────────────────
/** A named till/register in a store. */
export const posRegisters = pgTable(
  'pos_registers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    status: text('status').notNull().default('active'), // 'active' | 'inactive'
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('pos_registers_store_id_idx').on(table.storeId),
    unique('pos_registers_store_name_unique').on(table.storeId, table.name),
  ],
);

/** An open/close cash session on a register. `status` 'open' | 'closed'. */
export const posRegisterSessions = pgTable(
  'pos_register_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    registerId: uuid('register_id')
      .notNull()
      .references(() => posRegisters.id, { onDelete: 'cascade' }),
    openedBy: uuid('opened_by').references(() => users.id, { onDelete: 'set null' }),
    closedBy: uuid('closed_by').references(() => users.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('open'),
    openingCash: numeric('opening_cash', { precision: 14, scale: 2 }).notNull().default('0'),
    /** Cash sales tallied during the session (system-expected). */
    expectedCash: numeric('expected_cash', { precision: 14, scale: 2 }).notNull().default('0'),
    /** Counted cash at close; over/short = counted - opening - expected. */
    countedCash: numeric('counted_cash', { precision: 14, scale: 2 }),
    note: text('note'),
    openedAt: timestamp('opened_at', { withTimezone: true }).defaultNow().notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (table) => [
    index('pos_register_sessions_register_id_idx').on(table.registerId),
    index('pos_register_sessions_store_id_idx').on(table.storeId),
  ],
);

// ── Orders + items + payments ────────────────────────────────────────────────
/** A completed POS transaction. `status` 'completed' | 'refunded' | 'void'. */
export const posOrders = pgTable(
  'pos_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    /** Human order number, unique per store (e.g. ORD-000123). */
    orderNumber: text('order_number').notNull(),
    registerId: uuid('register_id').references(() => posRegisters.id, { onDelete: 'set null' }),
    sessionId: uuid('session_id').references(() => posRegisterSessions.id, {
      onDelete: 'set null',
    }),
    /** The user who rang the sale (manager/admin). */
    cashierId: uuid('cashier_id').references(() => users.id, { onDelete: 'set null' }),
    customerId: uuid('customer_id').references(() => posCustomers.id, { onDelete: 'set null' }),
    discountId: uuid('discount_id').references(() => posDiscounts.id, { onDelete: 'set null' }),
    subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull().default('0'),
    discountTotal: numeric('discount_total', { precision: 14, scale: 2 }).notNull().default('0'),
    taxTotal: numeric('tax_total', { precision: 14, scale: 2 }).notNull().default('0'),
    total: numeric('total', { precision: 14, scale: 2 }).notNull().default('0'),
    currency: text('currency').notNull().default('USD'),
    /** Primary payment method (cash | card | wallet | mixed). */
    paymentMethod: text('payment_method').notNull().default('cash'),
    status: text('status').notNull().default('completed'),
    /** Loyalty points earned on this order. */
    loyaltyEarned: integer('loyalty_earned').notNull().default(0),
    note: text('note'),
    /** Snapshot bits (customer name at time of sale, etc.). */
    meta: jsonb('meta'),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    refundedBy: uuid('refunded_by').references(() => users.id, { onDelete: 'set null' }),
    refundReason: text('refund_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('pos_orders_store_id_idx').on(table.storeId),
    index('pos_orders_created_at_idx').on(table.createdAt),
    unique('pos_orders_store_number_unique').on(table.storeId, table.orderNumber),
  ],
);

/** A line item on an order (product snapshot at sale time). */
export const posOrderItems = pgTable(
  'pos_order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => posOrders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    sku: text('sku'),
    unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull().default('0'),
    quantity: integer('quantity').notNull().default(1),
    discountTotal: numeric('discount_total', { precision: 12, scale: 2 }).notNull().default('0'),
    lineTotal: numeric('line_total', { precision: 14, scale: 2 }).notNull().default('0'),
  },
  (table) => [
    index('pos_order_items_order_id_idx').on(table.orderId),
    index('pos_order_items_product_id_idx').on(table.productId),
  ],
);

/** Payment tender(s) against an order (multi-tender ready). */
export const posPayments = pgTable(
  'pos_payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => posOrders.id, { onDelete: 'cascade' }),
    method: text('method').notNull().default('cash'), // cash | card | wallet
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull().default('0'),
    /** For cash: amount tendered + change given. */
    tendered: numeric('tendered', { precision: 14, scale: 2 }),
    change: numeric('change', { precision: 14, scale: 2 }),
    reference: text('reference'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('pos_payments_order_id_idx').on(table.orderId)],
);

// ── Stock movements (inventory audit) ────────────────────────────────────────
/** Every stock change. `reason` = sale | refund | restock | adjust | initial. */
export const posStockMovements = pgTable(
  'pos_stock_movements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    /** Signed delta applied to stock (e.g. -1 sale, +10 restock). */
    delta: integer('delta').notNull(),
    /** Resulting on-hand after the change (snapshot). */
    balance: integer('balance').notNull(),
    reason: text('reason').notNull().default('adjust'),
    orderId: uuid('order_id').references(() => posOrders.id, { onDelete: 'set null' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('pos_stock_movements_product_id_idx').on(table.productId),
    index('pos_stock_movements_store_id_idx').on(table.storeId),
  ],
);

// ── Relations ────────────────────────────────────────────────────────────────
export const productCategoriesRelations = relations(productCategories, ({ one, many }) => ({
  store: one(stores, { fields: [productCategories.storeId], references: [stores.id] }),
  products: many(products),
}));

export const productsRelations = relations(products, ({ one }) => ({
  store: one(stores, { fields: [products.storeId], references: [stores.id] }),
  category: one(productCategories, {
    fields: [products.categoryId],
    references: [productCategories.id],
  }),
}));

export const posOrdersRelations = relations(posOrders, ({ one, many }) => ({
  store: one(stores, { fields: [posOrders.storeId], references: [stores.id] }),
  customer: one(posCustomers, { fields: [posOrders.customerId], references: [posCustomers.id] }),
  register: one(posRegisters, { fields: [posOrders.registerId], references: [posRegisters.id] }),
  items: many(posOrderItems),
  payments: many(posPayments),
}));

export const posOrderItemsRelations = relations(posOrderItems, ({ one }) => ({
  order: one(posOrders, { fields: [posOrderItems.orderId], references: [posOrders.id] }),
  product: one(products, { fields: [posOrderItems.productId], references: [products.id] }),
}));

export const posPaymentsRelations = relations(posPayments, ({ one }) => ({
  order: one(posOrders, { fields: [posPayments.orderId], references: [posOrders.id] }),
}));

export const posRegistersRelations = relations(posRegisters, ({ one, many }) => ({
  store: one(stores, { fields: [posRegisters.storeId], references: [stores.id] }),
  sessions: many(posRegisterSessions),
}));

export const posRegisterSessionsRelations = relations(posRegisterSessions, ({ one }) => ({
  register: one(posRegisters, {
    fields: [posRegisterSessions.registerId],
    references: [posRegisters.id],
  }),
  store: one(stores, { fields: [posRegisterSessions.storeId], references: [stores.id] }),
}));

export const posCustomersRelations = relations(posCustomers, ({ one }) => ({
  store: one(stores, { fields: [posCustomers.storeId], references: [stores.id] }),
}));

export const posStockMovementsRelations = relations(posStockMovements, ({ one }) => ({
  product: one(products, { fields: [posStockMovements.productId], references: [products.id] }),
  store: one(stores, { fields: [posStockMovements.storeId], references: [stores.id] }),
}));

// ── Types ────────────────────────────────────────────────────────────────────
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type ProductCategory = typeof productCategories.$inferSelect;
export type NewProductCategory = typeof productCategories.$inferInsert;
export type PosOrder = typeof posOrders.$inferSelect;
export type NewPosOrder = typeof posOrders.$inferInsert;
export type PosOrderItem = typeof posOrderItems.$inferSelect;
export type NewPosOrderItem = typeof posOrderItems.$inferInsert;
export type PosPayment = typeof posPayments.$inferSelect;
export type PosCustomer = typeof posCustomers.$inferSelect;
export type NewPosCustomer = typeof posCustomers.$inferInsert;
export type PosDiscount = typeof posDiscounts.$inferSelect;
export type NewPosDiscount = typeof posDiscounts.$inferInsert;
export type PosRegister = typeof posRegisters.$inferSelect;
export type NewPosRegister = typeof posRegisters.$inferInsert;
export type PosRegisterSession = typeof posRegisterSessions.$inferSelect;
export type NewPosRegisterSession = typeof posRegisterSessions.$inferInsert;
export type PosStockMovement = typeof posStockMovements.$inferSelect;
export type NewPosStockMovement = typeof posStockMovements.$inferInsert;
