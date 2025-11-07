import { Logger } from '@nestjs/common';
import { AppService } from './app.service';
import { Action, Ctx, InjectBot, Message, On, Update, Help, Command, Start, Hears } from 'nestjs-telegraf';
import { Context, Telegraf } from 'telegraf';
import { inlineMessageRatingKeyboard } from './app.buttons';
import { containsInviteLink, isAdmin, isGroupChat, hasRole, formatMessageWithName } from './common/telegram.util';
import { UsersService } from './database/models/users/users.service';
import { UserRole } from './database/models/users/user.entity';
import { TelegramClientService } from './telegram/telegram-client.service';
import { WorkShiftsService } from './database/models/work-shifts/work-shifts.service';
import { ChatsService } from './database/models/chats/chats.service';
import { PollsService } from './polls/polls.service';

const pendingVerifications = new Map<string, NodeJS.Timeout>()
const pendingShiftClosures = new Map<string, { workShiftId: number, step: 'awaiting_items' }>()
// import { Update } from 'telegraf/typings/core/types/typegram'


@Update()
export class AppUpdate {
  private readonly logger = new Logger(AppUpdate.name);
  
  constructor(
      @InjectBot() private readonly bot: Telegraf<Context>,
      private readonly appService: AppService,
      private readonly usersService: UsersService,
      private readonly telegramClient: TelegramClientService,
      private readonly workShiftsService: WorkShiftsService,
      private readonly chatsService: ChatsService,
      private readonly pollsService: PollsService,
  ) {}

  private replyWithName(ctx: Context, message: string): Promise<any> {
    const firstName = ctx.from?.first_name
    return ctx.reply(formatMessageWithName(message, firstName))
  }

  private async formatShiftPollText(usernames: string[], title: string = 'Выхожу'): Promise<string> {
    if (usernames.length === 0) {
      return `✅ ${title}: 0`
    }
    
    // Get first names for users
    const namePromises = usernames.map(async (username) => {
      const user = await this.usersService.findOneByLogin(username)
      const firstName = user?.firstName
      return firstName ? `${firstName} (@${username})` : `@${username}`
    })
    const names = await Promise.all(namePromises)
    
    // Format: "✅ Выхожу: 3\n- Иван (@ivan)\n- Мария (@maria)\n- Петр (@petr)"
    const namesList = names.map(name => `- ${name}`).join('\n')
    return `✅ ${title}: ${usernames.length}\n${namesList}`
  }

