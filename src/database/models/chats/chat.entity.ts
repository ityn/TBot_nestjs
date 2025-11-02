import { Column, DataType, Model, Table } from 'sequelize-typescript';

interface ChatCreationAttrs {
    chatId: string;
    title?: string | null;
    type?: string | null;
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
}

