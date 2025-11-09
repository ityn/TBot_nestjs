export class ChatDto {
    readonly chatId: string;
    readonly title?: string | null;
    readonly type?: string | null;
    readonly isActive?: boolean;
    readonly environment?: 'prod' | 'dev';
}