  private async createWorkShiftRecords(poll: any) {
    try {
      const goingEmployees = poll.going
      if (goingEmployees.length === 0) {
        Logger.log('No employees going to work, skipping work shift records creation', 'AppUpdate')
        return
      }

      // Calculate shift value based on number of employees (as number)
      const employeeCount = goingEmployees.length
      const shiftValue = employeeCount === 1 ? 1 : parseFloat((1 / employeeCount).toFixed(1))
      
      // Shift date = poll creation date + 1 day (using UTC to avoid timezone issues)
      const pollDate = poll.createdAt || new Date()
      const shiftDate = new Date(Date.UTC(
        pollDate.getUTCFullYear(),
        pollDate.getUTCMonth(),
        pollDate.getUTCDate() + 1,  // +1 day
        0, 0, 0, 0
      ))
      
      Logger.log(`Poll created: ${pollDate.toISOString()}, Shift date calculated: ${shiftDate.toISOString()}`, 'AppUpdate')

      const baseRate = 1400

      for (const username of goingEmployees) {
        try {
          // Find user by login (username)
          const user = await this.usersService.findOneByLogin(username)
          if (!user) {
            Logger.warn(`User not found in DB for username: ${username}`, 'AppUpdate')
            continue
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
          })

          Logger.log(`Work shift record created for ${username} (${user.telegramId}), shift: ${shiftValue}`, 'AppUpdate')
        } catch (e) {
          Logger.warn(`Failed to create work shift for ${username}: ${String(e)}`, 'AppUpdate')
        }
      }

      Logger.log(`Created ${goingEmployees.length} work shift records for ${shiftDate.toISOString().split('T')[0]}`, 'AppUpdate')
    } catch (e) {
      Logger.error(`Failed to create work shift records: ${String(e)}`, 'AppUpdate')
    }
  }

  private async checkAndFixExistingShifts(pollDate: Date, chatId: number): Promise<void> {
    try {
      // Calculate shift date (poll date + 1 day)
      const shiftDate = new Date(Date.UTC(
        pollDate.getUTCFullYear(),
        pollDate.getUTCMonth(),
        pollDate.getUTCDate() + 1,
        0, 0, 0, 0
      ))

      const startOfDay = new Date(shiftDate)
      const endOfDay = new Date(Date.UTC(
        shiftDate.getUTCFullYear(),
        shiftDate.getUTCMonth(),
        shiftDate.getUTCDate(),
        23, 59, 59, 999
      ))

      // Get existing shifts for this date
      const existingShifts = await this.workShiftsService.findByDateRangeForChat(startOfDay, endOfDay, String(chatId))

      if (existingShifts.length === 0) {
        Logger.log(`No existing shifts found for ${shiftDate.toISOString().split('T')[0]}`, 'AppUpdate')
        return
      }

      Logger.log(`Found ${existingShifts.length} existing shifts for ${shiftDate.toISOString().split('T')[0]}, will be deleted and recreated`, 'AppUpdate')

      // Delete existing shifts for this date
      for (const shift of existingShifts) {
        await this.workShiftsService.delete(shift.id)
        Logger.log(`Deleted existing shift: id=${shift.id}, user=${shift.login}`, 'AppUpdate')
      }
    } catch (e) {
      Logger.error(`Failed to check/fix existing shifts: ${String(e)}`, 'AppUpdate')
    }
  }

  private async checkAndClosePollIfComplete(chatId: number, poll: any, ctx: Context, pollKey: string) {
    try {
      // Get total number of employees
      const totalEmployees = await this.usersService.countByRole(UserRole.EMPLOYEE)
      const votedCount = poll.going.length + poll.notGoing.length
      
      Logger.debug(`Poll check: ${votedCount}/${totalEmployees} employees voted`, 'AppUpdate')
      
      // Check if all employees have voted
      if (votedCount >= totalEmployees && totalEmployees > 0) {
        // Do not allow closing if nobody is going
        if ((poll.going?.length || 0) === 0) {
          try {
            await ctx.reply('❗ Никто не выходит на смену. Опрос остаётся открытым. Пожалуйста, измените решение: хотя бы один сотрудник должен выйти.');
          } catch {}
          return false
        }
        poll.closed = true
        if (poll.timeout) {
          clearTimeout(poll.timeout)
          poll.timeout = undefined
        }
        poll.expiresAt = null
        
        const goingList = poll.going.length > 0 ? poll.going.map(u => `@${u}`).join(', ') : 'никто'
        const notGoingList = poll.notGoing.length > 0 ? poll.notGoing.map(u => `@${u}`).join(', ') : 'никто'
        
        await ctx.telegram.editMessageText(
          chatId, 
          poll.messageId, 
          undefined, 
          `📋 Опрос завершён (все сотрудники проголосовали)\n\n✅ Выходят (${poll.going.length}): ${goingList}\n❌ Не выходят (${poll.notGoing.length}): ${notGoingList}`,
          { reply_markup: { inline_keyboard: [] } } as any
        )
        Logger.log(`Poll auto-closed: all ${totalEmployees} employees voted in chatId=${chatId}`, 'AppUpdate')
        
        await this.pollsService.markShiftPollClosed(pollKey)
        await this.pollsService.saveShiftPollState(pollKey, { closed: true, expiresAt: null })

        // Create work shift records
        await this.createWorkShiftRecords(poll)
        
        return true
      }
      await this.pollsService.saveShiftPollState(pollKey)
      return false
    } catch (e) {
      Logger.warn(`Failed to check poll completion: ${String(e)}`, 'AppUpdate')
      return false
    }
  }

  @Start()
  async startCommand(ctx: Context) {
    Logger.log(`Start command received from @${ctx.from?.username}`, 'AppUpdate')
    await ctx.reply(`Привет, ${ctx.from?.first_name}! Используйте /help для списка команд.`)
  }

  @Hears(/^[^/].*/) // Match any text that doesn't start with /
  async getMessage(@Message('text') message: string, @Ctx() ctx: Context){
    if (!isGroupChat(ctx)) return
    
    // Ensure chat is registered in database
    const chatId = ctx.chat?.id;
    if (chatId) {
      try {
        const existingChat = await this.chatsService.findOneByChatId(String(chatId));
        if (!existingChat) {
          const title = (ctx.chat as any).title || null;
          const type = ctx.chat?.type || null;
          await this.chatsService.findOrCreate(String(chatId), title, type);
          this.logger.log(`Chat ${chatId} auto-registered in database from message handler`);
        }
      } catch (e) {
        this.logger.warn(`Failed to register chat ${chatId}: ${String(e)}`);
      }
    }
    
    Logger.debug(`Text in group ${ctx.chat?.id} from @${ctx.from?.username}: ${message}`, 'AppUpdate')
    
    // Check for pending shift closure
    const telegramId = String(ctx.from?.id)
    const closureKey = `${ctx.chat?.id}:${telegramId}`
    const pendingClosure = pendingShiftClosures.get(closureKey)
    
    if (pendingClosure && pendingClosure.step === 'awaiting_items') {
      // User is expected to input items count
      const itemsCount = parseInt(message.trim(), 10)
      
      if (isNaN(itemsCount) || itemsCount < 0) {
        await this.replyWithName(ctx, '❌ Неверное число. Введите корректное количество выданных товаров (целое число >= 0):')
        return
      }
      
      try {
        await this.workShiftsService.update(pendingClosure.workShiftId, {
          itemsIssued: itemsCount
        })
        
        pendingShiftClosures.delete(closureKey)
        
        const shift = await this.workShiftsService.findOne(pendingClosure.workShiftId)
        const total = shift ? ((shift.baseRate || 0) * (shift.shift || 0)) + itemsCount : itemsCount
        
        await this.replyWithName(ctx,
          `✅ Смена закрыта!\n\n` +
          `📦 Выдано товаров: ${itemsCount}\n` +
          `💰 Базовая ставка: ${shift?.baseRate || 0}\n` +
          `📊 Коэффициент: ${shift?.shift || 0}\n` +
          `💵 Итого: ${total.toFixed(2)}`
        )
        
        Logger.log(`Shift closed: workShiftId=${pendingClosure.workShiftId}, items=${itemsCount}`, 'AppUpdate')
      } catch (e) {
        Logger.warn(`Failed to update work shift: ${String(e)}`, 'AppUpdate')
        await this.replyWithName(ctx, 'Ошибка при закрытии смены.')
        pendingShiftClosures.delete(closureKey)
      }
      
      return
    }
    
    // Simple rate limiting: max 5 messages per 10 seconds per user
    try {
      const now = Date.now()
      // @ts-ignore - session from telegraf-session-redis
      const session = (ctx as any).session || ((ctx as any).session = {})
      const key = 'rateLimit'
      const rl = session[key] || { count: 0, windowStart: now }
      if (now - rl.windowStart > 10_000) {
        rl.count = 0
        rl.windowStart = now
      }
      rl.count += 1
      session[key] = rl
      if (rl.count > 5 && !(await isAdmin(ctx))) {
        await ctx.reply(`@${ctx.from?.username}, слишком много сообщений. Подождите немного.`)
        return
      }
    } catch (e) {
      Logger.warn(`Rate limit check failed: ${String(e)}`, 'AppUpdate')
    }
    // Anti-link moderation (requires MANAGER+ role or admin)
    if (containsInviteLink(message)) {
      const isGroupAdmin = await isAdmin(ctx)
      if (!isGroupAdmin) {
        const telegramId = String(ctx.from?.id)
        const user = await this.usersService.findOneByTelegramId(telegramId)
        const canPost = user && hasRole(user, UserRole.MANAGER)
        if (!canPost) {
          try {
            await ctx.deleteMessage()
            const reply_parameters = (ctx.message && (ctx.message as any).message_id)
              ? { message_id: (ctx.message as any).message_id }
              : undefined
            await ctx.reply(
              `@${ctx.from?.username}, ссылки-приглашения запрещены. Требуется роль: Менеджер или выше, либо права администратора группы.`,
              reply_parameters ? { reply_parameters } : undefined as any
            )
          } catch (e) {
            Logger.warn(`Failed to delete message: ${String(e)}`, 'AppUpdate')
          }
          return
        }
      }
    }

  }

  @On('my_chat_member')
  async onBotAddedToChat(@Ctx() ctx: Context) {
    try {
      const update = (ctx.update as any).my_chat_member
      const newStatus = update?.new_chat_member?.status
      const oldStatus = update?.old_chat_member?.status
      const chatId = ctx.chat?.id
      if (!chatId || !isGroupChat(ctx)) return
      // Detect bot added to group
      if ((oldStatus === 'left' || oldStatus === 'kicked') && (newStatus === 'member' || newStatus === 'administrator')) {
        Logger.log(`Bot added to group chatId=${chatId}, syncing members...`, 'AppUpdate')
        
        // Save chat to database
        const title = (ctx.chat as any).title || null;
        const type = ctx.chat?.type || null;
        await this.chatsService.findOrCreate(String(chatId), title, type);
        Logger.log(`Chat ${chatId} registered`, 'AppUpdate');
        
        // Fetch admins (we can get their user info)
        const admins = await ctx.telegram.getChatAdministrators(chatId)
        for (const admin of admins) {
          const user = admin.user
          const telegramId = String(user.id)
          const login = user.username || telegramId
          const firstName = user.first_name
          const lastName = user.last_name
          const languageCode = (user as any).language_code
          const existsByTg = await this.usersService.findOneByTelegramId(telegramId)
          if (!existsByTg) {
            await this.usersService.create({
              login,
              firstName: firstName ?? null,
              lastName: lastName ?? null,
              telegramId,
              isBot: user.is_bot,
              languageCode: languageCode ?? null,
            })
            Logger.log(`Admin synced: ${login} (${telegramId})`, 'AppUpdate')
          } else {
            // Update existing user info
            existsByTg.firstName = firstName ?? existsByTg.firstName
            existsByTg.lastName = lastName ?? existsByTg.lastName
            existsByTg.languageCode = languageCode ?? existsByTg.languageCode
            await existsByTg.save()
            Logger.log(`Admin updated: ${login} (${telegramId})`, 'AppUpdate')
          }
        }
        Logger.log(`Synced ${admins.length} admins for chatId=${chatId}`, 'AppUpdate')
        // Trigger full member sync via MTProto
        await this.telegramClient.syncAllMembers(chatId)
      }
      
      // Detect bot removed from group
      if ((oldStatus === 'member' || oldStatus === 'administrator') && (newStatus === 'left' || newStatus === 'kicked')) {
        Logger.log(`Bot removed from group chatId=${chatId}, cleaning up...`, 'AppUpdate')
        
        try {
          // Close any active polls for this chat
          this.pollsService.cleanupForChat(chatId)
          
          // Clear any pending verifications for this chat
          const chatIdStr = String(chatId)
          for (const [key, timeout] of pendingVerifications.entries()) {
            if (key.startsWith(chatIdStr)) {
              clearTimeout(timeout)
              pendingVerifications.delete(key)
            }
          }
          
          // Clear any pending shift closures for this chat
          for (const [key] of pendingShiftClosures.entries()) {
            if (key.startsWith(chatIdStr)) {
              pendingShiftClosures.delete(key)
            }
          }
          
          // Delete work shifts for this chat
          const deletedShifts = await this.workShiftsService.deleteByChatId(String(chatId))
          Logger.log(`Deleted ${deletedShifts} work shifts for chatId=${chatId}`, 'AppUpdate')
          
          // Delete chat from database
          const deletedChats = await this.chatsService.remove(String(chatId))
          Logger.log(`Removed ${deletedChats} chat record(s) for chatId=${chatId}`, 'AppUpdate')
          
        } catch (e) {
          Logger.error(`Failed to cleanup data for chatId=${chatId}: ${String(e)}`, 'AppUpdate')
        }
      }
    } catch (e) {
      Logger.warn(`Failed to process my_chat_member update: ${String(e)}`, 'AppUpdate')
    }
  }

  @On('new_chat_members')
  async getMesage(@Message('new_chat_members') _message: unknown, @Ctx() ctx:Context){
    if (!isGroupChat(ctx)) return
    Logger.log(`New chat member joined. chatId=${ctx.chat?.id}`, 'AppUpdate')
    try {
      const newMembers = (ctx.message && (ctx.message as any).new_chat_members) || []
      const botId = String(ctx.botInfo?.id)
      for (const m of newMembers) {
        const username: string | undefined = m?.username
        const firstName: string | undefined = m?.first_name
        const lastName: string | undefined = m?.last_name
        const languageCode: string | undefined = (m as any)?.language_code
        const telegramId: string = String(m?.id)
        const login = username || telegramId || `${firstName ?? 'user'}_${Date.now()}`

        const existsByTg = await this.usersService.findOneByTelegramId(telegramId)
        const existsByLogin = existsByTg ? existsByTg : await this.usersService.findOneByLogin(login)
        if (!existsByLogin) {
          await this.usersService.create({
            login,
            firstName: firstName ?? null,
            lastName: lastName ?? null,
            telegramId,
            isBot: Boolean((m as any)?.is_bot),
            languageCode: languageCode ?? null,
          })
          Logger.log(`User saved: login=${login} telegramId=${telegramId}`, 'AppUpdate')
        }

        // Skip verification for the bot itself
        if (telegramId === botId) {
          Logger.log(`Bot itself joined, skipping verification.`, 'AppUpdate')
          continue
        }

        // Send verification request to the new member
        const chatId = ctx.chat?.id as number
        const verifyData = `verify:${chatId}:${telegramId}`
        const verificationMsg = await ctx.reply(
          `Привет, ${firstName ?? username ?? 'друг'}! Подтвердите, что вы не бот, нажав кнопку ниже в течение 3 часов.`,
          {
            reply_markup: {
              inline_keyboard: [[{ text: 'Я не бот ✅', callback_data: verifyData }]],
            },
          } as any,
        )

        // Immediately restrict new member until confirmation
        try {
          await ctx.telegram.restrictChatMember(chatId, Number(telegramId), {
            can_send_messages: false,
            can_send_media_messages: false,
            can_send_other_messages: false,
            can_add_web_page_previews: false,
          } as any)
        } catch (e) {
          Logger.warn(`Failed to restrict user ${telegramId}: ${String(e)}`, 'AppUpdate')
        }

        // Schedule timeout to remove non-confirmed member (requires admin rights)
        const key = `${chatId}:${telegramId}`
        const timeout = setTimeout(async () => {
          try {
            await ctx.telegram.deleteMessage(chatId, (verificationMsg as any).message_id)
            const retryData = `retry_verify:${chatId}:${telegramId}`
            await ctx.reply(
              `@${username ?? telegramId} не подтвердил(а) участие вовремя. Доступ ограничен. Для повторной попытки нажмите кнопку ниже.`,
              {
                reply_markup: {
                  inline_keyboard: [[{ text: 'Запросить повторно 🔄', callback_data: retryData }]],
                },
              } as any,
            )
          } catch (e) {
            Logger.warn(`Timeout handling failed for ${telegramId}: ${String(e)}`, 'AppUpdate')
          } finally {
            pendingVerifications.delete(key)
          }
        }, 3 * 60 * 60 * 1000)
        pendingVerifications.set(key, timeout)
      }
    } catch (e) {
      Logger.warn(`Failed to process new_chat_members: ${String(e)}`, 'AppUpdate')
    }

    
  }

  @Action(/like$/)
  async onAnswerLike(@Ctx() context: Context){
    const cbQuery = 'callback_query' in context.update ? context.update.callback_query : undefined
    const userAnswer = (cbQuery && 'data' in cbQuery) ? (cbQuery as any).data : null
    Logger.debug(`Callback from @${context.from?.username}: ${userAnswer}`, 'AppUpdate')
    await context.reply(`${context.from?.username} answer is: ${userAnswer}`)

  }

  @Command('checkchats')
  async checkChats(@Ctx() ctx: Context) {
    this.logger.log(`Checkchats command received from @${ctx.from?.username} in chat ${ctx.chat?.id}`, 'AppUpdate')
    if (!isGroupChat(ctx)) {
      await this.replyWithName(ctx, 'Эта команда работает только в группах.')
      return
    }
    try {
      const isGroupAdmin = await isAdmin(ctx)
      if (!isGroupAdmin) {
        await this.replyWithName(ctx, 'Эта команда доступна только администраторам группы.')
        return
      }
      
      const chats = await this.chatsService.findAll()
      if (chats.length === 0) {
        await ctx.reply('❌ В базе данных не найдено ни одного зарегистрированного чата.\n\nБот должен автоматически регистрировать чаты при:\n1. Добавлении бота в группу (onBotAddedToChat)\n2. Первом сообщении в группе (getMessage)\n\nПопробуйте написать любое сообщение в этом чате, чтобы автоматически зарегистрировать его.')
        return
      }
      
      let message = `📋 Найдено чатов в базе: ${chats.length}\n\n`
      chats.forEach((chat, index) => {
        const isCurrentChat = chat.chatId === String(ctx.chat?.id)
        message += `${isCurrentChat ? '✅' : '📌'} ${index + 1}. ID: ${chat.chatId}, Название: ${chat.title || 'N/A'}, Тип: ${chat.type || 'N/A'}\n`
      })
      
      const currentChatId = String(ctx.chat?.id)
      const currentChatExists = chats.some(c => c.chatId === currentChatId)
      if (!currentChatExists) {
        // Auto-register current chat
        try {
          const title = (ctx.chat as any).title || null
          const type = ctx.chat?.type || null
          await this.chatsService.findOrCreate(currentChatId, title, type)
          message += `\n✅ Текущий чат (${currentChatId}) зарегистрирован в базе данных.`
          this.logger.log(`Chat ${currentChatId} registered via checkchats command`)
        } catch (e) {
          message += `\n❌ Ошибка регистрации текущего чата: ${String(e)}`
          this.logger.error(`Failed to register chat ${currentChatId}: ${String(e)}`)
        }
      }
      
      await ctx.reply(message)
    } catch (e) {
      this.logger.error(`Error in checkchats command: ${String(e)}`)
      await ctx.reply(`Ошибка при проверке чатов: ${String(e)}`)
    }
  }

  @Help()
  @Command('help')
  async help(@Ctx() ctx: Context) {
    Logger.log(`Help command received from @${ctx.from?.username} in chat ${ctx.chat?.id}`, 'AppUpdate')
    const text = [
      'Доступные команды:',
      '/help — показать это сообщение',
      '/myrole — показать вашу роль',
      '/setrole @username <роль> — изменить роль (только для Управляющих)',
      '/poll — опрос смены на завтра (Менеджеры+)',
      '/pollsync — синхронизация: кто сегодня на смене (Менеджеры+)',
      '/closeshift — закрыть смену (внести количество выданных товаров)',
      '/openshift — открыть смену (отметить начало работы)',
      'Автомодерация: удаляем инвайт-ссылки (Менеджеры+)',
    ].join('\n')
    await ctx.reply(text)
  }

  @Command('myrole')
  async myRole(@Ctx() ctx: Context) {
    Logger.log(`Myrole command received from @${ctx.from?.username} in chat ${ctx.chat?.id}`, 'AppUpdate')
    try {
      const telegramId = String(ctx.from?.id)
      const user = await this.usersService.findOneByTelegramId(telegramId)
      if (!user) {
        await this.replyWithName(ctx, 'Вы не найдены в базе данных.')
        return
      }
      await this.replyWithName(ctx, `Ваша роль: ${user.role}`)
    } catch (e) {
      Logger.warn(`myrole command failed: ${String(e)}`, 'AppUpdate')
    }
  }

  @Command('setrole')
  async setRole(@Ctx() ctx: Context) {
    Logger.log(`Setrole command received from @${ctx.from?.username} in chat ${ctx.chat?.id}`, 'AppUpdate')
    if (!isGroupChat(ctx)) return
    try {
      const callerTgId = String(ctx.from?.id)
      const isGroupAdmin = await isAdmin(ctx)
      const caller = await this.usersService.findOneByTelegramId(callerTgId)
      if (!isGroupAdmin && (!caller || !hasRole(caller, UserRole.DIRECTOR))) {
        await this.replyWithName(ctx, 'У вас нет прав для смены ролей. Требуется роль: Управляющий или права администратора группы.')
        return
      }
      const msg = (ctx.message as any)?.text || ''
      const parts = msg.split(/\s+/)
      // /setrole @username роль
      if (parts.length < 3) {
        await this.replyWithName(ctx, 'Использование: /setrole @username <роль>\nРоли: Сотрудник, Менеджер, Управляющий')
        return
      }
      const targetUsername = parts[1].replace('@', '')
      const roleStr = parts[2]
      let targetRole: UserRole | undefined
      if (roleStr === 'Сотрудник') targetRole = UserRole.EMPLOYEE
      else if (roleStr === 'Менеджер') targetRole = UserRole.MANAGER
      else if (roleStr === 'Управляющий') targetRole = UserRole.DIRECTOR
      if (!targetRole) {
        await this.replyWithName(ctx, 'Неверная роль. Доступные: Сотрудник, Менеджер, Управляющий')
        return
      }
      const targetUser = await this.usersService.findOneByLogin(targetUsername)
      if (!targetUser) {
        await this.replyWithName(ctx, `Пользователь @${targetUsername} не найден в базе.`)
        return
      }
      await this.usersService.updateRole(targetUser.telegramId, targetRole)
      await this.replyWithName(ctx, `Роль пользователя @${targetUsername} изменена на: ${targetRole}`)
      Logger.log(`Role changed: @${targetUsername} -> ${targetRole} by @${ctx.from?.username}`, 'AppUpdate')
    } catch (e) {
      Logger.warn(`setrole command failed: ${String(e)}`, 'AppUpdate')
      await this.replyWithName(ctx, 'Произошла ошибка при смене роли.')
    }
  }

  @Command('poll')
  async createShiftPoll(@Ctx() ctx: Context) {
    Logger.log(`Poll command received from @${ctx.from?.username} in chat ${ctx.chat?.id}`, 'AppUpdate')
    if (!isGroupChat(ctx)) {
      await this.replyWithName(ctx, 'Эта команда работает только в группах.')
      return
    }
    try {
      const callerTgId = String(ctx.from?.id)
      const isGroupAdmin = await isAdmin(ctx)
      const caller = await this.usersService.findOneByTelegramId(callerTgId)
      if (!isGroupAdmin && (!caller || !hasRole(caller, UserRole.MANAGER))) {
        await this.replyWithName(ctx, 'У вас нет прав для создания опроса. Требуется роль: Менеджер или выше, либо права администратора группы.')
        return
      }
      const chatId = ctx.chat?.id as number
      const pollKey = `${chatId}:shift_poll`
      
      // If poll created manually by manager/admin - check and fix existing shifts
      const pollDate = new Date()
      await this.checkAndFixExistingShifts(pollDate, chatId)
      
      // Close previous poll if exists
      this.pollsService.clearShiftPollTimeout(pollKey)
      await this.pollsService.deleteShiftPoll(pollKey)
      
      const message = await ctx.reply(
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
      )
      
      const poll = {
        going: [],
        notGoing: [],
        messageId: (message as any).message_id,
        closed: false,
        timeout: undefined as NodeJS.Timeout | undefined,
        createdAt: new Date(),
        chatId,
        source: 'manual' as const,
        extensionCount: 0,
        expiresAt: null,
      }

      const scheduleTimeout = (durationMs: number) => {
        if (poll.timeout) {
          clearTimeout(poll.timeout)
        }
        const expiresAt = new Date(Date.now() + durationMs)
        poll.expiresAt = expiresAt
        void this.pollsService.updateShiftPollExpiration(pollKey, expiresAt, poll.extensionCount ?? 0)

        poll.timeout = setTimeout(async () => {
          try {
            if ((poll.going?.length || 0) === 0) {
              if ((poll.extensionCount ?? 0) === 0) {
                await ctx.reply('⏳ Никто не выбрал выход на смену. Опрос продлён на 15 минут. Пожалуйста, хотя бы один сотрудник должен выйти.')
                poll.extensionCount = 1
                await this.pollsService.saveShiftPollState(pollKey, { extensionCount: poll.extensionCount })
                scheduleTimeout(15 * 60 * 1000)
                return
              }

              await ctx.reply('❗ По-прежнему никто не выходит. Менеджеры, пожалуйста, уточните график. Опрос остаётся открытым.')
              poll.timeout = undefined
              poll.expiresAt = null
              await this.pollsService.updateShiftPollExpiration(pollKey, null, poll.extensionCount ?? 1)
              await this.pollsService.saveShiftPollState(pollKey)
              return
            }

            const goingList = poll.going.length > 0 ? poll.going.map(u => `@${u}`).join(', ') : 'никто'
            const notGoingList = poll.notGoing.length > 0 ? poll.notGoing.map(u => `@${u}`).join(', ') : 'никто'
            await ctx.telegram.editMessageText(
              chatId,
              poll.messageId,
              undefined,
              `📋 Опрос завершён (30 минут истекло)\n\n✅ Выходят (${poll.going.length}): ${goingList}\n❌ Не выходят (${poll.notGoing.length}): ${notGoingList}`,
              { reply_markup: { inline_keyboard: [] } } as any
            )
            poll.closed = true
            poll.timeout = undefined
            poll.expiresAt = null
            await this.pollsService.markShiftPollClosed(pollKey)
            await this.pollsService.saveShiftPollState(pollKey)
            Logger.log(`Poll auto-closed for chatId=${chatId}`, 'AppUpdate')
            await this.createWorkShiftRecords(poll)
          } catch (e) {
            Logger.warn(`Failed to close poll: ${String(e)}`, 'AppUpdate')
          }
        }, durationMs)
      }

      const initialTimeoutMs = 30 * 60 * 1000
      const initialExpiresAt = new Date(Date.now() + initialTimeoutMs)
      poll.expiresAt = initialExpiresAt

      await this.pollsService.setShiftPoll(pollKey, poll, {
        source: 'manual',
        expiresAt: initialExpiresAt,
        extensionCount: poll.extensionCount ?? 0,
      })

      scheduleTimeout(initialTimeoutMs)
      Logger.log(`Shift poll created by @${ctx.from?.username} in chatId=${chatId}`, 'AppUpdate')
    } catch (e) {
      Logger.warn(`poll command failed: ${String(e)}`, 'AppUpdate')
      await this.replyWithName(ctx, 'Ошибка при создании опроса.')
    }
  }

  @Command('pollsync')
  async createSyncPoll(@Ctx() ctx: Context) {
    Logger.log(`Sync poll command received from @${ctx.from?.username} in chat ${ctx.chat?.id}`, 'AppUpdate')
    if (!isGroupChat(ctx)) {
      await this.replyWithName(ctx, 'Эта команда работает только в группах.')
      return
    }
    try {
      const callerTgId = String(ctx.from?.id)
      const isGroupAdmin = await isAdmin(ctx)
      const caller = await this.usersService.findOneByTelegramId(callerTgId)
      if (!isGroupAdmin && (!caller || !hasRole(caller, UserRole.MANAGER))) {
        await this.replyWithName(ctx, 'У вас нет прав для создания опроса. Требуется роль: Менеджер или выше, либо права администратора группы.')
        return
      }

      const chatId = ctx.chat?.id as number
      const pollKey = `${chatId}:sync_poll`
      
      // Close previous sync poll if exists
      this.pollsService.clearSyncPollTimeout(pollKey)
      const existingPoll = this.pollsService.getSyncPoll(pollKey)
      if (existingPoll) {
        this.pollsService.deleteSyncPoll(pollKey)
      }

      // Determine local today range
      const today = new Date()
      const startOfToday = new Date(Date.UTC(
        today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0
      ))
      const endOfToday = new Date(Date.UTC(
        today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999
      ))

      // Check if there are already shifts for today
      const existingShifts = await this.workShiftsService.findByDateRangeForChat(startOfToday, endOfToday, String(chatId))
      
      if (existingShifts.length > 0) {
        const shiftList = existingShifts.map(s => `• @${s.login}`).join('\n')
        await this.replyWithName(ctx,
          `📋 Сегодня смена уже записана:\n\n${shiftList}\n\n` +
          `Если нужно изменить состав, используйте команду /poll для создания опроса на завтра.`
        )
        return
      }

      const message = await ctx.reply(
        '📋 Опрос: Кто сегодня на смене?\n⏱ Время на ответ: 10 минут\n\n✅ На смене: 0',
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ На смене', callback_data: `sync_poll_yes:${chatId}` },
              ],
              [{ text: '📊 Результаты (Менеджеры)', callback_data: `sync_poll_results:${chatId}` }],
              [{ text: '✅ Завершить и сохранить (Менеджеры)', callback_data: `sync_poll_close:${chatId}` }],
            ],
          },
        } as any,
      )
      
      const poll = { 
        going: [], 
        messageId: (message as any).message_id,
        closed: false,
        timeout: undefined as NodeJS.Timeout | undefined,
        chatId
      }
      
      // Set 10 minute timeout
      poll.timeout = setTimeout(async () => {
        if (!poll.closed) {
          await this.closeSyncPoll(chatId, pollKey, poll)
        }
      }, 10 * 60 * 1000) // 10 minutes
      
      this.pollsService.setSyncPoll(pollKey, poll)
      Logger.log(`Sync poll created: chatId=${chatId}, pollKey=${pollKey}, messageId=${poll.messageId}, going=${poll.going.length}`, 'AppUpdate')
    } catch (e) {
      Logger.warn(`sync poll command failed: ${String(e)}`, 'AppUpdate')
      await this.replyWithName(ctx, 'Ошибка при создании опроса.')
    }
  }

  @Command('closeshift')
  async closeShift(@Ctx() ctx: Context) {
    Logger.log(`Closeshift command received from @${ctx.from?.username} in chat ${ctx.chat?.id}`, 'AppUpdate')
    try {
      const telegramId = String(ctx.from?.id)
      const user = await this.usersService.findOneByTelegramId(telegramId)
      
      if (!user) {
        await this.replyWithName(ctx, 'Вы не найдены в базе данных.')
        return
      }

      // Get today's date (start and end of day in LOCAL time, then convert to UTC for DB)
      const today = new Date()
      const startOfToday = new Date(Date.UTC(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        0, 0, 0, 0
      ))
      const endOfToday = new Date(Date.UTC(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        23, 59, 59, 999
      ))

      Logger.log(`Looking for shift on date: ${startOfToday.toISOString()} (local: ${today.toLocaleDateString('ru-RU')}) for user ${user.login}`, 'AppUpdate')

      // Find user's shift for today
      const shifts = await this.workShiftsService.findByDateRangeForChat(startOfToday, endOfToday, String(ctx.chat?.id))
      Logger.log(`Found ${shifts.length} shifts for today, user shifts: ${shifts.filter(s => s.telegramId === telegramId).length}`, 'AppUpdate')
      
      const userShift = shifts.find(s => s.telegramId === telegramId)

      if (!userShift) {
        // Check all user shifts to debug
        const allUserShifts = await this.workShiftsService.findByTelegramId(telegramId)
        Logger.warn(`No shift found for today. User has ${allUserShifts.length} total shifts`, 'AppUpdate')
        if (allUserShifts.length > 0) {
          const latestShift = allUserShifts[0]
          Logger.warn(`Latest shift date: ${latestShift.shiftDate}`, 'AppUpdate')
        }
        await this.replyWithName(ctx, 'У вас нет смены на сегодня.')
        return
      }

      if (userShift.itemsIssued && userShift.itemsIssued > 0) {
        await this.replyWithName(ctx, `Ваша смена уже закрыта. Выдано товаров: ${userShift.itemsIssued}`)
        return
      }

      // Store pending closure
      const key = `${ctx.chat?.id}:${telegramId}`
      pendingShiftClosures.set(key, {
        workShiftId: userShift.id,
        step: 'awaiting_items'
      })

      await this.replyWithName(ctx,
        `📋 Закрытие смены\n\n` +
        `Дата смены: ${new Date(userShift.shiftDate).toLocaleDateString('ru-RU')}\n` +
        `Базовая ставка: ${userShift.baseRate}\n` +
        `Коэффициент: ${userShift.shift}\n\n` +
        `Введите количество выданных товаров:`
      )

      Logger.log(`Shift closure initiated for user ${user.login} (${telegramId})`, 'AppUpdate')
    } catch (e) {
      Logger.warn(`closeshift command failed: ${String(e)}`, 'AppUpdate')
      await this.replyWithName(ctx, 'Ошибка при закрытии смены.')
    }
  }

  @Command('openshift')
  async openShift(@Ctx() ctx: Context) {
    Logger.log(`Openshift command received from @${ctx.from?.username} in chat ${ctx.chat?.id}`, 'AppUpdate')
    try {
      const telegramId = String(ctx.from?.id)
      const user = await this.usersService.findOneByTelegramId(telegramId)
      if (!user) {
        await this.replyWithName(ctx, 'Вы не найдены в базе данных.')
        return
      }

      // Determine local today range converted to UTC
      const today = new Date()
      const startOfToday = new Date(Date.UTC(
        today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0
      ))
      const endOfToday = new Date(Date.UTC(
        today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999
      ))

      const shifts = await this.workShiftsService.findByDateRangeForChat(startOfToday, endOfToday, String(ctx.chat?.id))
      const userShift = shifts.find(s => s.telegramId === telegramId)
      if (!userShift) {
        await this.replyWithName(ctx, 'На сегодня у вас нет смены.')
        return
      }
      if (userShift.isOpened) {
        await this.replyWithName(ctx, `Смена уже открыта в ${userShift.openedAt ? new Date(userShift.openedAt).toLocaleTimeString('ru-RU') : ''}`)
        return
      }

      await this.workShiftsService.markOpened(userShift.id, new Date())
      await this.replyWithName(ctx, '✅ Смена открыта! Удачной работы.')
      Logger.log(`Shift opened: workShiftId=${userShift.id} by ${user.login} (${telegramId})`, 'AppUpdate')
    } catch (e) {
      Logger.warn(`openshift command failed: ${String(e)}`, 'AppUpdate')
      await this.replyWithName(ctx, 'Ошибка при открытии смены.')
    }
  }

  @Action(/verify:\-?\d+:\d+/)
  async confirmVerification(@Ctx() ctx: Context) {
    try {
      const cb = (ctx.update as any).callback_query
      const data: string = cb?.data
      const fromId: number | undefined = ctx.from?.id
      const [_, chatIdStr, userIdStr] = data.split(':')
      const chatId = Number(chatIdStr)
      const userId = Number(userIdStr)
      if (!fromId || fromId !== userId) {
        await ctx.answerCbQuery('Это подтверждение не для вас', { show_alert: true } as any)
        return
      }
      const key = `${chatId}:${userId}`
      const t = pendingVerifications.get(key)
      if (t) {
        clearTimeout(t)
        pendingVerifications.delete(key)
      }
      // Lift restrictions
      try {
        await ctx.telegram.restrictChatMember(chatId, userId, {
          can_send_messages: true,
          can_send_media_messages: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
        } as any)
      } catch (e) {
        Logger.warn(`Failed to lift restrictions for ${userId}: ${String(e)}`, 'AppUpdate')
      }
      await ctx.answerCbQuery('Подтверждено!')
      await ctx.reply(`Спасибо, @${ctx.from?.username ?? userId}, добро пожаловать!`)
    } catch (e) {
      Logger.warn(`Verification confirm failed: ${String(e)}`, 'AppUpdate')
    }
  }

  @Action(/^poll_yes:\-?\d+$/)
  async pollYes(@Ctx() ctx: Context) {
    console.log('*** POLL_YES TRIGGERED ***')
    try {
      const cb = (ctx.update as any).callback_query
      const data: string = cb?.data
      const [_, chatIdStr] = data.split(':')
      const chatId = Number(chatIdStr)
      const userId = String(ctx.from?.id)
      const username = ctx.from?.username || userId
      
      const user = await this.usersService.findOneByTelegramId(userId)
      if (!user || user.role !== UserRole.EMPLOYEE) {
        await ctx.answerCbQuery('Опрос только для Сотрудников', { show_alert: true } as any)
        return
      }
      
      const pollKey = `${chatId}:shift_poll`
      let poll = this.pollsService.getShiftPoll(pollKey)
      if (!poll) {
        poll = await this.pollsService.restoreShiftPoll(pollKey)
      }
      if (!poll) {
        await ctx.answerCbQuery('Опрос не найден', { show_alert: true } as any)
        return
      }
      
      if (poll.closed) {
        await ctx.answerCbQuery('Опрос завершён, голосование недоступно', { show_alert: true } as any)
        return
      }
      
      // Remove from "not going" if exists
      poll.notGoing = poll.notGoing.filter(u => u !== username)
      // Add to "going" if not already there
      if (!poll.going.includes(username)) {
        poll.going.push(username)
      }
      
      // Check if all employees voted
      const allVoted = await this.checkAndClosePollIfComplete(chatId, poll, ctx, pollKey)
      
      if (!allVoted) {
        const goingText = await this.formatShiftPollText(poll.going, 'Выхожу')
        const notGoingText = await this.formatShiftPollText(poll.notGoing, 'Не выхожу')
        const updatedText = `📋 Опрос: Кто завтра выходит на смену?\n⏱ Время на ответ: 30 минут\n\n${goingText}\n${notGoingText}`
        await ctx.telegram.editMessageText(chatId, poll.messageId, undefined, updatedText, {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Выхожу', callback_data: `poll_yes:${chatId}` },
                { text: '❌ Не выхожу', callback_data: `poll_no:${chatId}` },
              ],
              [{ text: '📊 Результаты (Менеджеры)', callback_data: `poll_results:${chatId}` }],
            ],
          },
        } as any)
      }
      
      await this.pollsService.saveShiftPollState(pollKey)
      await ctx.answerCbQuery('Ваш ответ учтён: Выхожу')
    } catch (e) {
      Logger.warn(`poll_yes failed: ${String(e)}`, 'AppUpdate')
    }
  }

  @Action(/^poll_no:\-?\d+$/)
  async pollNo(@Ctx() ctx: Context) {
    try {
      const cb = (ctx.update as any).callback_query
      const data: string = cb?.data
      const [_, chatIdStr] = data.split(':')
      const chatId = Number(chatIdStr)
      const userId = String(ctx.from?.id)
      const username = ctx.from?.username || userId
      
      const user = await this.usersService.findOneByTelegramId(userId)
      if (!user || user.role !== UserRole.EMPLOYEE) {
        await ctx.answerCbQuery('Опрос только для Сотрудников', { show_alert: true } as any)
        return
      }
      
      const pollKey = `${chatId}:shift_poll`
      let poll = this.pollsService.getShiftPoll(pollKey)
      if (!poll) {
        poll = await this.pollsService.restoreShiftPoll(pollKey)
      }
      if (!poll) {
        await ctx.answerCbQuery('Опрос не найден', { show_alert: true } as any)
        return
      }
      
      if (poll.closed) {
        await ctx.answerCbQuery('Опрос завершён, голосование недоступно', { show_alert: true } as any)
        return
      }
      
      // Remove from "going" if exists
      poll.going = poll.going.filter(u => u !== username)
      // Add to "not going" if not already there
      if (!poll.notGoing.includes(username)) {
        poll.notGoing.push(username)
      }
      
      // Check if all employees voted
      const allVoted = await this.checkAndClosePollIfComplete(chatId, poll, ctx, pollKey)
      
      if (!allVoted) {
        const goingText = await this.formatShiftPollText(poll.going, 'Выхожу')
        const notGoingText = await this.formatShiftPollText(poll.notGoing, 'Не выхожу')
        const updatedText = `📋 Опрос: Кто завтра выходит на смену?\n⏱ Время на ответ: 30 минут\n\n${goingText}\n${notGoingText}`
        await ctx.telegram.editMessageText(chatId, poll.messageId, undefined, updatedText, {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Выхожу', callback_data: `poll_yes:${chatId}` },
                { text: '❌ Не выхожу', callback_data: `poll_no:${chatId}` },
              ],
              [{ text: '📊 Результаты (Менеджеры)', callback_data: `poll_results:${chatId}` }],
            ],
          },
        } as any)
      }
      
      await this.pollsService.saveShiftPollState(pollKey)
      await ctx.answerCbQuery('Ваш ответ учтён: Не выхожу')
    } catch (e) {
      Logger.warn(`poll_no failed: ${String(e)}`, 'AppUpdate')
    }
  }

  @Action(/^poll_results:\-?\d+$/)
  async pollResults(@Ctx() ctx: Context) {
    try {
      const cb = (ctx.update as any).callback_query
      const data: string = cb?.data
      const [_, chatIdStr] = data.split(':')
      const chatId = Number(chatIdStr)
      const userId = String(ctx.from?.id)

      const isGroupAdmin = await isAdmin(ctx)
      const user = await this.usersService.findOneByTelegramId(userId)
      if (!isGroupAdmin && (!user || !hasRole(user, UserRole.MANAGER))) {
        await ctx.answerCbQuery('Только для Менеджеров и выше или администраторов группы', { show_alert: true } as any)
        return
      }
      
      const pollKey = `${chatId}:shift_poll`
      let poll = this.pollsService.getShiftPoll(pollKey)
      if (!poll) {
        poll = await this.pollsService.restoreShiftPoll(pollKey)
      }
      if (!poll) {
        await ctx.answerCbQuery('Опрос не найден', { show_alert: true } as any)
        return
      }
      
      // Close poll when results are viewed
      if (!poll.closed) {
        // Prevent closing if nobody is going
        if ((poll.going?.length || 0) === 0) {
          await ctx.answerCbQuery('Никто не выходит. Опрос остаётся открытым. Выберите хотя бы одного сотрудника.', { show_alert: true } as any)
          return
        }
        poll.closed = true
        if (poll.timeout) {
          clearTimeout(poll.timeout)
          poll.timeout = undefined
        }
        
        const goingList = poll.going.length > 0 ? poll.going.map(u => `@${u}`).join(', ') : 'никто'
        const notGoingList = poll.notGoing.length > 0 ? poll.notGoing.map(u => `@${u}`).join(', ') : 'никто'
        
        // Update poll message to show it's closed
        try {
          await ctx.telegram.editMessageText(
            chatId, 
            poll.messageId, 
            undefined, 
            `📋 Опрос завершён (результаты просмотрены)\n\n✅ Выходят (${poll.going.length}): ${goingList}\n❌ Не выходят (${poll.notGoing.length}): ${notGoingList}`,
            { reply_markup: { inline_keyboard: [] } } as any
          )
        } catch (e) {
          Logger.warn(`Failed to update poll message: ${String(e)}`, 'AppUpdate')
        }
        
        await this.pollsService.markShiftPollClosed(pollKey)
        await this.pollsService.saveShiftPollState(pollKey, { closed: true, expiresAt: null })

        // Create work shift records
        await this.createWorkShiftRecords(poll)
      }
      
      const goingList = poll.going.length > 0 ? poll.going.map(u => `  @${u}`).join('\n') : '  (никто)'
      const notGoingList = poll.notGoing.length > 0 ? poll.notGoing.map(u => `  @${u}`).join('\n') : '  (никто)'
      
      const resultsText = `📊 Детальные результаты:\n\n✅ Выходят (${poll.going.length}):\n${goingList}\n\n❌ Не выходят (${poll.notGoing.length}):\n${notGoingList}`
      
      await this.pollsService.saveShiftPollState(pollKey)
      await ctx.answerCbQuery()
      await ctx.reply(resultsText)
    } catch (e) {
      Logger.warn(`poll_results failed: ${String(e)}`, 'AppUpdate')
    }
  }

  @Action(/^sync_poll_yes:\-?\d+$/)
  async syncPollYes(@Ctx() ctx: Context) {
    console.log('*** SYNC_POLL_YES TRIGGERED ***')
    this.logger.log(`syncPollYes action triggered`)
    try {
        const cb = (ctx.update as any).callback_query
        const data: string = cb?.data
        this.logger.log(`syncPollYes callback data=${data}`)
        const [_, chatIdStr] = data.split(':')
        const chatId = Number(chatIdStr)
        const userId = String(ctx.from?.id)
        const username = ctx.from?.username || userId
        this.logger.log(`syncPollYes parsed: chatId=${chatId}, userId=${userId}, username=${username}`)
        
        const user = await this.usersService.findOneByTelegramId(userId)
        this.logger.log(`syncPollYes user found=${!!user}, role=${user?.role}`)
        if (!user || user.role !== UserRole.EMPLOYEE) {
          await ctx.answerCbQuery('Эта опция только для сотрудников', { show_alert: true } as any)
          return
        }
        
        const pollKey = `${chatId}:sync_poll`
        this.logger.log(`syncPollYes: Getting poll with key=${pollKey}`)
        const poll = this.pollsService.getSyncPoll(pollKey)
        this.logger.log(`syncPollYes: Poll found=${!!poll}, closed=${poll?.closed}`)
        if (!poll || poll.closed) {
          await ctx.answerCbQuery('Опрос завершён или не найден')
          return
        }
        
        // Toggle user vote
        const index = poll.going.indexOf(username)
        if (index > -1) {
          poll.going.splice(index, 1)
        } else {
          poll.going.push(username)
        }
        
        // Update message
        const goingCount = poll.going.length
        await ctx.telegram.editMessageText(
          chatId, 
          poll.messageId, 
          undefined, 
          `📋 Опрос: Кто сегодня на смене?\n⏱ Время на ответ: 10 минут\n\n✅ На смене: ${goingCount}`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ На смене', callback_data: `sync_poll_yes:${chatId}` },
                ],
                [{ text: '📊 Результаты (Менеджеры)', callback_data: `sync_poll_results:${chatId}` }],
                [{ text: '✅ Завершить и сохранить (Менеджеры)', callback_data: `sync_poll_close:${chatId}` }],
              ],
            },
          } as any
        )
        
        await ctx.answerCbQuery(index > -1 ? 'Ваш ответ отменён' : 'Ваш ответ учтён: На смене')
      } catch (e) {
        this.logger.warn(`sync_poll_yes failed: ${String(e)}`)
      }
  }

  @Action(/^sync_poll_results:\-?\d+$/)
  async syncPollResults(@Ctx() ctx: Context) {
    try {
      const cb = (ctx.update as any).callback_query
      const data: string = cb?.data
      const [_, chatIdStr] = data.split(':')
      const chatId = Number(chatIdStr)
      const userId = String(ctx.from?.id)

      const isGroupAdmin = await isAdmin(ctx)
      const user = await this.usersService.findOneByTelegramId(userId)
      if (!isGroupAdmin && (!user || !hasRole(user, UserRole.MANAGER))) {
        await ctx.answerCbQuery('У вас нет прав для просмотра результатов', { show_alert: true } as any)
        return
      }
      
      const pollKey = `${chatId}:sync_poll`
      const poll = this.pollsService.getSyncPoll(pollKey)
      if (!poll) {
        await ctx.answerCbQuery('Опрос не найден')
        return
      }
      
      const goingList = poll.going.length > 0 ? poll.going.map(u => `@${u}`).join(', ') : 'никто'
      
      const resultsText = `📊 Результаты опроса "Кто сегодня на смене?":\n\n✅ На смене (${poll.going.length}): ${goingList}`
      
      await ctx.answerCbQuery()
      await ctx.reply(resultsText)
    } catch (e) {
      Logger.warn(`sync_poll_results failed: ${String(e)}`, 'AppUpdate')
    }
  }

  private async closeSyncPoll(chatId: number, pollKey: string, poll: any): Promise<void> {
    try {
      if (poll.timeout) {
        clearTimeout(poll.timeout)
      }
      poll.closed = true
      
      if (poll.going.length > 0) {
        // Determine local today range
        const today = new Date()
        const startOfToday = new Date(Date.UTC(
          today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0
        ))
        
        // Create shift records for today
        const employeeCount = poll.going.length
        const shiftValue = employeeCount === 1 ? 1 : parseFloat((1 / employeeCount).toFixed(1))
        const baseRate = 1400

        for (const username of poll.going) {
          try {
            const user = await this.usersService.findOneByLogin(username)
            if (!user) {
              Logger.warn(`User not found in DB for username: ${username}`, 'AppUpdate')
              continue
            }

            await this.workShiftsService.create({
              telegramId: user.telegramId,
              login: user.login,
              chatId: String(chatId),
              shiftDate: startOfToday,
              baseRate,
              shift: shiftValue,
              itemsIssued: 0,
              comment: 'Автоматически создано из опроса синхронизации'
            })

            Logger.log(`Sync work shift created for ${username} (${user.telegramId}), shift: ${shiftValue}`, 'AppUpdate')
          } catch (e) {
            Logger.warn(`Failed to create sync work shift for ${username}: ${String(e)}`, 'AppUpdate')
          }
        }

        const goingList = poll.going.map((u: string) => `@${u}`).join(', ')
        await this.bot.telegram.editMessageText(
          chatId, 
          poll.messageId, 
          undefined, 
          `📋 Опрос завершён (автоматически созданы смены на сегодня)\n\n✅ На смене (${poll.going.length}): ${goingList}`,
          { reply_markup: { inline_keyboard: [] } } as any
        )
        
        Logger.log(`Sync poll closed: ${poll.going.length} employees on shift today for chatId=${chatId}`, 'AppUpdate')
      } else {
        await this.bot.telegram.editMessageText(
          chatId, 
          poll.messageId, 
          undefined, 
          '📋 Опрос завершён, но никто не выбрал сегодня смену.\n\nЕсли нужно записать смену, повторите команду /pollsync',
          { reply_markup: { inline_keyboard: [] } } as any
        )
        Logger.log(`Sync poll closed: no one on shift today for chatId=${chatId}`, 'AppUpdate')
      }
      
      this.pollsService.deleteSyncPoll(pollKey)
    } catch (e) {
      Logger.error(`Failed to close sync poll: ${String(e)}`, 'AppUpdate')
    }
  }

  @Action(/^sync_poll_close:\-?\d+$/)
  async syncPollClose(@Ctx() ctx: Context) {
    try {
      const cb = (ctx.update as any).callback_query
      const data: string = cb?.data
      const [_, chatIdStr] = data.split(':')
      const chatId = Number(chatIdStr)
      const userId = String(ctx.from?.id)

      const isGroupAdmin = await isAdmin(ctx)
      const user = await this.usersService.findOneByTelegramId(userId)
      if (!isGroupAdmin && (!user || !hasRole(user, UserRole.MANAGER))) {
        await ctx.answerCbQuery('У вас нет прав для завершения опроса', { show_alert: true } as any)
        return
      }
      
      const pollKey = `${chatId}:sync_poll`
      const poll = this.pollsService.getSyncPoll(pollKey)
      if (!poll) {
        await ctx.answerCbQuery('Опрос не найден')
        return
      }
      
      await this.closeSyncPoll(chatId, pollKey, poll)
      await ctx.answerCbQuery('Опрос завершён и смены созданы')
    } catch (e) {
      Logger.warn(`sync_poll_close failed: ${String(e)}`, 'AppUpdate')
    }
  }

  @Action(/retry_verify:\-?\d+:\d+/)
  async retryVerification(@Ctx() ctx: Context) {
    try {
      const cb = (ctx.update as any).callback_query
      const data: string = cb?.data
      const fromId: number | undefined = ctx.from?.id
      const [_, chatIdStr, userIdStr] = data.split(':')
      const chatId = Number(chatIdStr)
      const userId = Number(userIdStr)
      if (!fromId || fromId !== userId) {
        await ctx.answerCbQuery('Это подтверждение не для вас', { show_alert: true } as any)
        return
      }
      // Delete old retry message
      try {
        await ctx.deleteMessage()
      } catch (e) {
        Logger.warn(`Failed to delete retry message: ${String(e)}`, 'AppUpdate')
      }
      // Send new verification request
      const verifyData = `verify:${chatId}:${userId}`
      const verificationMsg = await ctx.reply(
        `Повторная попытка. Подтвердите, что вы не бот, нажав кнопку ниже в течение 3 часов.`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: 'Я не бот ✅', callback_data: verifyData }]],
          },
        } as any,
      )
      // Set new timeout
      const key = `${chatId}:${userId}`
      const username = ctx.from?.username
      const timeout = setTimeout(async () => {
        try {
          await ctx.telegram.deleteMessage(chatId, (verificationMsg as any).message_id)
          const retryData = `retry_verify:${chatId}:${userId}`
          await ctx.reply(
            `@${username ?? userId} не подтвердил(а) участие вовремя. Доступ ограничен. Для повторной попытки нажмите кнопку ниже.`,
            {
              reply_markup: {
                inline_keyboard: [[{ text: 'Запросить повторно 🔄', callback_data: retryData }]],
              },
            } as any,
          )
        } catch (e) {
          Logger.warn(`Retry timeout handling failed for ${userId}: ${String(e)}`, 'AppUpdate')
        } finally {
          pendingVerifications.delete(key)
        }
      }, 3 * 60 * 60 * 1000)
      pendingVerifications.set(key, timeout)
      await ctx.answerCbQuery('Новый запрос отправлен!')
    } catch (e) {
      Logger.warn(`Retry verification failed: ${String(e)}`, 'AppUpdate')
    }
  }

}
