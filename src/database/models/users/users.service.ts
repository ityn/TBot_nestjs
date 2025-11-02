import {Inject, Injectable} from "@nestjs/common";
import {User, UserRole} from "./user.entity";
import {UserDto} from "./dto/user.dto";


@Injectable()
export class UsersService {
    constructor(
        @Inject('USERS_REPOSITORY')
        private usersRepository: typeof User
    ) {}

    async create(user: UserDto): Promise<User> {
        return await this.usersRepository.create<User>(user)
    }

    async findAll(): Promise<User[]>{
        return this.usersRepository.findAll<User>()
    }

    async findOneByLogin(login: string): Promise<User> {
        return await this.usersRepository.findOne<User>({ where: { login }})
    }

    async findOneByTelegramId(telegramId: string): Promise<User> {
        return await this.usersRepository.findOne<User>({ where: { telegramId }})
    }

    async updateRole(telegramId: string, role: UserRole): Promise<[number, User[]]> {
        return await this.usersRepository.update({ role }, { where: { telegramId }, returning: true })
    }

    async findAllByRole(role: UserRole): Promise<User[]> {
        return await this.usersRepository.findAll<User>({ where: { role, isBot: false }})
    }

    async countByRole(role: UserRole): Promise<number> {
        return await this.usersRepository.count({ where: { role, isBot: false }})
    }
}