import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CompanyId } from '../common/decorators/company-id.decorator';
import { RequireEntitlement } from '../common/decorators/require-entitlement.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { PlanGuard } from '../entitlements/plan.guard';
import { PermissionGuard } from '../permissions/permission.guard';
import { DocumentsService } from './documents.service';
import {
  BulkCreateDto,
  CreateDocumentDto,
  CreateFolderDto,
  ListDocumentsDto,
  RequestSignatureDto,
  RequestUploadDto,
  SignDto,
  UpdateDocumentDto,
  UpdateFolderDto,
} from './dto/documents.dto';

@ApiTags('documents')
@ApiBearerAuth()
@Controller('documents')
@UseGuards(TenantGuard, PermissionGuard)
@RequirePermission('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  // ── folders ─────────────────────────────────────────────────────────────
  @Get('folders')
  listFolders(@CompanyId() companyId: string) {
    return this.documents.listFolders(companyId);
  }

  @Post('folders')
  createFolder(@CompanyId() companyId: string, @Body() dto: CreateFolderDto) {
    return this.documents.createFolder(companyId, dto);
  }

  @Patch('folders/:id')
  updateFolder(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFolderDto,
  ) {
    return this.documents.updateFolder(companyId, id, dto);
  }

  @Delete('folders/:id')
  deleteFolder(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.deleteFolder(companyId, id);
  }

  // ── trash (declared before :id so the literal path wins) ───────────────────
  @Get('trash')
  listTrash(@CompanyId() companyId: string) {
    return this.documents.listTrash(companyId);
  }

  @Post('trash/:id/restore')
  restore(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.restore(companyId, id);
  }

  @Delete('trash/:id')
  purge(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.purge(companyId, id);
  }

  // ── documents ─────────────────────────────────────────────────────────────
  @Get()
  list(@CompanyId() companyId: string, @Query() query: ListDocumentsDto) {
    return this.documents.list(companyId, query);
  }

  /** Step 1 of upload — returns a short-lived signed upload URL (never public). */
  @Post('upload-url')
  requestUpload(@CompanyId() companyId: string, @Body() dto: RequestUploadDto) {
    return this.documents.requestUpload(companyId, dto);
  }

  @Post()
  create(@CompanyId() companyId: string, @Body() dto: CreateDocumentDto) {
    return this.documents.create(companyId, dto);
  }

  @Post('bulk')
  @UseGuards(PlanGuard)
  @RequireEntitlement('documents')
  bulk(@CompanyId() companyId: string, @Body() dto: BulkCreateDto) {
    return this.documents.bulkCreate(companyId, dto);
  }

  @Get(':id/url')
  url(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.getDownloadUrl(companyId, id);
  }

  @Patch(':id')
  update(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.documents.update(companyId, id, dto);
  }

  @Delete(':id')
  softDelete(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.softDelete(companyId, id);
  }

  // ── e-signature (paid) ─────────────────────────────────────────────────────
  @Post(':id/signatures')
  @UseGuards(PlanGuard)
  @RequireEntitlement('documents')
  requestSignatures(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequestSignatureDto,
  ) {
    return this.documents.requestSignatures(companyId, id, dto);
  }

  @Post('signatures/:sigId/sign')
  sign(
    @CompanyId() companyId: string,
    @Param('sigId', ParseUUIDPipe) sigId: string,
    @Body() dto: SignDto,
  ) {
    return this.documents.sign(companyId, sigId, dto);
  }

  // ── jobs (manual triggers; repeatable BullMQ crons in prod) ─────────────────
  @Post('expiry-scan')
  expiryScan(@CompanyId() companyId: string) {
    return this.documents.runExpiryScan(companyId);
  }
}
