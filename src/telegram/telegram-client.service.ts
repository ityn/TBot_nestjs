import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { UsersService } from '../database/models/users/users.service';
import * as readline from 'readline';

@Injectable()
export class TelegramClientService {
  private client: TelegramClient | null = null;
  private isConnecting: boolean = false;
  private readonly logger = new Logger(TelegramClientService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  private async ensureConnected(): Promise<boolean> {
    // Already connected
    if (this.client && this.client.connected) {
      return true;
    }

    // Already trying to connect
    if (this.isConnecting) {
      this.logger.debug('Connection already in progress, waiting...');
      // Wait for connection to complete
      await new Promise(resolve => setTimeout(resolve, 2000));
      return this.client?.connected || false;
    }

    const apiId = Number(this.configService.get<string>('TELEGRAM_API_ID'));
    const apiHash = this.configService.get<string>('TELEGRAM_API_HASH') as string;
    const sessionString = this.configService.get<string>('TELEGRAM_SESSION') || '';

    if (!apiId || !apiHash) {
      this.logger.warn('TELEGRAM_API_ID or TELEGRAM_API_HASH not set. MTProto client disabled.');
      return false;
    }

    if (!sessionString) {
      this.logger.warn('TELEGRAM_SESSION is not set. Skipping MTProto connection. Provide a valid session to enable full sync.');
      return false;
    }

    this.isConnecting = true;

    try {
      this.logger.log('Connecting to Telegram MTProto...');
      const session = new StringSession(sessionString);
      this.client = new TelegramClient(session, apiId, apiHash, {
        connectionRetries: 5,
      });

      await this.client.start({
        phoneNumber: async () => await this.input('Enter your phone number: '),
        password: async () => await this.input('Enter your password (if 2FA enabled): '),
        phoneCode: async () => await this.input('Enter the code you received: '),
        onError: (err) => this.logger.error(`Auth error: ${err}`),
      });

      this.logger.log('Telegram MTProto client connected and authorized.');

      // Save session string for future use
      const newSession = this.client.session.save() as unknown as string;
      if (newSession !== sessionString) {
        this.logger.warn(`Updated session. Save this to .env:\nTELEGRAM_SESSION=${newSession}`);
      }

      return true;
    } catch (e) {
      this.logger.error(`Failed to connect MTProto client: ${String(e)}`);
      this.client = null;
      return false;
    } finally {
      this.isConnecting = false;
    }
  }

  private async input(prompt: string): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    return new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }

  async syncAllMembers(chatId: number): Promise<void> {
    // Connect only when needed
    const connected = await this.ensureConnected();
    if (!connected) {
      this.logger.warn('MTProto client not available, skipping full member sync.');
      return;
    }

    try {
      this.logger.log(`Syncing all members for chatId=${chatId}...`);
      const entity = await this.client!.getEntity(chatId);
      const participants = await this.client!.getParticipants(entity as any, { limit: 10000 });

      for (const p of participants) {
        if (!('id' in p)) continue;
        const user = p as Api.User;
        const telegramId = String(user.id);
        const login = user.username || telegramId;
        const firstName = user.firstName || null;
        const lastName = user.lastName || null;
        const languageCode = (user as any).langCode || null;

        const existsByTg = await this.usersService.findOneByTelegramId(telegramId);
        if (!existsByTg) {
          await this.usersService.create({
            login,
            firstName,
            lastName,
            telegramId,
            isBot: user.bot || false,
            languageCode,
          });
          this.logger.debug(`User synced: ${login} (${telegramId})`);
        } else {
          existsByTg.firstName = firstName || existsByTg.firstName;
          existsByTg.lastName = lastName || existsByTg.lastName;
          existsByTg.languageCode = languageCode || existsByTg.languageCode;
          await existsByTg.save();
          this.logger.debug(`User updated: ${login} (${telegramId})`);
        }
      }

      this.logger.log(`Synced ${participants.length} members for chatId=${chatId}`);
    } catch (e) {
      this.logger.error(`Failed to sync all members: ${String(e)}`);
    } finally {
      // Disconnect after sync to free resources
      await this.disconnect();
    }
  }

  async disconnect(): Promise<void> {
    if (this.client && this.client.connected) {
      try {
        await this.client.disconnect();
        this.logger.log('MTProto client disconnected.');
      } catch (e) {
        this.logger.warn(`Failed to disconnect MTProto client: ${String(e)}`);
      }
    }
  }
}

