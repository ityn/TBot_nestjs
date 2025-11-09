import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConsoleLogger, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

function formatDateForFilename(date: Date, timezone: string): string {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  };
  const formatted = new Intl.DateTimeFormat('sv-SE', options).format(date); // 2025-11-09 19:26:00
  return formatted.replace(' ', 'T').replace(/:/g, '-');
}

function computeTimezoneOffset(date: Date, timezone: string): string {
  const localDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
  const offsetMinutes = Math.round((localDate.getTime() - date.getTime()) / 60000);
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absMinutes / 60)
    .toString()
    .padStart(2, '0');
  const minutes = Math.abs(absMinutes % 60)
    .toString()
    .padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
}

class FileLogger extends ConsoleLogger {
  private readonly stream: fs.WriteStream;

  constructor(private readonly filePath: string, private readonly timezone: string) {
    super();
    this.ensureLogFile();
    this.stream = fs.createWriteStream(this.filePath, { flags: 'a' });
    this.write('INFO', 'Logger initialized', FileLogger.name);
  }

  log(message: any, context?: string) {
    super.log(message, context);
    this.write('INFO', this.stringify(message), context);
  }

  error(message: any, trace?: string, context?: string) {
    super.error(message, trace, context);
    this.write('ERROR', this.stringify(message), context, trace);
  }

  warn(message: any, context?: string) {
    super.warn(message, context);
    this.write('WARN', this.stringify(message), context);
  }

  debug(message: any, context?: string) {
    super.debug(message, context);
    this.write('DEBUG', this.stringify(message), context);
  }

  verbose(message: any, context?: string) {
    super.verbose(message, context);
    this.write('VERBOSE', this.stringify(message), context);
  }

  close() {
    if (!this.stream.destroyed) {
      this.stream.end();
    }
  }

  private ensureLogFile() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, '', { flag: 'w' });
    }
  }

  private write(level: string, message: string, context?: string, trace?: string) {
    const now = new Date();
    const formattedDate = new Intl.DateTimeFormat('sv-SE', {
      timeZone: this.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(now);
    const tzOffset = computeTimezoneOffset(now, this.timezone);
    const contextPart = context ? ` [${context}]` : '';
    const tracePart = trace ? `\n${trace}` : '';
    this.stream.write(`[${formattedDate} ${tzOffset} (${this.timezone})] [${level}]${contextPart} ${message}${tracePart}\n`);
  }

  private stringify(message: any): string {
    if (typeof message === 'string') {
      return message;
    }
    try {
      return JSON.stringify(message);
    } catch {
      return String(message);
    }
  }
}

async function bootstrap() {
  const PORT = parseInt(process.env.PORT, 10) || 5000;
  const timezone = process.env.LOG_TIMEZONE || process.env.TIMEZONE || 'Asia/Novosibirsk';
  const logDirectory = path.resolve(process.cwd(), 'log');
  const timestamp = formatDateForFilename(new Date(), timezone);
  const logFilePath = path.join(logDirectory, `bot-${timestamp}.log`);
  const fileLogger = new FileLogger(logFilePath, timezone);

  const cleanup = () => fileLogger.close();
  process.on('beforeExit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });

  const app = await NestFactory.create(AppModule, {
    logger: fileLogger,
  });

  Logger.log = fileLogger.log.bind(fileLogger) as typeof Logger.log;
  Logger.error = fileLogger.error.bind(fileLogger) as typeof Logger.error;
  Logger.warn = fileLogger.warn.bind(fileLogger) as typeof Logger.warn;
  Logger.debug = fileLogger.debug.bind(fileLogger) as typeof Logger.debug;
  Logger.verbose = fileLogger.verbose.bind(fileLogger) as typeof Logger.verbose;

  // Handle unhandled promise rejections (e.g., Redis connection errors)
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    const logger = new Logger('Bootstrap');
    logger.error(`Unhandled Rejection at: ${promise}`, reason instanceof Error ? reason.stack : String(reason));
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    const logger = new Logger('Bootstrap');
    logger.error('Uncaught Exception', error.stack || error.message);
  });

  await app.listen(PORT, () => Logger.log(`Server TELEBOT started on port ${PORT}`, 'Bootstrap'));
}
bootstrap();
