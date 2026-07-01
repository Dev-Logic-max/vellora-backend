import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createProductSchema = z.object({
  name: z.string().min(1).max(160),
  sku: z.string().max(60).optional(),
  barcode: z.string().max(60).optional(),
  categoryId: z.uuid().optional(),
  price: z.coerce.number().min(0).optional(),
  cost: z.coerce.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  taxable: z.coerce.boolean().optional(),
  stock: z.coerce.number().int().min(0).optional(),
  lowStockThreshold: z.coerce.number().int().min(0).optional(),
  imageUrl: z.string().url().max(500).optional(),
  status: z.enum(['active', 'archived']).optional(),
});
export class CreateProductDto extends createZodDto(createProductSchema) {}

export const updateProductSchema = createProductSchema.partial();
export class UpdateProductDto extends createZodDto(updateProductSchema) {}

export const adjustStockSchema = z.object({
  /** Signed delta (e.g. +10 restock, -1 sold). */
  delta: z.coerce.number().int(),
});
export class AdjustStockDto extends createZodDto(adjustStockSchema) {}

export const createProductCategorySchema = z.object({
  name: z.string().min(1).max(80),
  color: z.string().max(20).optional(),
});
export class CreateProductCategoryDto extends createZodDto(createProductCategorySchema) {}
