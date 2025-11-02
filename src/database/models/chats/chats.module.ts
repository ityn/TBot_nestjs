import { Module } from '@nestjs/common';
import { ChatsService } from './chats.service';
import { chatsProviders } from './chats.providers';
import { DatabaseModule } from '../../database.module';

@Module({
    imports: [DatabaseModule],
    providers: [...chatsProviders, ChatsService],
    exports: [ChatsService],
})
export class ChatsModule {}

