import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import {
  AddMembersDto,
  CreateConversationDto,
  SearchMessagesDto,
  SendEmailDto,
  SendMessageDto,
} from './dto/messaging.dto';
import { EmailService } from './email.service';
import { MessagingService } from './messaging.service';

@ApiTags('messaging')
@ApiBearerAuth()
@Controller('messaging')
@UseGuards(TenantGuard, PermissionGuard, PlanGuard)
@RequirePermission('messaging')
@RequireEntitlement('messaging')
export class MessagingController {
  constructor(
    private readonly messaging: MessagingService,
    private readonly email: EmailService,
  ) {}

  // ── conversations ─────────────────────────────────────────────────────────
  @Get('conversations')
  listConversations(@CompanyId() companyId: string) {
    return this.messaging.listConversations(companyId);
  }

  @Post('conversations')
  createConversation(@CompanyId() companyId: string, @Body() dto: CreateConversationDto) {
    return this.messaging.createConversation(companyId, dto);
  }

  @Get('conversations/:id')
  getConversation(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.messaging.getConversation(companyId, id);
  }

  @Post('conversations/:id/members')
  addMembers(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddMembersDto,
  ) {
    return this.messaging.addMembers(companyId, id, dto);
  }

  // ── messages ──────────────────────────────────────────────────────────────
  @Get('conversations/:id/messages')
  listMessages(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.messaging.listMessages(companyId, id);
  }

  @Post('conversations/:id/messages')
  sendMessage(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messaging.sendMessage(companyId, id, dto);
  }

  @Post('conversations/:id/read/:messageId')
  markRead(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
  ) {
    return this.messaging.markRead(companyId, id, messageId);
  }

  @Get('search')
  search(@CompanyId() companyId: string, @Query() query: SearchMessagesDto) {
    return this.messaging.search(companyId, query.q);
  }

  // ── email ─────────────────────────────────────────────────────────────────
  @Get('email/threads')
  emailThreads(@CompanyId() companyId: string) {
    return this.email.listThreads(companyId);
  }

  @Get('email/threads/:id')
  emailThread(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.email.getThread(companyId, id);
  }

  @Post('email/send')
  sendEmail(@CompanyId() companyId: string, @Body() dto: SendEmailDto) {
    return this.email.send(companyId, dto);
  }
}
