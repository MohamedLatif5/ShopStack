import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminOrdersController } from './admin-orders.controller';
import { CustomerOrdersController } from './customer-orders.controller';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [AuthModule],
  controllers: [
    OrdersController,
    CustomerOrdersController,
    AdminOrdersController,
  ],
  providers: [OrdersService],
})
export class OrdersModule {}
