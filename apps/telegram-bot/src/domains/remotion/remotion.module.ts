import { Module } from '@nestjs/common';
import { RemotionService } from './remotion.service';

@Module({
  providers: [RemotionService],
  exports: [RemotionService],
})
export class RemotionModule {}
