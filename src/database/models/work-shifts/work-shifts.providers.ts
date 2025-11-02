import {WorkShift} from "./work-shift.entity";

export const workShiftsProviders = [
    {
        provide: 'WORK_SHIFTS_REPOSITORY',
        useValue: WorkShift,
    }
];

