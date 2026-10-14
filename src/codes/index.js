// Номер записи для пользователя (для /forget и /cancelremind) — как в прежней версии:
// время в миллисекундах в 36-ричной записи, например «mgq3x1k2»
export const createCode = () => Date.now().toString(36);
