import { Module } from '@nestjs/common';
import { AppUpdate } from './app.update';
import { AppService } from './app.service';
import { TelegrafModule } from 'nestjs-telegraf';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as Joi from 'joi';
import { HttpModule } from '@nestjs/axios';
import { DatabaseModule } from './database/database.module';
import { createRedisSession } from './database/database.session';
import { UsersModule } from './database/models/users/users.module';
import { WorkShiftsModule } from './database/models/work-shifts/work-shifts.module';
import { ChatsModule } from './database/models/chats/chats.module';
import { TelegramModule } from './telegram/telegram.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { PollsModule } from './polls/polls.module';

@Module({
  imports: [
      ConfigModule.forRoot({
          envFilePath: [`.env.${process.env.NODE_ENV}`, '.env'],
          isGlobal: true,
          validationSchema: Joi.object({
            BOT_TOKEN: Joi.string().required(),
            DATABASE_HOST: Joi.string().required(),
            DATABASE_PORT: Joi.number().default(5432),
            DATABASE_USERNAME: Joi.string().required(),
            DATABASE_PASSWORD: Joi.string().allow('').optional(),
            DATABASE_DATABASE: Joi.string().required(),
            REDIS_HOST: Joi.string().default('127.0.0.1'),
            REDIS_PORT: Joi.number().empty('').default(6379),
            REDIS_USERNAME: Joi.string().allow('').optional(),
            REDIS_PASSWORD: Joi.string().allow('').optional(),
            REDIS_DATABASE: Joi.number().empty('').default(0),
            BOT_SESSION_PREFIX: Joi.string().default('tsess'),
            TELEGRAM_API_ID: Joi.number().optional(),
            TELEGRAM_API_HASH: Joi.string().optional(),
            TELEGRAM_SESSION: Joi.string().allow('').optional(),
            TIMEZONE: Joi.string().default('Asia/Novosibirsk'),
          })
      }),
      DatabaseModule,
      UsersModule,
      WorkShiftsModule,
      ChatsModule,
      TelegramModule,
      PollsModule,
      HttpModule.registerAsync({
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: async (config: ConfigService) => ({
          baseURL: config.get<string>('HTTP_BASE_URL') || undefined,
          timeout: Number(config.get<string>('HTTP_TIMEOUT') ?? 5000),
          maxRedirects: Number(config.get<string>('HTTP_MAX_REDIRECTS') ?? 5),
        }),
      }),
      TelegrafModule.forRootAsync({
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: async (configService: ConfigService) => ({
          middlewares: [createRedisSession(configService).middleware()],
          token: configService.get<string>('BOT_TOKEN') as string,
        })
      }),
      SchedulerModule
  ],
  controllers: [],
  providers: [AppService, AppUpdate],
})
export class AppModule {}
