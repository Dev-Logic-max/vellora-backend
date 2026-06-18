import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { TRANSFER_KINDS, TRANSFER_STATUSES } from '../../database/schema/enums';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const listTransfersSchema = z.object({
  employeeId: z.uuid().optional(),
  status: z.enum(TRANSFER_STATUSES).optional(),
  kind: z.enum(TRANSFER_KINDS).optional(),
});
export class ListTransfersDto extends createZodDto(listTransfersSchema) {}

export const createTransferSchema = z
  .object({
    employeeId: z.uuid(),
    toStoreId: z.uuid(),
    fromStoreId: z.uuid().optional(),
    kind: z.enum(TRANSFER_KINDS).default('temporary'),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
    reason: z.string().max(500).optional(),
  })
  .refine((v) => v.kind === 'permanent' || (v.startDate && v.endDate), {
    message: 'Temporary transfers need a start and end date',
    path: ['endDate'],
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
  });
export class CreateTransferDto extends createZodDto(createTransferSchema) {}
