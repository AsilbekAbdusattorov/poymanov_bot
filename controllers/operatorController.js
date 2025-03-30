const { USER_ROLES, CERTIFICATE_STATUS } = require('../utils/constants');
const User = require('../models/User');
const Certificate = require('../models/Certificate');
const BotService = require('../services/botService');
const { Markup } = require('telegraf'); // Добавлен импорт Markup

class OperatorController {
  constructor(bot) {
    this.bot = bot;
    this.botService = new BotService(bot);
    this.creatingCertificate = {};
  }

  initialize() {
    this.bot.command('create', this.startCertificateCreation.bind(this));
    this.bot.on('photo', this.handlePhotoUpload.bind(this));
    this.bot.on('text', this.handleTextInput.bind(this));
    this.bot.action('submit_certificate', this.submitCertificate.bind(this));
    this.bot.action('cancel_certificate', this.cancelCertificateCreation.bind(this));
  }

  async startCertificateCreation(ctx) {
    const role = await this.botService.getUserRole(ctx);
    if (role !== USER_ROLES.OPERATOR) {
      return ctx.reply('🚫 У вас нет прав для создания сертификатов');
    }
    
    this.creatingCertificate[ctx.from.id] = {
      step: 'carBrand',
      data: {}
    };
    
    await ctx.reply('🚗 Начинаем создание сертификата. Введите марку автомобиля:');
  }

