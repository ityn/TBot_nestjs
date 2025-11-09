import { Inject, Injectable } from '@nestjs/common';
import { Chat, ChatEnvironment } from './chat.entity';
import { ChatDto } from './dto/chat.dto';

@Injectable()
export class ChatsService {
    constructor(
        @Inject('CHATS_REPOSITORY')
        private chatsRepository: typeof Chat
    ) {}

    async create(chat: ChatDto): Promise<Chat> {
        const payload: ChatDto = {
            ...chat,
            isActive: chat.isActive ?? true,
            environment: chat.environment ?? 'prod',
        };
        return await this.chatsRepository.create<Chat>(payload as any);
    }

    async findAll(options: { onlyActive?: boolean; environment?: ChatEnvironment } = {}): Promise<Chat[]> {
        const where: Record<string, unknown> = {};
        if (options.onlyActive) {
            where.isActive = true;
        }
        if (options.environment) {
            where.environment = options.environment;
        }
        return this.chatsRepository.findAll<Chat>({ where });
    }

    async findOneByChatId(chatId: string): Promise<Chat> {
        return await this.chatsRepository.findOne<Chat>({ where: { chatId } });
    }

    async findOrCreate(
        chatId: string,
        title?: string,
        type?: string,
        environment: ChatEnvironment = 'prod',
        isActive = true,
    ): Promise<[Chat, boolean]> {
        const [chat, created] = await this.chatsRepository.findOrCreate<Chat>({
            where: { chatId },
            defaults: { chatId, title: title || null, type: type || null, environment, isActive },
        });

        let shouldSave = false;
        if (!created) {
            if (typeof title !== 'undefined' && chat.title !== title) {
                chat.title = title ?? null;
                shouldSave = true;
            }
            if (typeof type !== 'undefined' && chat.type !== type) {
                chat.type = type ?? null;
                shouldSave = true;
            }
            if (typeof environment !== 'undefined') {
                const currentEnv = (chat.environment ?? '').trim() as ChatEnvironment | '';
                const shouldUpdateEnv =
                    environment === 'dev'
                        ? currentEnv !== 'dev'
                        : currentEnv.length === 0;
                if (shouldUpdateEnv) {
                    chat.environment = environment;
                    shouldSave = true;
                }
            }
            if (typeof isActive !== 'undefined' && chat.isActive !== isActive) {
                chat.isActive = isActive;
                shouldSave = true;
            }
            if (shouldSave) {
                await chat.save();
            }
        }

        return [chat, created];
    }

    async update(chatId: string, data: Partial<ChatDto>): Promise<[number, Chat[]]> {
        return await this.chatsRepository.update(data, { where: { chatId }, returning: true });
    }

    async markActivity(chatId: string, isActive: boolean): Promise<Chat | null> {
        const chat = await this.findOneByChatId(chatId);
        if (!chat) {
            return null;
        }
        chat.isActive = isActive;
        await chat.save();
        return chat;
    }

    async remove(chatId: string): Promise<number> {
        return await this.chatsRepository.destroy({ where: { chatId } });
    }
}

