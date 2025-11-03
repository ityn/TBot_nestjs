import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { ConfigModule } from '@nestjs/config';
import { WorkShiftsModule } from '../database/models/work-shifts/work-shifts.module';
import { ChatsModule } from '../database/models/chats/chats.module';
import { PollsModule } from '../polls/polls.module';
import { UsersModule } from '../database/models/users/users.module';

@Module({
  imports: [
    ConfigModule,
    WorkShiftsModule,
    ChatsModule,
    PollsModule,
    UsersModule
  ],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}


