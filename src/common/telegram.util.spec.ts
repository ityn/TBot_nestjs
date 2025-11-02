import { hasRole, containsInviteLink, isGroupChat } from './telegram.util';
import { UserRole } from '../database/models/users/user.entity';
import { Context } from 'telegraf';

describe('TelegramUtils', () => {
    describe('hasRole', () => {
        it('should return true for employee with employee role', () => {
            const user = { role: UserRole.EMPLOYEE } as any;
            expect(hasRole(user, UserRole.EMPLOYEE)).toBe(true);
        });

        it('should return true for manager with employee role', () => {
            const user = { role: UserRole.MANAGER } as any;
            expect(hasRole(user, UserRole.EMPLOYEE)).toBe(true);
        });

        it('should return true for director with any role', () => {
            const user = { role: UserRole.DIRECTOR } as any;
            expect(hasRole(user, UserRole.EMPLOYEE)).toBe(true);
            expect(hasRole(user, UserRole.MANAGER)).toBe(true);
            expect(hasRole(user, UserRole.DIRECTOR)).toBe(true);
        });

        it('should return false for employee with manager role required', () => {
            const user = { role: UserRole.EMPLOYEE } as any;
            expect(hasRole(user, UserRole.MANAGER)).toBe(false);
        });

        it('should return false for null user', () => {
            expect(hasRole(null, UserRole.EMPLOYEE)).toBe(false);
        });
    });

    describe('containsInviteLink', () => {
        it('should detect t.me links', () => {
            expect(containsInviteLink('Check out t.me/test')).toBe(true);
        });

        it('should detect telegram.me links', () => {
            expect(containsInviteLink('Join telegram.me/test')).toBe(true);
        });

        it('should detect http://t.me links', () => {
            expect(containsInviteLink('Visit http://t.me/test')).toBe(true);
        });

        it('should detect https://t.me links', () => {
            expect(containsInviteLink('Visit https://t.me/test')).toBe(true);
        });

        it('should not detect regular text', () => {
            expect(containsInviteLink('This is just regular text')).toBe(false);
        });

        it('should return false for empty string', () => {
            expect(containsInviteLink('')).toBe(false);
        });

        it('should return false for undefined', () => {
            expect(containsInviteLink(undefined)).toBe(false);
        });
    });

    describe('isGroupChat', () => {
        it('should return true for group chat', () => {
            const ctx = {
                chat: { type: 'group', id: 1 }
            } as Context;
            expect(isGroupChat(ctx)).toBe(true);
        });

        it('should return true for supergroup chat', () => {
            const ctx = {
                chat: { type: 'supergroup', id: 1 }
            } as Context;
            expect(isGroupChat(ctx)).toBe(true);
        });

        it('should return false for private chat', () => {
            const ctx = {
                chat: { type: 'private', id: 1 }
            } as Context;
            expect(isGroupChat(ctx)).toBe(false);
        });

        it('should return false for undefined chat', () => {
            const ctx = {} as Context;
            expect(isGroupChat(ctx)).toBe(false);
        });
    });
});

