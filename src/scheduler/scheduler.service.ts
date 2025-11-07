import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import * as cron from 'node-cron';
import { ScheduledTask } from 'node-cron';
import { WorkShiftsService } from '../database/models/work-shifts/work-shifts.service';
import { ChatsService } from '../database/models/chats/chats.service';
import { PollsService, ShiftPoll } from '../polls/polls.service';
import { UsersService } from '../database/models/users/users.service';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);
  private reminderOpenTask?: ScheduledTask;
  private reminderCloseTask?: ScheduledTask;
  private shiftPollTask?: ScheduledTask;

  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly configService: ConfigService,
    private readonly workShiftsService: WorkShiftsService,
    private readonly chatsService: ChatsService,
    private readonly pollsService: PollsService,
    private readonly usersService: UsersService,
  ) {
    this.logger.log('SchedulerService constructor called');
    if (!this.bot) {
      this.logger.error('CRITICAL: Bot is not available in constructor! @InjectBot() failed.');
    } else {
      this.logger.log('Bot successfully injected in constructor');
    }
  }

  async onModuleInit() {
    try {
      this.logger.log('SchedulerService onModuleInit called');
      const timezone = this.configService.get<string>('TIMEZONE') || 'Asia/Novosibirsk';
      this.logger.log(`Using timezone: ${timezone}`);
      
      // Log current time in timezone
      const now = new Date();
      this.logger.log(`Current UTC time: ${now.toISOString()}`);
      try {
        const tzTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
        this.logger.log(`Current time in ${timezone}: ${tzTime.toLocaleString('ru-RU')}`);
      } catch (e) {
        this.logger.warn(`Failed to get time in timezone ${timezone}: ${String(e)}`);
      }
      
      if (!this.bot) {
        this.logger.error('Bot is not available in onModuleInit! Cannot schedule tasks.');
        return;
      }
      
      // TEST: Schedule a test task every minute to verify cron works
      // DISABLED: Test task removed - uncomment for debugging if needed
      /*
      const testTask = cron.schedule('* * * * *', async () => {
        try {
          const testTime = new Date();
          this.logger.log(`[CRON TEST] Test task triggered at ${testTime.toISOString()}`);
          // Test sendAutoPoll every minute for debugging (remove in production)
          this.logger.log(`[CRON TEST] Calling sendAutoPoll() for testing...`);
          await this.sendAutoPoll();
        } catch (error) {
          this.logger.error(`[CRON TEST] Error in test task: ${String(error)}`, error instanceof Error ? error.stack : '');
        }
      }, {
        timezone
      });
      if (testTask) {
        this.logger.log('Test cron task (every minute) scheduled successfully for debugging');
        this.logger.warn('WARNING: Test task calls sendAutoPoll() every minute - disable in production!');
      }
      */
      
      // Daily reminder at 08:50 to open shift
      this.reminderOpenTask = cron.schedule('50 8 * * *', async () => {
        try {
          const triggerTime = new Date();
          this.logger.log(`[CRON] Open shift reminder trigger at 08:50 (${timezone}) - Current time: ${triggerTime.toISOString()}`);
          await this.remindOpenShift(timezone);
        } catch (error) {
          this.logger.error(`Error in open shift reminder cron task: ${String(error)}`, error instanceof Error ? error.stack : '');
        }
      }, { 
        timezone
      });
      
      if (this.reminderOpenTask) {
        this.reminderOpenTask.start();
        this.logger.log('Open shift reminder cron task scheduled successfully');
      } else {
        this.logger.error('Failed to schedule open shift reminder cron task!');
      }

      // Daily poll at 20:00 - "Who is on shift tomorrow?"
      this.shiftPollTask = cron.schedule('0 20 * * *', async () => {
        try {
          const triggerTime = new Date();
          this.logger.log(`[CRON] Shift poll trigger at 20:00 (${timezone}) - Current time: ${triggerTime.toISOString()}`);
          await this.sendAutoPoll();
        } catch (error) {
          this.logger.error(`Error in shift poll cron task: ${String(error)}`, error instanceof Error ? error.stack : '');
        }
      }, { 
        timezone
      });
      
      if (this.shiftPollTask) {
        this.shiftPollTask.start();
        this.logger.log('Shift poll cron task scheduled successfully');
      } else {
        this.logger.error('Failed to schedule shift poll cron task!');
      }

      // Daily reminder at 20:55 to close shift
      this.reminderCloseTask = cron.schedule('55 20 * * *', async () => {
        try {
          const triggerTime = new Date();
          this.logger.log(`[CRON] Close shift reminder trigger at 20:55 (${timezone}) - Current time: ${triggerTime.toISOString()}`);
          await this.remindCloseShift(timezone);
        } catch (error) {
          this.logger.error(`Error in close shift reminder cron task: ${String(error)}`, error instanceof Error ? error.stack : '');
        }
      }, { 
        timezone
      });
      
      if (this.reminderCloseTask) {
        this.reminderCloseTask.start();
        this.logger.log('Close shift reminder cron task scheduled successfully');
      } else {
        this.logger.error('Failed to schedule close shift reminder cron task!');
      }

      this.logger.log(`Scheduler initialized successfully. Open shift reminder at 08:50 (${timezone}), shift poll at 20:00 (${timezone}), close shift reminder at 20:55 (${timezone})`);

      await this.restoreScheduledPolls();
    } catch (error) {
      this.logger.error(`Failed to initialize scheduler: ${String(error)}`, error instanceof Error ? error.stack : '');
    }
  }

  async sendAutoPoll() {
    try {
      this.logger.log('sendAutoPoll() called - starting poll sending process');
      // Get all active chats
      const chats = await this.chatsService.findAll();
      this.logger.log(`Found ${chats.length} active chats in database`);
      
      if (chats.length === 0) {
        this.logger.warn('No active chats found in database. Skipping scheduled poll.');
        this.logger.warn('NOTE: Chats are registered when bot is added to a group via onBotAddedToChat handler.');
        return;
      }

      // Log all chat IDs for debugging
      chats.forEach((chat, index) => {
        this.logger.log(`Chat ${index + 1}: chatId='${chat.chatId}' (type: ${typeof chat.chatId}), title='${chat.title || 'N/A'}', type='${chat.type || 'N/A'}'`);
      });

      // Send poll to all chats
      for (const chat of chats) {
        const chatId = Number(chat.chatId);
        const pollKey = `${chatId}:shift_poll`;
        
        this.logger.log(`Attempting to send poll to chatId=${chatId} (original: '${chat.chatId}')`);
        
        try {
          // Verify bot is available
          if (!this.bot || !this.bot.telegram) {
            this.logger.error(`Bot or bot.telegram is not available for chatId=${chatId}`);
            continue;
          }
          
          // Verify bot can access the chat
          try {
            this.logger.log(`Checking bot access to chatId=${chatId}...`);
            await this.bot.telegram.getChat(chatId);
            this.logger.log(`Bot has access to chatId=${chatId}`);
          } catch (accessError) {
            this.logger.warn(`Bot cannot access chatId=${chatId}: ${String(accessError)}. Skipping this chat.`);
            continue;
          }
          
          this.logger.log(`Calling bot.telegram.sendMessage for chatId=${chatId}...`);
          const message = await this.bot.telegram.sendMessage(
            chatId,
            '📋 Опрос: Кто завтра выходит на смену?\n⏱ Время на ответ: 30 минут\n\n✅ Выхожу: 0\n❌ Не выхожу: 0',
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '✅ Выхожу', callback_data: `poll_yes:${chatId}` },
                    { text: '❌ Не выхожу', callback_data: `poll_no:${chatId}` },
                  ],
                  [{ text: '📊 Результаты (Менеджеры)', callback_data: `poll_results:${chatId}` }],
                ],
              },
            } as any,
          );

          // Create poll record and set timeout
          const poll = { 
            going: [], 
            notGoing: [], 
            messageId: (message as any).message_id,
            closed: false,
            timeout: undefined as NodeJS.Timeout | undefined,
            createdAt: new Date(),
            chatId,
            source: 'scheduler' as const,
            extensionCount: 0,
            expiresAt: null,
          };

          const initialTimeoutMs = 30 * 60 * 1000;
          const initialExpiresAt = new Date(Date.now() + initialTimeoutMs);
          poll.expiresAt = initialExpiresAt;

          await this.pollsService.setShiftPoll(pollKey, poll, {
            source: 'scheduler',
            expiresAt: initialExpiresAt,
            extensionCount: 0,
          });

          this.scheduleAutoPollTimeout(pollKey, poll, initialTimeoutMs);

          this.logger.log(`✅ Scheduled poll sent successfully to chatId=${chatId}, messageId=${(message as any).message_id}`);
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : String(e);
          const errorStack = e instanceof Error ? e.stack : '';
          this.logger.error(`❌ Failed to send scheduled poll to chatId=${chatId}: ${errorMessage}`);
          if (errorStack) {
            this.logger.error(`Error stack: ${errorStack}`);
          }
          // Log specific error types
          if (e && typeof e === 'object' && 'response' in e) {
            this.logger.error(`Telegram API response: ${JSON.stringify((e as any).response)}`);
          }
          if (e && typeof e === 'object' && 'code' in e) {
            this.logger.error(`Error code: ${(e as any).code}`);
          }
        }
      }
    } catch (e) {
      this.logger.error(`Failed to get chats for scheduled poll: ${String(e)}`);
    }
  }

  private scheduleAutoPollTimeout(pollKey: string, poll: ShiftPoll, durationMs: number) {
    if (poll.timeout) {
      clearTimeout(poll.timeout);
    }

    const expiresAt = new Date(Date.now() + durationMs);
    poll.expiresAt = expiresAt;

    void this.pollsService.updateShiftPollExpiration(pollKey, expiresAt, poll.extensionCount ?? 0);

    poll.timeout = setTimeout(async () => {
      await this.handleAutoPollTimeout(pollKey, poll);
    }, durationMs);
  }

  private async handleAutoPollTimeout(pollKey: string, poll: ShiftPoll) {
    const chatId = poll.chatId;

    try {
      const goingCount = poll.going?.length ?? 0;
      const notGoingCount = poll.notGoing?.length ?? 0;

      if (goingCount === 0) {
        const extensionCount = poll.extensionCount ?? 0;

        if (extensionCount === 0) {
          await this.bot.telegram.sendMessage(
            chatId,
            '⏳ Никто не выбрал выход на смену. Опрос продлён на 15 минут. Пожалуйста, хотя бы один сотрудник должен выйти.',
          );

          poll.extensionCount = 1;
          await this.pollsService.saveShiftPollState(pollKey, { extensionCount: poll.extensionCount });

          this.scheduleAutoPollTimeout(pollKey, poll, 15 * 60 * 1000);
          return;
        }

        await this.bot.telegram.sendMessage(
          chatId,
          '❗ По-прежнему никто не выходит. Менеджеры, пожалуйста, уточните график. Опрос остаётся открытым.',
        );

        poll.timeout = undefined;
        poll.expiresAt = null;
        await this.pollsService.updateShiftPollExpiration(pollKey, null, poll.extensionCount ?? 1);
        await this.pollsService.saveShiftPollState(pollKey, {});
        return;
      }

      const goingList = goingCount > 0 ? poll.going.map((u) => `@${u}`).join(', ') : 'никто';
      const notGoingList = notGoingCount > 0 ? poll.notGoing.map((u) => `@${u}`).join(', ') : 'никто';

      await this.bot.telegram.editMessageText(
        chatId,
        poll.messageId,
        undefined,
        `📋 Опрос завершён (30 минут истекло)\n\n✅ Выходят (${goingCount}): ${goingList}\n❌ Не выходят (${notGoingCount}): ${notGoingList}`,
        { reply_markup: { inline_keyboard: [] } } as any,
      );

      poll.closed = true;
      poll.timeout = undefined;
      poll.expiresAt = null;

      await this.pollsService.markShiftPollClosed(pollKey);
      await this.pollsService.saveShiftPollState(pollKey, {});

      this.logger.log(`Poll auto-closed for chatId=${chatId}`);
      await this.createWorkShiftRecords(poll);
    } catch (error) {
      this.logger.warn(`Failed to handle auto poll timeout for chatId=${chatId}: ${String(error)}`);
    }
  }

  private async restoreScheduledPolls() {
    try {
      const activePolls = await this.pollsService.getActiveShiftPollsBySource('scheduler');

      if (activePolls.length === 0) {
        this.logger.log('No active scheduled shift polls to restore.');
        return;
      }

      this.logger.log(`Restoring ${activePolls.length} scheduled shift polls after restart.`);

      for (const state of activePolls) {
        const pollKey = `${state.chatId}:shift_poll`;
        let poll = this.pollsService.getShiftPoll(pollKey);
        if (!poll) {
          poll = await this.pollsService.restoreShiftPoll(pollKey);
        }

        if (!poll) {
          this.logger.warn(`Failed to restore in-memory state for poll key=${pollKey}`);
          continue;
        }

        const expiresAt = state.expiresAt ? new Date(state.expiresAt) : null;
        const now = Date.now();
        const remaining = expiresAt ? expiresAt.getTime() - now : 0;

        poll.extensionCount = state.extensionCount ?? poll.extensionCount ?? 0;

        if (!expiresAt) {
          this.logger.log(`Poll for chatId=${state.chatId} has no expiration (likely extended without responses). Skipping timeout recreation.`);
          continue;
        }

        if (remaining <= 0) {
          this.logger.log(`Poll for chatId=${state.chatId} expired during downtime. Handling timeout immediately.`);
          await this.handleAutoPollTimeout(pollKey, poll);
        } else {
          this.logger.log(`Rescheduling poll timeout for chatId=${state.chatId} in ${Math.ceil(remaining / 1000)} seconds.`);
          this.scheduleAutoPollTimeout(pollKey, poll, remaining);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to restore scheduled shift polls: ${String(error)}`);
    }
  }

  private toUtcRangeForLocalDay(localNow: Date): { start: Date, end: Date } {
    const start = new Date(Date.UTC(localNow.getFullYear(), localNow.getMonth(), localNow.getDate(), 0, 0, 0, 0))
    const end = new Date(Date.UTC(localNow.getFullYear(), localNow.getMonth(), localNow.getDate(), 23, 59, 59, 999))
    return { start, end }
  }

  private async createWorkShiftRecords(poll: any) {
    try {
      const goingEmployees = poll.going;
      if (goingEmployees.length === 0) {
        this.logger.log('No employees going to work, skipping work shift records creation');
        return;
      }

      // Calculate shift value based on number of employees (as number)
      const employeeCount = goingEmployees.length;
      const shiftValue = employeeCount === 1 ? 1 : parseFloat((1 / employeeCount).toFixed(1));
      
      // Shift date = poll creation date + 1 day (using UTC to avoid timezone issues)
      const pollDate = poll.createdAt || new Date();
      const shiftDate = new Date(Date.UTC(
        pollDate.getUTCFullYear(),
        pollDate.getUTCMonth(),
        pollDate.getUTCDate() + 1,  // +1 day
        0, 0, 0, 0
      ));
      
      this.logger.log(`Poll created: ${pollDate.toISOString()}, Shift date calculated: ${shiftDate.toISOString()}`);

      const baseRate = 1400;

      for (const username of goingEmployees) {
        try {
          // Find user by login (username)
          const user = await this.usersService.findOneByLogin(username);
          if (!user) {
            this.logger.warn(`User not found in DB for username: ${username}`);
            continue;
          }

          await this.workShiftsService.create({
            telegramId: user.telegramId,
            login: user.login,
            chatId: String(poll.chatId ?? ''),
            shiftDate: shiftDate,
            baseRate,
            shift: shiftValue,
            itemsIssued: 0,
            comment: 'Автоматически создано из опроса смены'
          });

          this.logger.log(`Work shift record created for ${username} (${user.telegramId}), shift: ${shiftValue}`);
        } catch (e) {
          this.logger.warn(`Failed to create work shift for ${username}: ${String(e)}`);
        }
      }

      this.logger.log(`Created ${goingEmployees.length} work shift records for ${shiftDate.toISOString().split('T')[0]}`);
    } catch (e) {
      this.logger.error(`Failed to create work shift records: ${String(e)}`);
    }
  }

  async remindOpenShift(timezone: string) {
    try {
      // Get all active chats
      const chats = await this.chatsService.findAll();
      
      if (chats.length === 0) {
        this.logger.warn('No active chats found. Skipping open shift reminder.');
        return;
      }

      const now = new Date();
      const { start, end } = this.toUtcRangeForLocalDay(now);

      // Send reminder to each chat
      for (const chat of chats) {
        const chatId = Number(chat.chatId);
        
        try {
          const shifts = await this.workShiftsService.findByDateRangeForChat(start, end, chat.chatId);
          if (!shifts || shifts.length === 0) {
            continue; // No shifts for this chat today
          }
          
          const lines: string[] = []
          for (const shift of shifts) {
            if (!shift.isOpened) {
              // Get user to get firstName
              let displayName = shift.login ? `@${shift.login}` : shift.telegramId
              try {
                const user = await this.usersService.findOneByTelegramId(shift.telegramId)
                if (user && user.firstName) {
                  const username = shift.login ? `@${shift.login}` : ''
                  displayName = username ? `${user.firstName} (${username})` : user.firstName
                }
              } catch (e) {
                this.logger.warn(`Failed to get user for telegramId=${shift.telegramId}: ${String(e)}`)
              }
              lines.push(`• ${displayName} — не забудьте открыть смену командой /openshift`)
            }
          }
          
          if (lines.length === 0) {
            continue; // All shifts already opened for this chat
          }
          
          const text = [
            '⏰ Напоминание (08:50): Откройте смену на сегодня!',
            ...lines,
          ].join('\n')
          
          await this.bot.telegram.sendMessage(chatId, text)
          this.logger.log(`Open shift reminder sent to chatId=${chatId}`)
        } catch (e) {
          this.logger.error(`Failed to send open shift reminder to chatId=${chatId}: ${String(e)}`)
        }
      }
    } catch (e) {
      this.logger.error(`Failed to get chats for open shift reminder: ${String(e)}`)
    }
  }

  async remindCloseShift(timezone: string) {
    try {
      // Get all active chats
      const chats = await this.chatsService.findAll();
      
      if (chats.length === 0) {
        this.logger.warn('No active chats found. Skipping close shift reminder.');
        return;
      }

      const now = new Date();
      const { start, end } = this.toUtcRangeForLocalDay(now);

      // Send reminder to each chat
      for (const chat of chats) {
        const chatId = Number(chat.chatId);
        
        try {
          const shifts = await this.workShiftsService.findByDateRangeForChat(start, end, chat.chatId);
          if (!shifts || shifts.length === 0) {
            continue; // No shifts for this chat today
          }
          
          const lines: string[] = []
          for (const shift of shifts) {
            // Only remind if shift is opened but not closed yet
            // Shift is closed if itemsIssued > 0
            if (shift.isOpened && (!shift.itemsIssued || shift.itemsIssued === 0)) {
              // Get user to get firstName
              let displayName = shift.login ? `@${shift.login}` : shift.telegramId
              try {
                const user = await this.usersService.findOneByTelegramId(shift.telegramId)
                if (user && user.firstName) {
                  const username = shift.login ? `@${shift.login}` : ''
                  displayName = username ? `${user.firstName} (${username})` : user.firstName
                }
              } catch (e) {
                this.logger.warn(`Failed to get user for telegramId=${shift.telegramId}: ${String(e)}`)
              }
              lines.push(`• ${displayName} — не забудьте закрыть смену командой /closeshift`)
            }
          }
          
          if (lines.length === 0) {
            continue; // All shifts already closed for this chat
          }
          
          const text = [
            '⏰ Напоминание (20:55): Закройте смену на сегодня!',
            ...lines,
          ].join('\n')
          
          await this.bot.telegram.sendMessage(chatId, text)
          this.logger.log(`Close shift reminder sent to chatId=${chatId}`)
        } catch (e) {
          this.logger.error(`Failed to send close shift reminder to chatId=${chatId}: ${String(e)}`)
        }
      }
    } catch (e) {
      this.logger.error(`Failed to get chats for close shift reminder: ${String(e)}`)
    }
  }
}

