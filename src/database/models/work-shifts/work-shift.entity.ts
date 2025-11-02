import {Column, DataType, Model, Table, ForeignKey, BelongsTo} from 'sequelize-typescript';
import {User} from '../users/user.entity';

interface WorkShiftCreationAttrs {
    telegramId: string;
    login: string;
    chatId?: string;
    shiftDate: Date;
    baseRate?: number;
    shift?: number;
    itemsIssued?: number;
    comment?: string;
    isOpened?: boolean;
    openedAt?: Date | null;
}

@Table({tableName: 'work_shifts'})
export class WorkShift extends Model<WorkShift, WorkShiftCreationAttrs> {
    @Column({type: DataType.INTEGER, unique: true, autoIncrement: true, primaryKey: true})
    id: number;

    @Column({type: DataType.BIGINT, allowNull: false})
    telegramId: string;

    @Column({type: DataType.STRING, allowNull: false})
    login: string;

    @Column({type: DataType.BIGINT, allowNull: true})
    chatId: string;

    @Column({type: DataType.DATE, allowNull: false})
    shiftDate: Date;

    @Column({type: DataType.DECIMAL(10, 2), allowNull: true})
    baseRate: number;

    @Column({type: DataType.DECIMAL(10, 1), allowNull: true})
    shift: number;

    @Column({type: DataType.INTEGER, allowNull: true, defaultValue: 0})
    itemsIssued: number;

    @Column({type: DataType.TEXT, allowNull: true})
    comment: string;

    @Column({type: DataType.BOOLEAN, allowNull: false, defaultValue: false})
    isOpened: boolean;

    @Column({type: DataType.DATE, allowNull: true})
    openedAt: Date | null;
}

