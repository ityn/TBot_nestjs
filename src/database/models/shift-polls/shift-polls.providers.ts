import { ShiftPollEntity } from './shift-poll.entity';

export const shiftPollsProviders = [
  {
    provide: 'SHIFT_POLLS_REPOSITORY',
    useValue: ShiftPollEntity,
  },
];


