import {Column, DataType, Model, Table} from 'sequelize-typescript';

export enum UserRole {
    EMPLOYEE = 'Сотрудник',
    MANAGER = 'Менеджер',
    DIRECTOR = 'Управляющий',
}

interface UserCreationAttrs {
    login: string,
    firstName?: string | null,
    lastName?: string | null,
    telegramId?: string | null,
    isBot?: boolean,
    languageCode?: string | null,
    role?: UserRole,
}

@Table
export class User extends Model<User, UserCreationAttrs> {
    @Column({type: DataType.INTEGER, unique: true, autoIncrement: true, primaryKey: true})
    id: number;

    @Column({type: DataType.STRING, unique: true, allowNull: false})
    login: string;

    @Column({type: DataType.STRING, allowNull: true})
    firstName: string;

    @Column({type: DataType.STRING, allowNull: true})
    lastName: string;

    @Column({type: DataType.BIGINT, allowNull: true, unique: true})
    telegramId: string;

    @Column({type: DataType.BOOLEAN, allowNull: true})
    isBot: boolean;

    @Column({type: DataType.STRING, allowNull: true})
    languageCode: string;

    @Column({type: DataType.BOOLEAN, defaultValue: true })
    isActive: boolean;

    @Column({type: DataType.BOOLEAN, defaultValue: false})
    banned: boolean;

    @Column({type: DataType.STRING, allowNull: true})
    banReason: string;

    @Column({type: DataType.ENUM(...Object.values(UserRole)), defaultValue: UserRole.EMPLOYEE})
    role: UserRole;

}


