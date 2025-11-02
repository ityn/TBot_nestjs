import {Module} from "@nestjs/common";
import {WorkShiftsController} from "./work-shifts.controller";
import {WorkShiftsService} from "./work-shifts.service";
import {workShiftsProviders} from "./work-shifts.providers";

@Module({
    controllers: [WorkShiftsController],
    providers: [WorkShiftsService, ...workShiftsProviders],
    exports: [WorkShiftsService]
})
export class WorkShiftsModule {

}

