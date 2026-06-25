import { Module } from '@nestjs/common';
import { PlatformRequestsModule } from '../platform-requests/platform-requests.module';
import { AdminController } from './admin.controller';
import { AdminRepository } from './admin.repository';
import { AdminService } from './admin.service';

/** Platform console (Phase 9-E). Cross-tenant; gated by PlatformGuard. */
@Module({
  imports: [PlatformRequestsModule],
  controllers: [AdminController],
  providers: [AdminService, AdminRepository],
  exports: [AdminService],
})
export class AdminModule {}
