import { Inject, Injectable } from '@nestjs/common';
import { Chat } from './chat.entity';
import { ChatDto } from './dto/chat.dto';

@Injectable()
export class ChatsService {
    constructor(
        @Inject('CHATS_REPOSITORY')
        private chatsRepository: typeof Chat
    ) {}

    async create(chat: ChatDto): Promise<Chat> {
        return await this.chatsRepository.create<Chat>(chat);
    }

    async findAll(): Promise<Chat[]> {
        return this.chatsRepository.findAll<Chat>();
    }

    async findOneByChatId(chatId: string): Promise<Chat> {
        return await this.chatsRepository.findOne<Chat>({ where: { chatId } });
    }

    async findOrCreate(chatId: string, title?: string, type?: string): Promise<[Chat, boolean]> {
        return await this.chatsRepository.findOrCreate<Chat>({
            where: { chatId },
            defaults: { chatId, title: title || null, type: type || null },
        });
    }

    async update(chatId: string, data: Partial<ChatDto>): Promise<[number, Chat[]]> {
        return await this.chatsRepository.update(data, { where: { chatId }, returning: true });
    }

    async remove(chatId: string): Promise<number> {
        return await this.chatsRepository.destroy({ where: { chatId } });
    }
}

