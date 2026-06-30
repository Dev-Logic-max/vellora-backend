import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { UpdateMyProfileDto } from './dto/me-profile.dto';
import { MeProfileService } from './me-profile.service';

/**
 * `/api/me/profile` — the signed-in user's own account (identity + personal
 * details). No role gate: a user can only read/write their own record. The
 * global SupabaseAuthGuard still requires a valid token.
 */
@ApiTags('auth')
@ApiBearerAuth()
@Controller('me/profile')
export class MeProfileController {
  constructor(private readonly profile: MeProfileService) {}

  @Get()
  @ApiOperation({ summary: "The current user's account + linked employee profile" })
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.profile.get(user);
  }

  @Patch()
  @ApiOperation({ summary: 'Update the current user’s own profile fields' })
  update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateMyProfileDto) {
    return this.profile.update(user, dto);
  }
}
