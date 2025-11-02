import { Test, TestingModule } from '@nestjs/testing';
import { ChatsService } from './chats.service';

describe('ChatsService', () => {
    let service: ChatsService;

    const mockChatRepository = {
        create: jest.fn(),
        findAll: jest.fn(),
        findOne: jest.fn(),
        findOrCreate: jest.fn(),
        update: jest.fn(),
        destroy: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ChatsService,
                {
                    provide: 'CHATS_REPOSITORY',
                    useValue: mockChatRepository,
                },
            ],
        }).compile();

        service = module.get<ChatsService>(ChatsService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('create', () => {
        it('should create a chat', async () => {
            const chatDto = {
                chatId: '123456',
                title: 'Test Chat',
                type: 'group',
            };

            const createdChat = { id: 1, ...chatDto };
            mockChatRepository.create.mockResolvedValue(createdChat);

            const result = await service.create(chatDto);

            expect(result).toEqual(createdChat);
            expect(mockChatRepository.create).toHaveBeenCalledWith(chatDto);
        });
    });

    describe('findAll', () => {
        it('should find all chats', async () => {
            const chats = [
                { id: 1, chatId: '123456', title: 'Chat 1' },
                { id: 2, chatId: '789012', title: 'Chat 2' },
            ];
            mockChatRepository.findAll.mockResolvedValue(chats);

            const result = await service.findAll();

            expect(result).toEqual(chats);
            expect(mockChatRepository.findAll).toHaveBeenCalled();
        });
    });

    describe('findOneByChatId', () => {
        it('should find chat by chatId', async () => {
            const chat = { id: 1, chatId: '123456' };
            mockChatRepository.findOne.mockResolvedValue(chat);

            const result = await service.findOneByChatId('123456');

            expect(result).toEqual(chat);
            expect(mockChatRepository.findOne).toHaveBeenCalledWith({ where: { chatId: '123456' } });
        });
    });

    describe('findOrCreate', () => {
        it('should find existing chat', async () => {
            const chat = { id: 1, chatId: '123456', title: 'Existing Chat' };
            mockChatRepository.findOrCreate.mockResolvedValue([chat, false]);

            const result = await service.findOrCreate('123456', 'Test', 'group');

            expect(result).toEqual([chat, false]);
            expect(mockChatRepository.findOrCreate).toHaveBeenCalledWith({
                where: { chatId: '123456' },
                defaults: { chatId: '123456', title: 'Test', type: 'group' },
            });
        });

        it('should create new chat if not exists', async () => {
            const chat = { id: 1, chatId: '123456', title: 'New Chat' };
            mockChatRepository.findOrCreate.mockResolvedValue([chat, true]);

            const result = await service.findOrCreate('123456', 'New Chat', 'group');

            expect(result).toEqual([chat, true]);
        });
    });

    describe('remove', () => {
        it('should remove chat by chatId', async () => {
            const deletedCount = 1;
            mockChatRepository.destroy.mockResolvedValue(deletedCount);

            const result = await service.remove('123456');

            expect(result).toBe(deletedCount);
            expect(mockChatRepository.destroy).toHaveBeenCalledWith({ where: { chatId: '123456' } });
        });
    });
});

