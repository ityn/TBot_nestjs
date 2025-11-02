import { Injectable, Logger } from '@nestjs/common';

interface ShiftPoll {
  going: string[];
  notGoing: string[];
  messageId: number;
  closed: boolean;
  timeout?: NodeJS.Timeout;
  createdAt?: Date;
  chatId: number;
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

  // Shift polls (regular)
  setShiftPoll(key: string, poll: ShiftPoll): void {
    this.shiftPolls.set(key, poll);
  }

  getShiftPoll(key: string): ShiftPoll | undefined {
    return this.shiftPolls.get(key);
  }

  deleteShiftPoll(key: string): void {
    this.shiftPolls.delete(key);
  }

  clearShiftPollTimeout(key: string): void {
    const poll = this.shiftPolls.get(key);
    if (poll?.timeout) {
      clearTimeout(poll.timeout);
    }
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

