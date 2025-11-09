import { Column, DataType, Model, Table } from 'sequelize-typescript';

export type ChatEnvironment = 'prod' | 'dev';

interface ChatCreationAttrs {
    chatId: string;
    title?: string | null;
    type?: string | null;
    isActive?: boolean;
    environment?: ChatEnvironment;
}

@Table({ tableName: 'chats' })
export class Chat extends Model<Chat, ChatCreationAttrs> {
    @Column({ type: DataType.INTEGER, unique: true, autoIncrement: true, primaryKey: true })
    id: number;

    @Column({ type: DataType.BIGINT, allowNull: false, unique: true })
    chatId: string;

    @Column({ type: DataType.STRING, allowNull: true })
    title: string;

    @Column({ type: DataType.STRING, allowNull: true })
    type: string;

    @Column({ type: DataType.DATE, allowNull: true, defaultValue: DataType.NOW })
    addedAt: Date;

    @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
    isActive: boolean;

    @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'prod' })
    environment: ChatEnvironment;
}

