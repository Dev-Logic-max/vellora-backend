import { Module } from '@nestjs/common';

import { MeProfileController } from './me-profile.controller';
import { MeProfileService } from './me-profile.service';

/** Self-service "My Account" profile (read/update the signed-in user's own record). */
@Module({
  controllers: [MeProfileController],
  providers: [MeProfileService],
})
export class MeProfileModule {}
