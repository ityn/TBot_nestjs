export class WorkShiftDto {
    readonly telegramId: string;
    readonly login: string;
    readonly chatId?: string;
    readonly shiftDate: Date;
    readonly baseRate?: number;
    readonly shift?: number;
    readonly itemsIssued?: number;
    readonly comment?: string;
    readonly isOpened?: boolean;
    readonly openedAt?: Date | null;
}

export class CreateWorkShiftDto {
    readonly telegramId: string;
    readonly login: string;
    readonly chatId?: string;
    readonly shiftDate: Date;
    readonly baseRate?: number;
    readonly shift?: number;
    readonly itemsIssued?: number;
    readonly comment?: string;
    readonly isOpened?: boolean;
    readonly openedAt?: Date | null;
}

export class UpdateWorkShiftDto {
    readonly baseRate?: number;
    readonly shift?: number;
    readonly itemsIssued?: number;
    readonly comment?: string;
    readonly isOpened?: boolean;
    readonly openedAt?: Date | null;
}

