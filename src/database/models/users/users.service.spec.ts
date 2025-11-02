import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { UserRole } from './user.entity';

describe('UsersService', () => {
    let service: UsersService;

    const mockUserRepository = {
        create: jest.fn(),
        findAll: jest.fn(),
        findOne: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                UsersService,
                {
                    provide: 'USERS_REPOSITORY',
                    useValue: mockUserRepository,
                },
            ],
        }).compile();

        service = module.get<UsersService>(UsersService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('create', () => {
        it('should create a user', async () => {
            const userDto = {
                login: 'testuser',
                telegramId: '123456',
                firstName: 'Test',
                isBot: false,
            };

            const createdUser = { id: 1, ...userDto, role: UserRole.EMPLOYEE };
            mockUserRepository.create.mockResolvedValue(createdUser);

            const result = await service.create(userDto);

            expect(result).toEqual(createdUser);
            expect(mockUserRepository.create).toHaveBeenCalledWith(userDto);
        });
    });

    describe('findOneByLogin', () => {
        it('should find user by login', async () => {
            const user = { id: 1, login: 'testuser' };
            mockUserRepository.findOne.mockResolvedValue(user);

            const result = await service.findOneByLogin('testuser');

            expect(result).toEqual(user);
            expect(mockUserRepository.findOne).toHaveBeenCalledWith({ where: { login: 'testuser' } });
        });
    });

    describe('findOneByTelegramId', () => {
        it('should find user by telegram ID', async () => {
            const user = { id: 1, telegramId: '123456' };
            mockUserRepository.findOne.mockResolvedValue(user);

            const result = await service.findOneByTelegramId('123456');

            expect(result).toEqual(user);
            expect(mockUserRepository.findOne).toHaveBeenCalledWith({ where: { telegramId: '123456' } });
        });
    });

    describe('updateRole', () => {
        it('should update user role', async () => {
            const updatedRows = 1;
            const updatedUsers = [{ id: 1, telegramId: '123456', role: UserRole.MANAGER }];
            mockUserRepository.update.mockResolvedValue([updatedRows, updatedUsers]);

            const result = await service.updateRole('123456', UserRole.MANAGER);

            expect(result).toEqual([updatedRows, updatedUsers]);
            expect(mockUserRepository.update).toHaveBeenCalledWith(
                { role: UserRole.MANAGER },
                { where: { telegramId: '123456' }, returning: true }
            );
        });
    });

    describe('findAllByRole', () => {
        it('should find all users by role excluding bots', async () => {
            const users = [
                { id: 1, login: 'user1', role: UserRole.EMPLOYEE, isBot: false },
                { id: 2, login: 'user2', role: UserRole.EMPLOYEE, isBot: false },
            ];
            mockUserRepository.findAll.mockResolvedValue(users);

            const result = await service.findAllByRole(UserRole.EMPLOYEE);

            expect(result).toEqual(users);
            expect(mockUserRepository.findAll).toHaveBeenCalledWith({ where: { role: UserRole.EMPLOYEE, isBot: false } });
        });
    });

    describe('countByRole', () => {
        it('should count users by role excluding bots', async () => {
            const count = 5;
            mockUserRepository.count.mockResolvedValue(count);

            const result = await service.countByRole(UserRole.EMPLOYEE);

            expect(result).toBe(count);
            expect(mockUserRepository.count).toHaveBeenCalledWith({ where: { role: UserRole.EMPLOYEE, isBot: false } });
        });
    });
});