  async handleTextInput(ctx) {
    const userId = ctx.from.id;
    if (!this.creatingCertificate[userId]) return;
    
    const currentStep = this.creatingCertificate[userId].step;
    const text = ctx.message.text.trim();
    
    if (!text) {
      return ctx.reply('Пожалуйста, введите корректные данные');
    }

    switch (currentStep) {
      case 'carBrand':
        if (text.length < 2 || text.length > 50) {
          return ctx.reply('Марка автомобиля должна содержать от 2 до 50 символов');
        }
        this.creatingCertificate[userId].data.carBrand = text;
        this.creatingCertificate[userId].step = 'carModel';
        await ctx.reply('Введите модель автомобиля:');
        break;
        
      case 'carModel':
        if (text.length < 1 || text.length > 50) {
          return ctx.reply('Модель автомобиля должна содержать от 1 до 50 символов');
        }
        this.creatingCertificate[userId].data.carModel = text;
        this.creatingCertificate[userId].step = 'licensePlate';
        await ctx.reply('Введите госномер автомобиля (например, A123BC777):');
        break;
        
      case 'licensePlate':
        if (!/^[A-Za-zА-Яа-я0-9]{4,15}$/.test(text)) {
          return ctx.reply('Госномер должен содержать от 4 до 15 символов (буквы и цифры)');
        }
        this.creatingCertificate[userId].data.licensePlate = text.toUpperCase();
        this.creatingCertificate[userId].step = 'vin';
        await ctx.reply('Введите VIN-номер автомобиля (17 символов):');
        break;
        
      case 'vin':
        if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(text)) {
          return ctx.reply('VIN-номер должен содержать ровно 17 символов (буквы и цифры, кроме I, O, Q)');
        }
        this.creatingCertificate[userId].data.vin = text.toUpperCase();
        this.creatingCertificate[userId].step = 'rollNumber';
        await ctx.reply('Введите номер рулона:');
        break;
        
      case 'rollNumber':
        if (text.length < 3 || text.length > 50) {
          return ctx.reply('Номер рулона должен содержать от 3 до 50 символов');
        }
        this.creatingCertificate[userId].data.rollNumber = text;
        this.creatingCertificate[userId].step = 'rollPhoto';
        await ctx.reply('📷 Отправьте четкое фото рулона:');
        break;
    }
  }

  async handlePhotoUpload(ctx) {
    const userId = ctx.from.id;
    if (!this.creatingCertificate[userId]) return;
    
    const currentStep = this.creatingCertificate[userId].step;
    
    try {
      // Получаем самое высококачественное фото из массива
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const fileId = photo.file_id;
      
      // Сохраняем fileId вместо ссылки (более надежно)
      if (currentStep === 'rollPhoto') {
        this.creatingCertificate[userId].data.rollPhoto = fileId;
        this.creatingCertificate[userId].step = 'carPhoto';
        await ctx.reply('📷 Отправьте четкое фото автомобиля (вид спереди):');
      } 
      else if (currentStep === 'carPhoto') {
        this.creatingCertificate[userId].data.carPhoto = fileId;
        
        const certData = this.creatingCertificate[userId].data;
        const summary = `🔍 *Проверьте данные сертификата:*\n\n` +
                       `🚗 *Марка и модель:* ${certData.carBrand} ${certData.carModel}\n` +
                       `🔢 *Госномер:* ${certData.licensePlate}\n` +
                       `🆔 *VIN:* ${certData.vin}\n` +
                       `📜 *Номер рулона:* ${certData.rollNumber}`;
        
        const keyboard = Markup.inlineKeyboard([
          Markup.button.callback('✅ Отправить на подтверждение', 'submit_certificate'),
          Markup.button.callback('❌ Отменить создание', 'cancel_certificate')
        ]);
        
        // Отправляем превью фото
        if (certData.rollPhoto) {
          await ctx.replyWithPhoto(certData.rollPhoto, { caption: 'Фото рулона' });
        }
        
        await ctx.replyWithMarkdown(summary, keyboard);
      }
    } catch (error) {
      console.error('Error processing photo:', error);
      await ctx.reply('⚠️ Ошибка при обработке фото. Попробуйте отправить фото еще раз.');
    }
  }

  async submitCertificate(ctx) {
    const userId = ctx.from.id;
    if (!this.creatingCertificate[userId]) {
      return ctx.reply('❌ Сессия создания сертификата истекла или не найдена');
    }
    
    const certData = this.creatingCertificate[userId].data;
    const operator = await User.findOne({ telegramId: userId });
    
    if (!operator) {
      delete this.creatingCertificate[userId];
      return ctx.reply('❌ Ошибка: ваш аккаунт оператора не найден');
    }
    
    try {
      // Проверяем, существует ли уже сертификат с таким госномером или VIN
      const existingCert = await Certificate.findOne({
        $or: [
          { licensePlate: certData.licensePlate },
          { vin: certData.vin }
        ]
      });
      
      if (existingCert) {
        let conflictField = '';
        if (existingCert.licensePlate === certData.licensePlate) conflictField = 'госномером';
        if (existingCert.vin === certData.vin) conflictField = 'VIN-номером';
        
        return ctx.reply(`❌ Сертификат с таким ${conflictField} уже существует!`);
      }
      
      const certificate = new Certificate({
        operatorId: operator._id,
        ...certData,
        status: CERTIFICATE_STATUS.PENDING
      });
      
      await certificate.save();
      
      await ctx.replyWithMarkdown(
        '✅ *Сертификат успешно создан и отправлен на подтверждение администратору!*\n\n' +
        'Вы получите уведомление, когда администратор проверит ваш сертификат.'
      );
      
      // Уведомляем администраторов
      const admins = await User.find({ role: USER_ROLES.ADMIN });
      for (const admin of admins) {
        await this.bot.telegram.sendMessage(
          admin.telegramId,
          `📢 Новый сертификат на подтверждение от @${operator.username}!\n` +
          `Используйте команду /pending для просмотра.`
        );
      }
    } catch (error) {
      console.error('Certificate creation error:', error);
      await ctx.reply('⚠️ Произошла ошибка при создании сертификата. Попробуйте позже.');
    } finally {
      delete this.creatingCertificate[userId];
    }
  }

  async cancelCertificateCreation(ctx) {
    const userId = ctx.from.id;
    if (this.creatingCertificate[userId]) {
      delete this.creatingCertificate[userId];
      await ctx.reply('❌ Создание сертификата отменено');
      await ctx.deleteMessage();
    }
  }
}

module.exports = OperatorController;