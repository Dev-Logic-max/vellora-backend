import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .optional();

/**
 * Fields a user may edit about THEMSELVES. Identity (name/avatar/locale) lands on
 * the global `users` row; the rest land on their linked employee row. Email is
 * NOT here — it's owned by Supabase Auth and changed via the auth flow.
 */
export const updateMyProfileSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().min(1).max(80).optional(),
  avatarUrl: z.string().max(1000).nullable().optional(),
  locale: z.string().max(10).optional(),
  phone: z.string().max(40).optional(),
  nationality: z.string().max(80).optional(),
  dateOfBirth: isoDate,
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
  maritalStatus: z.enum(['single', 'married', 'divorced', 'widowed', 'other']).optional(),
  country: z.string().max(80).optional(),
  state: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  postalCode: z.string().max(20).optional(),
  address: z.string().max(240).optional(),
});
export class UpdateMyProfileDto extends createZodDto(updateMyProfileSchema) {}
