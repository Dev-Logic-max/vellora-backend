import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const checkoutSchema = z.object({
  planKey: z.string().min(1).max(60),
  interval: z.enum(['month', 'year']).default('month'),
});
export class CheckoutDto extends createZodDto(checkoutSchema) {}
