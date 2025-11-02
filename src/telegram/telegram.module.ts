import { Module } from '@nestjs/common';
import { TelegramClientService } from './telegram-client.service';
import { UsersModule } from '../database/models/users/users.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule, UsersModule],
  providers: [TelegramClientService],
  exports: [TelegramClientService],
})
export class TelegramModule {}


