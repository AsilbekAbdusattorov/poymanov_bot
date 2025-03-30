const { Markup } = require('telegraf');
const config = require('../config');
const { 
  USER_ROLES, 
  COMMANDS,
  ACTIONS
} = require('../utils/constants');
const User = require('../models/User');
const Certificate = require('../models/Certificate');
const moment = require('moment');
const mongoose = require('mongoose');

class BotService {
  constructor(bot) {
    this.bot = bot;
  }

  async getUserRole(ctx) {
    try {
      const userId = ctx.from.id;
      
      // Check config first
      if (config.ADMIN_IDS.includes(userId.toString())) {
        return USER_ROLES.ADMIN;
      }
      
      if (config.OPERATOR_IDS.includes(userId.toString())) {
        return USER_ROLES.OPERATOR;
      }
      
      // Check database
      const user = await User.findOne({ telegramId: userId });
      return user ? user.role : USER_ROLES.USER;
    } catch (error) {
      console.error('Error getting user role:', error);
      return USER_ROLES.USER;
    }
  }

  async sendAdminPanel(ctx) {
    try {
      const keyboard = Markup.keyboard([
        [COMMANDS.USERS, COMMANDS.OPERATORS],
        [COMMANDS.PENDING, COMMANDS.STATS]
      ]).resize().oneTime();
      
      await ctx.reply('👮‍♂️ Админ панель:', keyboard);
    } catch (error) {
      console.error('Error sending admin panel:', error);
      await ctx.reply('⚠️ Ошибка при загрузке админ панели');
    }
  }

  async sendOperatorPanel(ctx) {
    try {
      const keyboard = Markup.keyboard([
        [COMMANDS.CREATE],
        [COMMANDS.HELP]
      ]).resize().oneTime();
      
      await ctx.reply('👨‍💻 Панель оператора:', keyboard);
    } catch (error) {
      console.error('Error sending operator panel:', error);
      await ctx.reply('⚠️ Ошибка при загрузке панели оператора');
    }
  }

  async sendCertificateDetails(ctx, certificate) {
    try {
      const formattedDate = certificate.approvedAt 
        ? moment(certificate.approvedAt).format('DD.MM.YYYY HH:mm')
        : 'Не указана';
      
      let message = `✅ *Сертификат найден!*\n\n`;
      message += `🚗 *Марка/модель:* ${certificate.carBrand} ${certificate.carModel}\n`;
      message += `🔢 *Госномер:* ${certificate.licensePlate}\n`;
      message += `🆔 *VIN:* ${certificate.vin}\n`;
      message += `📅 *Дата выдачи:* ${formattedDate}\n`;
      message += `📜 *Номер рулона:* ${certificate.rollNumber}`;
      
      await ctx.replyWithMarkdown(message);
      
      if (certificate.carPhoto) {
        try {
          await ctx.replyWithPhoto(certificate.carPhoto, { caption: 'Фото автомобиля' });
        } catch (e) {
          console.error('Error sending car photo:', e);
        }
      }
      
      if (certificate.rollPhoto) {
        try {
          await ctx.replyWithPhoto(certificate.rollPhoto, { caption: 'Фото рулона' });
        } catch (e) {
          console.error('Error sending roll photo:', e);
        }
      }
    } catch (error) {
      console.error('Error sending certificate details:', error);
      await ctx.reply('⚠️ Ошибка при отображении сертификата');
    }
  }

  async sendCertificateNotFound(ctx, query) {
    try {
      await ctx.replyWithMarkdown(
        `❌ *Сертификат не найден!*\n` +
        `По запросу: ${query}\n\n` +
        `Проверьте правильность введенных данных и попробуйте снова.`
      );
    } catch (error) {
      console.error('Error sending not found message:', error);
      await ctx.reply('⚠️ Ошибка при обработке запроса');
    }
  }

  async sendHelpMessage(ctx) {
    try {
      const role = await this.getUserRole(ctx);
      
      let message = `ℹ️ *Помощь по боту*\n\n`;
      message += `Основные команды:\n` +
        `/start - Начать работу\n` +
        `/check - Проверить сертификат\n` +
        `/help - Эта справка\n`;
      
      if (role === USER_ROLES.OPERATOR) {
        message += `\nДля операторов:\n` +
          `/create - Создать сертификат\n`;
      }
      
      if (role === USER_ROLES.ADMIN) {
        message += `\nДля администраторов:\n` +
          `/admin - Панель управления\n` +
          `/users - Список пользователей\n` +
          `/operators - Список операторов\n` +
          `/pending - Неподтвержденные сертификаты\n` +
          `/stats - Статистика\n`;
      }
      
      await ctx.replyWithMarkdown(message);
    } catch (error) {
      console.error('Error sending help message:', error);
      await ctx.reply('⚠️ Ошибка при загрузке справки');
    }
  }

  async sendOperatorStats(ctx, operatorId) {
    try {
      const stats = await Certificate.aggregate([
        { $match: { operatorId: new mongoose.Types.ObjectId(operatorId) } },
        { $group: { 
          _id: null,
          total: { $sum: 1 },
          approved: { 
            $sum: { 
              $cond: [{ $eq: ["$status", CERTIFICATE_STATUS.APPROVED] }, 1, 0] 
            } 
          },
          pending: {
            $sum: {
              $cond: [{ $eq: ["$status", CERTIFICATE_STATUS.PENDING] }, 1, 0]
            }
          }
        }}
      ]);

      const statData = stats[0] || { total: 0, approved: 0, pending: 0 };
      const approvalRate = statData.total > 0 
        ? Math.round((statData.approved / statData.total) * 100)
        : 0;

      const message = `📊 *Статистика оператора:*\n\n` +
        `• Всего сертификатов: ${statData.total}\n` +
        `• Одобрено: ${statData.approved} (${approvalRate}%)\n` +
        `• На рассмотрении: ${statData.pending}`;

      await ctx.replyWithMarkdown(message);
    } catch (error) {
      console.error('Error sending operator stats:', error);
      await ctx.reply('⚠️ Ошибка при загрузке статистики оператора');
    }
  }
}

module.exports = BotService;