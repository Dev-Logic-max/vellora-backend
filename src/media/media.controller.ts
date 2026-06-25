import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CompanyId } from '../common/decorators/company-id.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { StorageService } from '../infra/storage.service';

const imageUploadSchema = z.object({
  filename: z.string().min(1).max(200),
  /** Where the image is used — groups objects under a readable prefix. */
  kind: z.enum(['company-banner', 'company-logo', 'store-banner', 'store-logo', 'avatar']),
});
class ImageUploadDto extends createZodDto(imageUploadSchema) {}

/**
 * Public-image uploads (company banner/logo, avatars). Tenant-scoped: a company
 * uploads under its own prefix. Returns a short-lived SIGNED upload URL plus the
 * permanent PUBLIC URL to persist on the entity (e.g. PATCH /companies/:id).
 */
@ApiTags('media')
@ApiBearerAuth()
@Controller('media')
@UseGuards(TenantGuard)
export class MediaController {
  constructor(private readonly storage: StorageService) {}

  @Post('upload-url')
  @ApiOperation({ summary: 'Signed upload URL + public URL for a profile image' })
  uploadUrl(@CompanyId() companyId: string, @Body() dto: ImageUploadDto) {
    const prefix = `${dto.kind}/${companyId}`;
    return this.storage.createPublicImageUpload(prefix, dto.filename);
  }
}
