import { Module } from '@nestjs/common';
import { PollsService } from './polls.service';
import { DatabaseModule } from '../database/database.module';
import { shiftPollsProviders } from '../database/models/shift-polls/shift-polls.providers';

@Module({
  imports: [DatabaseModule],
  providers: [PollsService, ...shiftPollsProviders],
  exports: [PollsService],
})
export class PollsModule {}

