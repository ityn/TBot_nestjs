import { Column, DataType, Model, Table } from 'sequelize-typescript';

export type ShiftPollSource = 'manual' | 'scheduler';

interface ShiftPollCreationAttrs {
  chatId: string;
  messageId: number;
  going?: string[];
  notGoing?: string[];
  expiresAt?: Date | null;
  closed?: boolean;
  source?: ShiftPollSource;
  extensionCount?: number;
  startedAt?: Date;
}

@Table({ tableName: 'shift_polls' })
export class ShiftPollEntity extends Model<ShiftPollEntity, ShiftPollCreationAttrs> {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  id: number;

  @Column({ type: DataType.BIGINT, allowNull: false, unique: 'shift_polls_chat_message_unique' })
  chatId: string;

  @Column({ type: DataType.BIGINT, allowNull: false, unique: 'shift_polls_chat_message_unique' })
  messageId: number;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: [] })
  going: string[];

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: [] })
  notGoing: string[];

  @Column({ type: DataType.DATE, allowNull: true })
  expiresAt: Date | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  closed: boolean;

  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'manual' })
  source: ShiftPollSource;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  extensionCount: number;

  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  startedAt: Date;
}


