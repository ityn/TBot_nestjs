import { Inject, Injectable, Logger } from '@nestjs/common';
import { ShiftPollEntity, ShiftPollSource } from '../database/models/shift-polls/shift-poll.entity';

export interface ShiftPoll {
  going: string[];
  notGoing: string[];
  messageId: number;
  closed: boolean;
  timeout?: NodeJS.Timeout;
  createdAt?: Date;
  chatId: number;
  expiresAt?: Date | null;
  source?: ShiftPollSource;
  extensionCount?: number;
  startedAt?: Date;
}

interface SyncPoll {
  going: string[];
  messageId: number;
  closed: boolean;
  timeout?: NodeJS.Timeout;
  chatId: number;
}

@Injectable()
export class PollsService {
  private readonly logger = new Logger(PollsService.name);
  private readonly shiftPolls = new Map<string, ShiftPoll>();
  private readonly syncPolls = new Map<string, SyncPoll>();
  private shiftPollTableReady = false;
  private ensureShiftPollTablePromise: Promise<void> | null = null;

  constructor(
    @Inject('SHIFT_POLLS_REPOSITORY')
    private readonly shiftPollRepository: typeof ShiftPollEntity,
  ) {}

  private async ensureShiftPollTable(): Promise<boolean> {
    if (this.shiftPollTableReady) {
      return true;
    }

    if (this.ensureShiftPollTablePromise) {
      try {
        await this.ensureShiftPollTablePromise;
        return this.shiftPollTableReady;
      } catch {
        return false;
      }
    }

    this.ensureShiftPollTablePromise = (async () => {
      try {
        await this.shiftPollRepository.sync();

        const sequelize = this.shiftPollRepository.sequelize;
        if (sequelize) {
          const qi = sequelize.getQueryInterface();
          try {
            await qi.addConstraint('shift_polls', {
              fields: ['chatId', 'messageId'],
              type: 'unique',
              name: 'shift_polls_chat_message_unique',
            });
            this.logger.log('Unique constraint shift_polls_chat_message_unique ensured');
          } catch (constraintError: any) {
            const message = constraintError?.message ?? '';
            if (message.includes('already exists')) {
              this.logger.debug('Unique constraint shift_polls_chat_message_unique already exists');
            } else {
              this.logger.warn(`Could not ensure unique constraint for shift_polls: ${String(constraintError)}`);
            }
          }
        } else {
          this.logger.warn('Sequelize instance not available for ShiftPollEntity; cannot ensure unique constraint');
        }

        this.shiftPollTableReady = true;
        this.logger.log('Shift poll table is ready (sync successful)');
      } catch (e) {
        this.logger.error(`Failed to ensure shift poll table: ${String(e)}`);
        throw e;
      } finally {
        this.ensureShiftPollTablePromise = null;
      }
    })();

    try {
      await this.ensureShiftPollTablePromise;
      return this.shiftPollTableReady;
    } catch {
      return false;
    }
  }

  // Shift polls (regular)
  async setShiftPoll(
    key: string,
    poll: ShiftPoll,
    options: { source: ShiftPollSource; expiresAt?: Date | null; extensionCount?: number } = {
      source: 'manual',
    },
  ): Promise<void> {
    poll.source = options.source;
    poll.expiresAt = options.expiresAt ?? poll.expiresAt ?? null;
    poll.extensionCount = options.extensionCount ?? poll.extensionCount ?? 0;
    poll.startedAt = poll.startedAt ?? poll.createdAt ?? new Date();

    this.shiftPolls.set(key, poll);

    const tableReady = await this.ensureShiftPollTable();
    if (!tableReady) {
      this.logger.warn('Shift poll table unavailable; poll state is kept only in memory');
      return;
    }

    try {
      const chatId = String(poll.chatId);
      const existing = await this.shiftPollRepository.findOne({
        where: { chatId, messageId: poll.messageId },
      });

      const payload = {
        chatId,
        messageId: poll.messageId,
        going: poll.going,
        notGoing: poll.notGoing,
        expiresAt: poll.expiresAt ?? null,
        closed: poll.closed,
        source: poll.source,
        extensionCount: poll.extensionCount ?? 0,
        startedAt: poll.startedAt,
      };

      if (existing) {
        await existing.update(payload);
      } else {
        await this.shiftPollRepository.create(payload);
      }
    } catch (e) {
      this.logger.error(`Failed to persist shift poll (key=${key}): ${String(e)}`);
    }
  }

