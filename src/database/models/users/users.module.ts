import {Module} from "@nestjs/common";
import {DatabaseModule} from "../../database.module";
import {UsersService} from "./users.service";
import {usersProviders} from "./users.providers";
import {UsersController} from "./users.controller";



@Module({
    imports: [DatabaseModule],
    controllers: [UsersController],
    providers: [
        UsersService,
        ...usersProviders,
    ],
    exports: [UsersService],
})

export class UsersModule{}