import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CompanyId } from '../common/decorators/company-id.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { PermissionGuard } from '../permissions/permission.guard';
import { BroadcastDto, ListNotificationsDto, UpdatePreferenceDto } from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

const ADMIN_ROLES = ['owner', 'hr'] as const;

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(TenantGuard, PermissionGuard)
@RequirePermission('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CompanyId() companyId: string,
    @CurrentUser('userId') userId: string,
    @Query() query: ListNotificationsDto,
  ) {
    return this.notifications.list(companyId, userId, query);
  }

  @Get('unread-count')
  async unreadCount(@CompanyId() companyId: string, @CurrentUser('userId') userId: string) {
    return { count: await this.notifications.unreadCount(companyId, userId) };
  }

  @Post(':id/read')
  markRead(
    @CompanyId() companyId: string,
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notifications.markRead(companyId, userId, id);
  }

  @Post('read-all')
  markAllRead(@CompanyId() companyId: string, @CurrentUser('userId') userId: string) {
    return this.notifications.markAllRead(companyId, userId);
  }

  // ── preferences ─────────────────────────────────────────────────────────
  @Get('preferences')
  preferences(@CompanyId() companyId: string, @CurrentUser('userId') userId: string) {
    return this.notifications.listPreferences(companyId, userId);
  }

  @Put('preferences')
  updatePreference(
    @CompanyId() companyId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdatePreferenceDto,
  ) {
    return this.notifications.updatePreference(companyId, userId, dto);
  }

  // ── broadcast (admins) ──────────────────────────────────────────────────
  @Post('broadcast')
  @UseGuards(RolesGuard)
  @Roles(...ADMIN_ROLES)
  broadcast(@CompanyId() companyId: string, @Body() dto: BroadcastDto) {
    return this.notifications.broadcast(companyId, dto);
  }
}
