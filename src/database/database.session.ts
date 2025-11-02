import { ConfigService } from '@nestjs/config'
import { Logger } from '@nestjs/common'
 
const RedisSession = require('telegraf-session-redis')

export function createRedisSession(config: ConfigService) {
    const logger = new Logger('RedisSession')
    const host = config.get<string>('REDIS_HOST') ?? '127.0.0.1'
    const port = Number(config.get<string>('REDIS_PORT') ?? 6379)
    const username = config.get<string>('REDIS_USERNAME') || undefined
    const password = config.get<string>('REDIS_PASSWORD') || undefined
    const db = config.get<number>('REDIS_DATABASE') as unknown as number | undefined
    const prefix = config.get<string>('BOT_SESSION_PREFIX') || 'tsess'

    const session = new RedisSession({
        store: {
            host,
            port,
            username,
            password,
            db,
            prefix,
            retry_strategy: (options: any) => {
                if (options.error) {
                    if (options.error.code === 'ECONNREFUSED') {
                        logger.error('Redis connection refused. Retrying...')
                    } else if (options.error.code === 'ECONNRESET') {
                        logger.error('Redis connection reset. Retrying...')
                    } else if (options.error.code === 'ETIMEDOUT') {
                        logger.error('Redis connection timeout. Retrying...')
                    } else {
                        logger.error(`Redis error: ${options.error.code || options.error.message}. Retrying...`)
                    }
                }
                if (options.total_retry_time > 1000 * 60 * 60) {
                    logger.error('Redis retry time exceeded')
                    return new Error('Retry time exhausted')
                }
                if (options.attempt > 10) {
                    logger.error('Redis retry attempts exceeded')
                    return undefined
                }
                return Math.min(options.attempt * 100, 3000)
            },
        },
    })

    // Handle connection errors - prevent crashes on ECONNRESET
    const client = session.client
    if (client) {
        client.on('error', (err: Error) => {
            logger.error(`Redis error: ${err.message}`, err.stack)
        })
        client.on('connect', () => {
            logger.log('Redis connected successfully')
        })
        client.on('reconnecting', (delay: number) => {
            logger.warn(`Redis reconnecting in ${delay}ms`)
        })
        client.on('end', () => {
            logger.warn('Redis connection ended')
        })
        client.on('ready', () => {
            logger.log('Redis client ready')
        })
    }

    // Wrap middleware to handle Redis errors gracefully
    const originalMiddleware = session.middleware()
    session.middleware = () => {
        return async (ctx: any, next: any) => {
            try {
                await originalMiddleware(ctx, next)
            } catch (err: any) {
                logger.error(`Session middleware error: ${err?.message || String(err)}`)
                // Continue to next middleware even if session failed
                await next()
            }
        }
    }

    return session
}