  getShiftPoll(key: string): ShiftPoll | undefined {
    return this.shiftPolls.get(key);
  }

  async restoreShiftPoll(key: string): Promise<ShiftPoll | undefined> {
    const tableReady = await this.ensureShiftPollTable();
    if (!tableReady) {
      this.logger.warn(`Cannot restore shift poll (table not ready) for key=${key}`);
      return undefined;
    }

    try {
      const [chatId] = key.split(':');
      const record = await this.shiftPollRepository.findOne({
        where: { chatId, closed: false },
        order: [['startedAt', 'DESC']],
      });

      if (!record) {
        return undefined;
      }

      const poll: ShiftPoll = {
        going: Array.isArray(record.going) ? [...record.going] : [],
        notGoing: Array.isArray(record.notGoing) ? [...record.notGoing] : [],
        messageId: record.messageId,
        closed: record.closed,
        timeout: undefined,
        createdAt: record.startedAt ?? record.createdAt,
        chatId: Number(record.chatId),
        expiresAt: record.expiresAt ? new Date(record.expiresAt) : null,
        source: record.source,
        extensionCount: record.extensionCount ?? 0,
        startedAt: record.startedAt ?? record.createdAt,
      };

      this.shiftPolls.set(key, poll);
      return poll;
    } catch (e) {
      this.logger.error(`Failed to restore shift poll for key=${key}: ${String(e)}`);
      return undefined;
    }
  }

  async saveShiftPollState(key: string, overrides: Partial<ShiftPoll> = {}): Promise<void> {
    const poll = this.shiftPolls.get(key);
    if (!poll) {
      this.logger.warn(`Attempted to save shift poll state but no poll found for key=${key}`);
      return;
    }

    Object.assign(poll, overrides);

    const tableReady = await this.ensureShiftPollTable();
    if (!tableReady) {
      this.logger.warn(`Shift poll table unavailable; state persisted in memory only (key=${key})`);
      return;
    }

    try {
      const chatId = String(poll.chatId);
      const payload = {
        chatId,
        messageId: poll.messageId,
        going: poll.going,
        notGoing: poll.notGoing,
        expiresAt: poll.expiresAt ?? null,
        closed: poll.closed,
        source: poll.source ?? 'manual',
        extensionCount: poll.extensionCount ?? 0,
        startedAt: poll.startedAt ?? poll.createdAt ?? new Date(),
      };

      const existing = await this.shiftPollRepository.findOne({
        where: { chatId, messageId: poll.messageId },
      });

      if (existing) {
        await existing.update(payload);
      } else {
        await this.shiftPollRepository.create(payload);
      }
    } catch (e) {
      this.logger.error(`Failed to persist shift poll state for key=${key}: ${String(e)}`);
    }
  }

  async deleteShiftPoll(key: string): Promise<void> {
    const poll = this.shiftPolls.get(key);
    if (poll?.timeout) {
      clearTimeout(poll.timeout);
    }
    this.shiftPolls.delete(key);

    const tableReady = await this.ensureShiftPollTable();
    if (!tableReady) {
      this.logger.warn(`Shift poll table unavailable; deleted in-memory state only (key=${key})`);
      return;
    }

    try {
      const [chatId] = key.split(':');
      const where: any = { chatId };
      if (poll?.messageId) {
        where.messageId = poll.messageId;
      }
      await this.shiftPollRepository.destroy({ where });
    } catch (e) {
      this.logger.error(`Failed to remove shift poll from store for key=${key}: ${String(e)}`);
    }
  }

