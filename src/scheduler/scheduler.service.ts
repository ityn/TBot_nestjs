import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import * as cron from 'node-cron';
import { WorkShiftsService } from '../database/models/work-shifts/work-shifts.service';
import { ChatsService } from '../database/models/chats/chats.service';
import { PollsService } from '../polls/polls.service';
import { UsersService } from '../database/models/users/users.service';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly configService: ConfigService,
    private readonly workShiftsService: WorkShiftsService,
    private readonly chatsService: ChatsService,
    private readonly pollsService: PollsService,
    private readonly usersService: UsersService,
  ) {}

  onModuleInit() {
    const timezone = this.configService.get<string>('TIMEZONE') || 'Asia/Novosibirsk';
    
    // Schedule daily poll at 20:00 (8 PM)
    cron.schedule('0 20 * * *', async () => {
      this.logger.log('Scheduled poll trigger at 20:00');
      await this.sendAutoPoll();
    }, {
      timezone
    });

    // Daily reminder at 08:50 to open shift
    cron.schedule('50 8 * * *', async () => {
      await this.remindOpenShift(timezone);
    }, { timezone });

    this.logger.log(`Scheduler initialized. Daily poll will run at 20:00 (${timezone})`);
  }

  async sendAutoPoll() {
    try {
      // Get all active chats
      const chats = await this.chatsService.findAll();
      
      if (chats.length === 0) {
        this.logger.warn('No active chats found. Skipping scheduled poll.');
        return;
      }

      // Send poll to all chats
      for (const chat of chats) {
        const chatId = Number(chat.chatId);
        const pollKey = `${chatId}:shift_poll`;
        
        try {
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
            chatId
          };
          
          // Set 30 minute timeout
          poll.timeout = setTimeout(async () => {
            try {
              // If nobody is going, keep the poll open and extend by 15 minutes
              if ((poll.going?.length || 0) === 0) {
                await this.bot.telegram.sendMessage(chatId, '⏳ Никто не выбрал выход на смену. Опрос продлён на 15 минут. Пожалуйста, хотя бы один сотрудник должен выйти.');
                // Extend timeout by 15 minutes
                poll.timeout = setTimeout(async () => {
                  // After extension, if still nobody is going, just notify managers but do not close
                  if ((poll.going?.length || 0) === 0) {
                    await this.bot.telegram.sendMessage(chatId, '❗ По-прежнему никто не выходит. Менеджеры, пожалуйста, уточните график. Опрос остаётся открытым.');
                    return;
                  }
                  // Close if someone is going
                  try {
                    const goingList = poll.going.length > 0 ? poll.going.map(u => `@${u}`).join(', ') : 'никто';
                    const notGoingList = poll.notGoing.length > 0 ? poll.notGoing.map(u => `@${u}`).join(', ') : 'никто';
                    await this.bot.telegram.editMessageText(
                      chatId,
                      poll.messageId,
                      undefined,
                      `📋 Опрос завершён (продление истекло)\n\n✅ Выходят (${poll.going.length}): ${goingList}\n❌ Не выходят (${poll.notGoing.length}): ${notGoingList}`,
                      { reply_markup: { inline_keyboard: [] } } as any
                    );
                    poll.closed = true;
                    this.logger.log(`Poll auto-closed after extension for chatId=${chatId}`);
                    await this.createWorkShiftRecords(poll);
                  } catch (e) {
                    this.logger.warn(`Failed to close poll after extension: ${String(e)}`);
                  }
                }, 15 * 60 * 1000);
                return;
              }
              // Close immediately if someone is going
              const goingList = poll.going.length > 0 ? poll.going.map(u => `@${u}`).join(', ') : 'никто';
              const notGoingList = poll.notGoing.length > 0 ? poll.notGoing.map(u => `@${u}`).join(', ') : 'никто';
              await this.bot.telegram.editMessageText(
                chatId,
                poll.messageId,
                undefined,
                `📋 Опрос завершён (30 минут истекло)\n\n✅ Выходят (${poll.going.length}): ${goingList}\n❌ Не выходят (${poll.notGoing.length}): ${notGoingList}`,
                { reply_markup: { inline_keyboard: [] } } as any
              );
              poll.closed = true;
              this.logger.log(`Poll auto-closed for chatId=${chatId}`);
              await this.createWorkShiftRecords(poll);
            } catch (e) {
              this.logger.warn(`Failed to close poll: ${String(e)}`);
            }
          }, 30 * 60 * 1000); // 30 minutes
          
          this.pollsService.setShiftPoll(pollKey, poll);
          this.logger.log(`Scheduled poll sent to chatId=${chatId}, messageId=${(message as any).message_id}`);
        } catch (e) {
          this.logger.error(`Failed to send scheduled poll to chatId=${chatId}: ${String(e)}`);
        }
      }
    } catch (e) {
      this.logger.error(`Failed to get chats for scheduled poll: ${String(e)}`);
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
            const tag = shift.login ? `@${shift.login}` : shift.telegramId
            if (!shift.isOpened) {
              lines.push(`• ${tag} — не забудьте открыть смену командой /openshift`)
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
}

