import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const PORT = parseInt(process.env.PORT, 10) || 5000
  const app = await NestFactory.create(AppModule)

  // Handle unhandled promise rejections (e.g., Redis connection errors)
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    const logger = new Logger('Bootstrap')
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
  })

  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    const logger = new Logger('Bootstrap')
    logger.error('Uncaught Exception:', error)
  })

  await app.listen(PORT, () => Logger.log(`Server TELEBOT started on port ${PORT}`, 'Bootstrap'))
}
bootstrap()
