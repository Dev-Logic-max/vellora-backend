import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeGateway } from './realtime.gateway';

/**
 * Global so any module can inject RealtimeGateway to push realtime events
 * (notifications → user rooms, messaging → conversation rooms).
 */
@Global()
@Module({
  imports: [AuthModule],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
