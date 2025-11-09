import {Sequelize} from "sequelize-typescript";
import {User} from "./models/users/user.entity";
import {WorkShift} from "./models/work-shifts/work-shift.entity";
import {Chat} from "./models/chats/chat.entity";
import { ShiftPollEntity } from './models/shift-polls/shift-poll.entity';
import { ConfigService } from '@nestjs/config'
// import { join } from 'path'

export const databaseProviders = [
    {
        provide: 'SEQUELIZE',
        inject: [ConfigService],
        useFactory: async (config: ConfigService) => {
            const sequelize = new Sequelize({
                dialect: 'postgres',
                database: config.get<string>('DATABASE_DATABASE') as string,
                host: config.get<string>('DATABASE_HOST') as string,
                port: Number(config.get<string>('DATABASE_PORT') ?? 5432),
                username: config.get<string>('DATABASE_USERNAME') as string,
                password: String(config.get<string>('DATABASE_PASSWORD') ?? ''),
                //entities: join(__dirname, '**', '*.entity.{ts, js}'),
                //migrations: join(__dirname, '**', '*.migration.{ts,js}'),
            });
            sequelize.addModels([User, WorkShift, Chat, ShiftPollEntity]);
            
            // Fix shift column type if needed
            try {
                await sequelize.query(`
                    DO $$ 
                    BEGIN
                        -- Check if work_shifts table exists and shift column is VARCHAR
                        IF EXISTS (
                            SELECT 1 FROM information_schema.columns 
                            WHERE table_name = 'work_shifts' 
                            AND column_name = 'shift' 
                            AND data_type = 'character varying'
                        ) THEN
                            -- Convert VARCHAR to NUMERIC
                            ALTER TABLE work_shifts 
                            ALTER COLUMN shift TYPE DECIMAL(10,1) 
                            USING CASE 
                                WHEN shift IS NULL THEN NULL
                                WHEN shift ~ '^[0-9]+\\.?[0-9]*$' THEN shift::numeric(10,1)
                                ELSE NULL
                            END;
                        END IF;
                    END $$;
                `);
            } catch (e) {
                console.warn('Could not auto-fix shift column type:', e);
            }

            // Ensure default values for chats metadata
            try {
                await sequelize.query(`UPDATE chats SET "isActive" = TRUE WHERE "isActive" IS NULL`);
                await sequelize.query(`UPDATE chats SET "environment" = 'prod' WHERE "environment" IS NULL OR LENGTH(TRIM("environment")) = 0`);
            } catch (e) {
                console.warn('Could not backfill chats metadata defaults:', e);
            }
            
            await sequelize.sync({ alter: true });
            return sequelize;
        },
    },
];