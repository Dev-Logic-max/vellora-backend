import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CompanyId } from '../common/decorators/company-id.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { StorageService } from '../infra/storage.service';

const imageUploadSchema = z.object({
  filename: z.string().min(1).max(200),
  /** Where the image is used — groups objects under a readable prefix. */
  kind: z.enum([
    'company-banner',
    'company-logo',
    'store-banner',
    'store-logo',
    'office-banner',
    'office-logo',
    'factory-banner',
    'factory-logo',
    'user-avatar',
    'employee-avatar',
    'avatar',
  ]),
});
class ImageUploadDto extends createZodDto(imageUploadSchema) {}

const imageDeleteSchema = z.object({ url: z.string().min(1).max(1000) });
class ImageDeleteDto extends createZodDto(imageDeleteSchema) {}

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

  @Delete()
  @ApiOperation({ summary: 'Delete a previously-uploaded public image by its URL' })
  async remove(@Body() dto: ImageDeleteDto) {
    await this.storage.deleteByPublicUrl(dto.url);
    return { removed: true };
  }
}
