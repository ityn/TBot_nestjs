import { Chat } from './chat.entity';

export const chatsProviders = [
    {
        provide: 'CHATS_REPOSITORY',
        useValue: Chat,
    },
];

