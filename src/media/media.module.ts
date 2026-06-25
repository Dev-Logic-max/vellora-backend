import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';

/** Public-image upload endpoints. StorageService is global (InfraModule). */
@Module({
  controllers: [MediaController],
})
export class MediaModule {}