  clearShiftPollTimeout(key: string): void {
    const poll = this.shiftPolls.get(key);
    if (poll?.timeout) {
      clearTimeout(poll.timeout);
    }
  }

  async updateShiftPollExpiration(key: string, expiresAt: Date | null, extensionCount = 0): Promise<void> {
    const poll = this.shiftPolls.get(key);
    if (poll) {
      poll.expiresAt = expiresAt;
      poll.extensionCount = extensionCount;
    }

    const tableReady = await this.ensureShiftPollTable();
    if (!tableReady) {
      this.logger.warn(`Shift poll table unavailable; expiration update skipped (key=${key})`);
      return;
    }

    try {
      const [chatId] = key.split(':');
      const where: any = { chatId, closed: false };
      if (poll?.messageId) {
        where.messageId = poll.messageId;
      }
      await this.shiftPollRepository.update(
        { expiresAt, extensionCount },
        { where },
      );
    } catch (e) {
      this.logger.error(`Failed to update shift poll expiration for key=${key}: ${String(e)}`);
    }
  }

  async markShiftPollClosed(key: string): Promise<void> {
    const poll = this.shiftPolls.get(key);
    if (poll) {
      poll.closed = true;
      if (poll.timeout) {
        clearTimeout(poll.timeout);
        poll.timeout = undefined;
      }
    }

    const tableReady = await this.ensureShiftPollTable();
    if (!tableReady) {
      this.logger.warn(`Shift poll table unavailable; markClosed persisted in memory only (key=${key})`);
      return;
    }

    try {
      const [chatId] = key.split(':');
      const where: any = { chatId };
      if (poll?.messageId) {
        where.messageId = poll.messageId;
      }
      await this.shiftPollRepository.update({ closed: true, expiresAt: null }, { where });
    } catch (e) {
      this.logger.error(`Failed to mark shift poll closed for key=${key}: ${String(e)}`);
    }
  }

  async getActiveShiftPollsBySource(source: ShiftPollSource): Promise<ShiftPollEntity[]> {
    const tableReady = await this.ensureShiftPollTable();
    if (!tableReady) {
      this.logger.warn(`Shift poll table unavailable; returning in-memory active polls for source=${source}`);
      return [];
    }

    return this.shiftPollRepository.findAll({
      where: { source, closed: false },
      order: [['startedAt', 'ASC']],
    });
  }

  // Sync polls
  setSyncPoll(key: string, poll: SyncPoll): void {
    this.syncPolls.set(key, poll);
  }

  getSyncPoll(key: string): SyncPoll | undefined {
    return this.syncPolls.get(key);
  }

  deleteSyncPoll(key: string): void {
    this.syncPolls.delete(key);
  }

  clearSyncPollTimeout(key: string): void {
    const poll = this.syncPolls.get(key);
    if (poll?.timeout) {
      clearTimeout(poll.timeout);
    }
  }

  // Cleanup for bot removal
  cleanupForChat(chatId: number): void {
    try {
      // Clear shift poll
      const shiftKey = `${chatId}:shift_poll`;
      const shiftPoll = this.shiftPolls.get(shiftKey);
      if (shiftPoll?.timeout) {
        clearTimeout(shiftPoll.timeout);
      }
      this.shiftPolls.delete(shiftKey);

      // Clear sync poll
      const syncKey = `${chatId}:sync_poll`;
      const syncPoll = this.syncPolls.get(syncKey);
      if (syncPoll?.timeout) {
        clearTimeout(syncPoll.timeout);
      }
      this.syncPolls.delete(syncKey);

      this.logger.log(`Cleaned up polls for chatId=${chatId}`);
    } catch (e) {
      this.logger.error(`Failed to cleanup polls for chatId: ${String(e)}`);
    }
  }
}

