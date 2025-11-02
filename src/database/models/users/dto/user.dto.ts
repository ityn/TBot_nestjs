import { UserRole } from '../user.entity';

export class UserDto {
    readonly login: string;
    readonly firstName?: string | null;
    readonly lastName?: string | null;
    readonly telegramId?: string | null;
    readonly isBot?: boolean;
    readonly languageCode?: string | null;
    readonly role?: UserRole;
}