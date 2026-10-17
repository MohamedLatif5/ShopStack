import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminInventoryController } from './admin-inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminInventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}
