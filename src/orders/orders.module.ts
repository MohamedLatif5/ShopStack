import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CustomerOrdersController } from './customer-orders.controller';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [AuthModule],
  controllers: [OrdersController, CustomerOrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
