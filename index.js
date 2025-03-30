const { Telegraf, session } = require('telegraf');
const { connectDB } = require('./services/database');
const config = require('./config');
const UserController = require('./controllers/userController');
const AdminController = require('./controllers/adminController');
const OperatorController = require('./controllers/operatorController');

// Инициализация бота
const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

// Middleware
bot.use(session());

// Инициализация всех контроллеров
new UserController(bot).initialize();
new AdminController(bot).initialize(); // Добавлено
new OperatorController(bot).initialize(); // Добавлено

// Обработка ошибок
bot.catch((err, ctx) => {
  console.error(`Ошибка для ${ctx.updateType}`, err);
  ctx.reply('❌ Произошла ошибка при обработке вашего запроса');
});

// Подключение к БД и запуск бота
connectDB().then(() => {
  console.log('🤖 Бот запущен!');
  bot.launch();
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));