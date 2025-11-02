import { Markup } from "telegraf";

export function actionButtons () {
    return Markup.keyboard(
        [
            [Markup.button.text(':Список задач'), Markup.button.text('Завершить')],
            [Markup.button.text('Редактирование'), Markup.button.text('Удаление')]
        ]
    )
        //.oneTime()
        .resize()
}

export function inlineMessageRatingKeyboard() {
    return Markup.inlineKeyboard([
        Markup.button.callback('👍', 'like'),
        Markup.button.callback('👎', 'dislike')
    ])
}