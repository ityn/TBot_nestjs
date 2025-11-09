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
        it('should create a chat with provided parameters', async () => {
            const chatDto = {
                chatId: '123456',
                title: 'Test Chat',
                type: 'group',
                isActive: true,
                environment: 'prod' as const,
            };

            const createdChat = { id: 1, ...chatDto };
            mockChatRepository.create.mockResolvedValue(createdChat);

            const result = await service.create(chatDto);

            expect(result).toEqual(createdChat);
            expect(mockChatRepository.create).toHaveBeenCalledWith(chatDto);
        });

        it('should apply defaults when optional parameters missing', async () => {
            const chatDto = {
                chatId: '654321',
            };

            const createdChat = { id: 2, ...chatDto, isActive: true, environment: 'prod' };
            mockChatRepository.create.mockResolvedValue(createdChat);

            const result = await service.create(chatDto as any);

            expect(result).toEqual(createdChat);
            expect(mockChatRepository.create).toHaveBeenCalledWith({
                chatId: '654321',
                isActive: true,
                environment: 'prod',
            });
        });
    });

    describe('findAll', () => {
        it('should find all chats without filters', async () => {
            const chats = [
                { id: 1, chatId: '123456', title: 'Chat 1' },
                { id: 2, chatId: '789012', title: 'Chat 2' },
            ];
            mockChatRepository.findAll.mockResolvedValue(chats);

            const result = await service.findAll();

            expect(result).toEqual(chats);
            expect(mockChatRepository.findAll).toHaveBeenCalledWith({ where: {} });
        });

        it('should filter by active and environment when provided', async () => {
            const chats = [{ id: 1, chatId: 'dev', isActive: true, environment: 'dev' }];
            mockChatRepository.findAll.mockResolvedValue(chats);

            const result = await service.findAll({ onlyActive: true, environment: 'dev' });

            expect(result).toEqual(chats);
            expect(mockChatRepository.findAll).toHaveBeenCalledWith({
                where: { isActive: true, environment: 'dev' },
            });
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
        it('should update existing chat meta but keep environment when switching to prod', async () => {
            const chat = {
                id: 1,
                chatId: '123456',
                title: 'Existing Chat',
                type: 'group',
                isActive: false,
                environment: 'dev',
                save: jest.fn().mockResolvedValue(true),
            };
            mockChatRepository.findOrCreate.mockResolvedValue([chat, false]);

            const result = await service.findOrCreate('123456', 'Updated Chat', 'supergroup', 'prod', true);

            expect(result).toEqual([chat, false]);
            expect(mockChatRepository.findOrCreate).toHaveBeenCalledWith({
                where: { chatId: '123456' },
                defaults: {
                    chatId: '123456',
                    title: 'Updated Chat',
                    type: 'supergroup',
                    environment: 'prod',
                    isActive: true,
                },
            });
            expect(chat.title).toBe('Updated Chat');
            expect(chat.type).toBe('supergroup');
            expect(chat.environment).toBe('dev'); // stays dev even when prod bot touches it
            expect(chat.isActive).toBe(true);
            expect(chat.save).toHaveBeenCalled();
        });

        it('should update environment to dev when requested', async () => {
            const chat = {
                id: 2,
                chatId: '654321',
                title: 'Another Chat',
                type: 'group',
                isActive: true,
                environment: 'prod',
                save: jest.fn().mockResolvedValue(true),
            };
            mockChatRepository.findOrCreate.mockResolvedValue([chat, false]);

            const result = await service.findOrCreate('654321', 'Another Chat', 'group', 'dev', true);

            expect(result).toEqual([chat, false]);
            expect(chat.environment).toBe('dev');
            expect(chat.save).toHaveBeenCalled();
        });

        it('should create new chat if not exists', async () => {
            const chat = { id: 1, chatId: '123456', title: 'New Chat', environment: 'prod', isActive: true };
            mockChatRepository.findOrCreate.mockResolvedValue([chat, true]);

            const result = await service.findOrCreate('123456', 'New Chat', 'group', 'prod', true);

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

    describe('markActivity', () => {
        it('should mark chat active state and return updated chat', async () => {
            const chat = {
                id: 1,
                chatId: '123456',
                isActive: false,
                save: jest.fn().mockResolvedValue(true),
            };
            mockChatRepository.findOne.mockResolvedValue(chat);

            const result = await service.markActivity('123456', true);

            expect(result).toEqual({ ...chat, isActive: true });
            expect(chat.save).toHaveBeenCalled();
        });

        it('should return null when chat not found', async () => {
            mockChatRepository.findOne.mockResolvedValue(null);

            const result = await service.markActivity('unknown', false);

            expect(result).toBeNull();
        });
    });
});

