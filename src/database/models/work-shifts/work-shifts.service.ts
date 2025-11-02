import {Inject, Injectable} from "@nestjs/common";
import {WorkShift} from "./work-shift.entity";
import {CreateWorkShiftDto, UpdateWorkShiftDto} from "./dto/work-shift.dto";
import {Op} from 'sequelize';

@Injectable()
export class WorkShiftsService {
    constructor(
        @Inject('WORK_SHIFTS_REPOSITORY')
        private workShiftsRepository: typeof WorkShift
    ) {}

    async create(dto: CreateWorkShiftDto): Promise<WorkShift> {
        return await this.workShiftsRepository.create<WorkShift>(dto)
    }

    async findAll(): Promise<WorkShift[]> {
        return this.workShiftsRepository.findAll<WorkShift>()
    }

    async findByTelegramId(telegramId: string): Promise<WorkShift[]> {
        return await this.workShiftsRepository.findAll<WorkShift>({ 
            where: { telegramId },
            order: [['shiftDate', 'DESC']]
        })
    }

    async findByDate(date: Date): Promise<WorkShift[]> {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        return await this.workShiftsRepository.findAll<WorkShift>({
            where: {
                shiftDate: {
                    [Op.between]: [startOfDay, endOfDay]
                }
            },
            order: [['shiftDate', 'ASC']]
        })
    }

    async findByDateRange(startDate: Date, endDate: Date): Promise<WorkShift[]> {
        return await this.workShiftsRepository.findAll<WorkShift>({
            where: {
                shiftDate: {
                    [Op.between]: [startDate, endDate]
                }
            },
            order: [['shiftDate', 'ASC']]
        })
    }

    async findByDateRangeForChat(startDate: Date, endDate: Date, chatId: string): Promise<WorkShift[]> {
        return await this.workShiftsRepository.findAll<WorkShift>({
            where: {
                shiftDate: {
                    [Op.between]: [startDate, endDate]
                },
                chatId
            },
            order: [['shiftDate', 'ASC']]
        })
    }

    async findOne(id: number): Promise<WorkShift> {
        return await this.workShiftsRepository.findOne<WorkShift>({ where: { id }})
    }

    async update(id: number, dto: UpdateWorkShiftDto): Promise<[number, WorkShift[]]> {
        return await this.workShiftsRepository.update(dto, { 
            where: { id }, 
            returning: true 
        })
    }

    async markOpened(id: number, openedAt: Date = new Date()): Promise<[number, WorkShift[]]> {
        return await this.workShiftsRepository.update({ isOpened: true, openedAt }, {
            where: { id }, returning: true
        })
    }

    async delete(id: number): Promise<number> {
        return await this.workShiftsRepository.destroy({ where: { id }})
    }

    async deleteByChatId(chatId: string): Promise<number> {
        return await this.workShiftsRepository.destroy({ where: { chatId }})
    }
}

