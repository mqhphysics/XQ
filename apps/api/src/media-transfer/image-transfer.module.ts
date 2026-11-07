import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { ImageTransferController } from './image-transfer.controller'
import { ImageTransferService } from './image-transfer.service'
@Module({
  imports: [AuthModule],
  controllers: [ImageTransferController],
  providers: [ImageTransferService],
  exports: [ImageTransferService],
})
export class ImageTransferModule {}
