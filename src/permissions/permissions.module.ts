import { Global, Module } from '@nestjs/common';
import { PermissionGuard } from './permission.guard';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';

/** Global so any module can apply PermissionGuard / inject PermissionsService. */
@Global()
@Module({
  controllers: [PermissionsController],
  providers: [PermissionsService, PermissionGuard],
  exports: [PermissionsService, PermissionGuard],
})
export class PermissionsModule {}
