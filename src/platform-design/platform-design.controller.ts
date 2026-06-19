import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PlatformDesignService } from './platform-design.service';
import { UpdateDesignDto } from './dto/platform-design.dto';

/**
 * Platform design settings (design module). GLOBAL config (no tenant scope):
 * GET is readable by any authenticated user so the app can load the active
 * theme; writes are platform-admin actions.
 *
 * TODO(platform-admin): the super_admin plane isn't modeled yet (see
 * enums.ts), so writes are temporarily gated to `owner`. Swap to a super-admin
 * guard once the platform plane lands.
 */
@ApiTags('platform-design')
@ApiBearerAuth()
@Controller('platform-design')
export class PlatformDesignController {
  constructor(private readonly design: PlatformDesignService) {}

  @Get()
  get() {
    return this.design.get();
  }

  @Patch()
  @UseGuards(RolesGuard)
  @Roles('owner')
  update(@Body() dto: UpdateDesignDto, @CurrentUser('userId') userId: string) {
    return this.design.update(dto, userId);
  }

  @Post('reset')
  @UseGuards(RolesGuard)
  @Roles('owner')
  reset(@CurrentUser('userId') userId: string) {
    return this.design.reset(userId);
  }
}
