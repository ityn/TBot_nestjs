import { Test, TestingModule } from '@nestjs/testing';
import { WorkShiftsService } from './work-shifts.service';

describe('WorkShiftsService', () => {
    let service: WorkShiftsService;

    const mockWorkShiftRepository = {
        create: jest.fn(),
        findAll: jest.fn(),
        findOne: jest.fn(),
        update: jest.fn(),
        destroy: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                WorkShiftsService,
                {
                    provide: 'WORK_SHIFTS_REPOSITORY',
                    useValue: mockWorkShiftRepository,
                },
            ],
        }).compile();

        service = module.get<WorkShiftsService>(WorkShiftsService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('create', () => {
        it('should create a work shift', async () => {
            const shiftDto = {
                telegramId: '123456',
                login: 'testuser',
                chatId: '789',
                shiftDate: new Date(),
                baseRate: 1400,
                shift: 1,
                itemsIssued: 0,
            };

            const createdShift = { id: 1, ...shiftDto };
            mockWorkShiftRepository.create.mockResolvedValue(createdShift);

            const result = await service.create(shiftDto);

            expect(result).toEqual(createdShift);
            expect(mockWorkShiftRepository.create).toHaveBeenCalledWith(shiftDto);
        });
    });

    describe('findByTelegramId', () => {
        it('should find shifts by telegram ID', async () => {
            const shifts = [
                { id: 1, telegramId: '123456', shiftDate: new Date('2024-01-02') },
                { id: 2, telegramId: '123456', shiftDate: new Date('2024-01-01') },
            ];
            mockWorkShiftRepository.findAll.mockResolvedValue(shifts);

            const result = await service.findByTelegramId('123456');

            expect(result).toEqual(shifts);
            expect(mockWorkShiftRepository.findAll).toHaveBeenCalledWith({
                where: { telegramId: '123456' },
                order: [['shiftDate', 'DESC']],
            });
        });
    });

    describe('findByDateRangeForChat', () => {
        it('should find shifts by date range for specific chat', async () => {
            const startDate = new Date('2024-01-01');
            const endDate = new Date('2024-01-02');
            const shifts = [{ id: 1, telegramId: '123456', chatId: '789' }];
            mockWorkShiftRepository.findAll.mockResolvedValue(shifts);

            const result = await service.findByDateRangeForChat(startDate, endDate, '789');

            expect(result).toEqual(shifts);
            expect(mockWorkShiftRepository.findAll).toHaveBeenCalledWith({
                where: {
                    shiftDate: expect.any(Object),
                    chatId: '789',
                },
                order: [['shiftDate', 'ASC']],
            });
        });
    });

    describe('markOpened', () => {
        it('should mark shift as opened', async () => {
            const openedAt = new Date();
            const updatedRows = 1;
            const updatedShifts = [{ id: 1, isOpened: true, openedAt }];
            mockWorkShiftRepository.update.mockResolvedValue([updatedRows, updatedShifts]);

            const result = await service.markOpened(1, openedAt);

            expect(result).toEqual([updatedRows, updatedShifts]);
            expect(mockWorkShiftRepository.update).toHaveBeenCalledWith(
                { isOpened: true, openedAt },
                { where: { id: 1 }, returning: true }
            );
        });
    });

    describe('deleteByChatId', () => {
        it('should delete shifts by chat ID', async () => {
            const deletedCount = 5;
            mockWorkShiftRepository.destroy.mockResolvedValue(deletedCount);

            const result = await service.deleteByChatId('789');

            expect(result).toBe(deletedCount);
            expect(mockWorkShiftRepository.destroy).toHaveBeenCalledWith({ where: { chatId: '789' } });
        });
    });
});

