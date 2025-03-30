const { USER_ROLES } = require('../utils/constants');
const User = require('../models/User');
const Certificate = require('../models/Certificate');
const BotService = require('../services/botService');
const moment = require('moment');

class UserController {
  constructor(bot) {
    this.bot = bot;
    this.botService = new BotService(bot);
  }

  initialize() {
    this.bot.start(this.handleStart.bind(this));
    this.bot.command('check', this.checkCertificate.bind(this));
    this.bot.help(this.handleHelp.bind(this));
    this.bot.catch((err) => console.error('Bot error:', err));
  }

  async handleStart(ctx) {
    try {
      const userId = ctx.from.id;
      const username = ctx.from.username;
      const firstName = ctx.from.first_name;
      const lastName = ctx.from.last_name || '';
      
      let user = await User.findOne({ telegramId: userId });
      
      if (!user) {
        user = new User({
          telegramId: userId,
          username,
          firstName,
          lastName,
          role: USER_ROLES.USER
        });
        await user.save();
      }

      const role = await this.botService.getUserRole(ctx);

      // Обновляем роль если изменилась
      if (user.role !== role && (role === USER_ROLES.ADMIN || role === USER_ROLES.OPERATOR)) {
        user.role = role;
        await user.save();
      }

      // Персонализированные приветствия
      if (role === USER_ROLES.ADMIN) {
        await ctx.replyWithMarkdown(`👮‍♂️ *Добро пожаловать, Администратор ${firstName}!*`);
        await this.botService.sendAdminPanel(ctx);
      } 
      else if (role === USER_ROLES.OPERATOR) {
        await ctx.replyWithMarkdown(`👨‍💻 *Добро пожаловать, Оператор ${firstName}!*\nИспользуйте /create для создания сертификатов`);
        await this.botService.sendOperatorPanel(ctx);
      } 
      else {
        await ctx.replyWithMarkdown(`
      👋 *Добро пожаловать, ${firstName}!*
      
      Вы можете проверить сертификаты транспортных средств. 
      
      📌 *Пример использования:*
      /check ABC123 - проверка по госномеру
      /check 1HGCM82633A123456 - проверка по VIN-номеру
      
      ℹ️ Для помощи используйте /help
        `);
      }

    } catch (error) {
      console.error('Start error:', error);
      await ctx.reply('⚠️ Ошибка при старте. Попробуйте позже.');
    }
  }

  async checkCertificate(ctx) {
    try {
      const query = ctx.message.text.replace('/check', '').trim().toUpperCase();
      
      if (!query) {
        return ctx.reply('ℹ️ Введите номер сертификата или госномер:\n/check ABC123');
      }

      const certificate = await Certificate.findOne({
        $or: [
          { licensePlate: query },
          { vin: query }
        ],
        status: 'approved'
      });

      if (!certificate) {
        return this.botService.sendCertificateNotFound(ctx, query);
      }

      await this.botService.sendCertificateDetails(ctx, certificate);

    } catch (error) {
      console.error('Check error:', error);
      await ctx.reply('⚠️ Ошибка при проверке сертификата');
    }
  }

  async handleHelp(ctx) {
    await this.botService.sendHelpMessage(ctx);
  }
}

module.exports = UserController;