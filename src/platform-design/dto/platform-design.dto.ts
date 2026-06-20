import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * A single semantic-token override: key like `--accent`, value a space-separated
 * `R G B` triple (e.g. `79 70 229`). Only the SEMANTIC layer is overridable —
 * primitives and component tokens are not exposed here.
 */
const tokenKey = z.string().regex(/^--[a-z0-9-]+$/, 'token must look like --accent');
const rgbTriple = z
  .string()
  .regex(/^\d{1,3} \d{1,3} \d{1,3}$/, 'value must be "R G B" (0–255 each)');

export const updateDesignSchema = z.object({
  themeKey: z.string().min(1).max(40).optional(),
  /** Sparse map of overridden semantic tokens; {} clears to pure Aurora. */
  tokens: z.record(tokenKey, rgbTriple).optional(),
});
export class UpdateDesignDto extends createZodDto(updateDesignSchema) {}
