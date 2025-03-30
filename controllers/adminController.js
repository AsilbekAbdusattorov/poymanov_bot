const {
    USER_ROLES,
    CERTIFICATE_STATUS,
    ACTIONS,
  } = require("../utils/constants");
  const User = require("../models/User");
  const Certificate = require("../models/Certificate");
  const { generateCertificatePDF } = require("../services/pdfService");
  const BotService = require("../services/botService");
  const { Markup } = require("telegraf");
  const mongoose = require("mongoose");
  const fs = require("fs");
  const path = require("path");
  
  // Helper function to escape Markdown special characters
  function escapeMarkdown(text) {
    if (!text) return '';
    return text.toString().replace(/[_*[\]()~`>#+-=|{}.!]/g, '\\$&');
  }
  
  class AdminController {
    constructor(bot) {
      this.bot = bot;
      this.botService = new BotService(bot);
      this.rejectingCertificate = {};
    }
  
    initialize() {
      this.bot.command("admin", this.showAdminPanel.bind(this));
      this.bot.command("users", this.showUsersList.bind(this));
      this.bot.command("operators", this.showOperatorsList.bind(this));
      this.bot.command("pending", this.showPendingCertificates.bind(this));
      this.bot.command("stats", this.showStats.bind(this));
  
      this.bot.action(
        new RegExp(`^${ACTIONS.APPROVE_CERTIFICATE}:(.+)$`),
        this.approveCertificate.bind(this)
      );
      this.bot.action(
        new RegExp(`^${ACTIONS.REJECT_CERTIFICATE}:(.+)$`),
        this.startRejectCertificate.bind(this)
      );
      this.bot.action(
        new RegExp(`^${ACTIONS.ADD_OPERATOR}:(.+)$`),
        this.toggleOperatorRole.bind(this)
      );
      this.bot.action(
        new RegExp(`^${ACTIONS.REMOVE_OPERATOR}:(.+)$`),
        this.toggleOperatorRole.bind(this)
      );
      this.bot.action(
        new RegExp(`^${ACTIONS.BLOCK_USER}:(.+)$`),
        this.toggleUserBlockStatus.bind(this)
      );
      this.bot.action(
        new RegExp(`^${ACTIONS.UNBLOCK_USER}:(.+)$`),
        this.toggleUserBlockStatus.bind(this)
      );
  
      this.bot.use((ctx, next) => {
        if (this.rejectingCertificate[ctx.from.id]) {
          return this.handleRejectReason(ctx);
        }
        return next();
      });
    }
  
    async showAdminPanel(ctx) {
      try {
        const role = await this.botService.getUserRole(ctx);
        if (role !== USER_ROLES.ADMIN) {
          return ctx.reply("🚫 У вас нет прав администратора");
        }
  
        const message =
          `👮‍♂️ *Панель администратора*\n\n` +
          `Доступные команды:\n` +
          `/users - Управление пользователями\n` +
          `/operators - Управление операторами\n` +
          `/pending - Неподтвержденные сертификаты\n` +
          `/stats - Статистика системы`;
  
        await ctx.replyWithMarkdown(message);
      } catch (error) {
        console.error("Admin panel error:", error);
        await ctx.reply("⚠️ Произошла ошибка при загрузке панели администратора");
      }
    }
  
    async showUsersList(ctx) {
      try {
        const role = await this.botService.getUserRole(ctx);
        if (role !== USER_ROLES.ADMIN) {
          return ctx.reply("🚫 У вас нет прав администратора");
        }
  
        const users = await User.find({ role: USER_ROLES.USER }).sort({ createdAt: -1 });
        if (users.length === 0) {
          return ctx.reply("ℹ️ В системе пока нет обычных пользователей");
        }
  
        await ctx.replyWithMarkdown(
          `👥 *Список пользователей (${users.length}):*`
        );
  
        for (const user of users) {
          const status = user.isBlocked ? "🚫 Заблокирован" : "✅ Активен";
          const escapedFirstName = escapeMarkdown(user.firstName);
          const escapedLastName = escapeMarkdown(user.lastName);
          const escapedUsername = escapeMarkdown(user.username);
  
          const message =
            `*${escapedFirstName}* ${escapedLastName}\n` +
            `@${escapedUsername || "нет username"}\n` +
            `Статус: ${status}\n` +
            `Зарегистрирован: ${user.createdAt.toLocaleDateString()}`;
  
          const keyboard = Markup.inlineKeyboard([
            Markup.button.callback(
              "Сделать оператором",
              `${ACTIONS.ADD_OPERATOR}:${user._id}`
            ),
            user.isBlocked
              ? Markup.button.callback(
                  "Разблокировать",
                  `${ACTIONS.UNBLOCK_USER}:${user._id}`
                )
              : Markup.button.callback(
                  "Заблокировать",
                  `${ACTIONS.BLOCK_USER}:${user._id}`
                ),
          ]);
  
          await ctx.replyWithMarkdown(message, keyboard);
          await ctx.reply("──────────────");
        }
      } catch (error) {
        console.error("Users list error:", error);
        await ctx.reply("⚠️ Произошла ошибка при загрузке списка пользователей");
      }
    }
  
    async showOperatorsList(ctx) {
      try {
        const role = await this.botService.getUserRole(ctx);
        if (role !== USER_ROLES.ADMIN) {
          return ctx.reply("🚫 У вас нет прав администратора");
        }
  
        const operators = await User.find({ role: USER_ROLES.OPERATOR }).sort({ createdAt: -1 });
        if (operators.length === 0) {
          return ctx.reply("ℹ️ В системе пока нет операторов");
        }
  
        // Get operator stats (certificate counts)
        const operatorStats = await Certificate.aggregate([
            { 
              $match: { 
                operatorId: { $in: operators.map(op => new mongoose.Types.ObjectId(op._id)) } 
              } 
            },
            { 
              $group: { 
                _id: "$operatorId", 
                total: { $sum: 1 },
                approved: { 
                  $sum: { 
                    $cond: [
                      { $eq: ["$status", CERTIFICATE_STATUS.APPROVED] }, 
                      1, 
                      0
                    ] 
                  } 
                } 
              } 
            }
          ]);
  
        const statsMap = operatorStats.reduce((acc, stat) => {
          acc[stat._id.toString()] = stat;
          return acc;
        }, {});
  
        await ctx.replyWithMarkdown(
          `👨‍💻 *Список операторов (${operators.length}):*`
        );
  
        for (const operator of operators) {
          const status = operator.isBlocked ? "🚫 Заблокирован" : "✅ Активен";
          const escapedFirstName = escapeMarkdown(operator.firstName);
          const escapedLastName = escapeMarkdown(operator.lastName);
          const escapedUsername = escapeMarkdown(operator.username);
          
          const stats = statsMap[operator._id.toString()] || { total: 0, approved: 0 };
          const approvalRate = stats.total > 0 
            ? Math.round((stats.approved / stats.total) * 100) 
            : 0;
  
          const message =
            `*${escapedFirstName}* ${escapedLastName}\n` +
            `@${escapedUsername || "нет username"}\n` +
            `Статус: ${status}\n` +
            `Сертификатов: ${stats.total} (${stats.approved} одобрено, ${approvalRate}%)\n` +
            `Зарегистрирован: ${operator.createdAt.toLocaleDateString()}`;
  
          const keyboard = Markup.inlineKeyboard([
            Markup.button.callback(
              "Сделать пользователем",
              `${ACTIONS.REMOVE_OPERATOR}:${operator._id}`
            ),
            operator.isBlocked
              ? Markup.button.callback(
                  "Разблокировать",
                  `${ACTIONS.UNBLOCK_USER}:${operator._id}`
                )
              : Markup.button.callback(
                  "Заблокировать",
                  `${ACTIONS.BLOCK_USER}:${operator._id}`
                ),
          ]);
  
          await ctx.replyWithMarkdown(message, keyboard);
          await ctx.reply("──────────────");
        }
      } catch (error) {
        console.error("Operators list error:", error);
        await ctx.reply("⚠️ Произошла ошибка при загрузке списка операторов");
      }
    }
  
    async toggleOperatorRole(ctx) {
      try {
        const role = await this.botService.getUserRole(ctx);
        if (role !== USER_ROLES.ADMIN) {
          return ctx.reply("🚫 У вас нет прав администратора");
        }
  
        const userId = ctx.match[1];
        const action = ctx.match[0].split(':')[0];
  
        if (!mongoose.Types.ObjectId.isValid(userId)) {
          return ctx.reply("❌ Неверный ID пользователя");
        }
  
        const user = await User.findById(userId);
        if (!user) {
          return ctx.reply("❌ Пользователь не найден");
        }
  
        // Determine new role based on action
        const newRole = action === ACTIONS.ADD_OPERATOR 
          ? USER_ROLES.OPERATOR 
          : USER_ROLES.USER;
  
        // Skip if role is already set
        if (user.role === newRole) {
          return ctx.reply(`ℹ️ Пользователь уже имеет роль ${newRole}`);
        }
  
        user.role = newRole;
        await user.save();
  
        const actionText = newRole === USER_ROLES.OPERATOR
          ? "назначен оператором"
          : "понижен до пользователя";
        
        await ctx.reply(`✅ Пользователь @${escapeMarkdown(user.username)} ${actionText}`);
  
        if (ctx.callbackQuery?.message) {
          await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
        }
  
        // Notify the user about their new role
        await this.bot.telegram.sendMessage(
          user.telegramId,
          newRole === USER_ROLES.OPERATOR
            ? "🎉 Вам были предоставлены права оператора! Теперь вы можете создавать сертификаты."
            : "ℹ️ Ваши права оператора были отозваны."
        );
  
        // Update the lists
        if (newRole === USER_ROLES.OPERATOR) {
          await this.showOperatorsList(ctx);
        } else {
          await this.showUsersList(ctx);
        }
      } catch (error) {
        console.error("Role change error:", error);
        await ctx.reply("⚠️ Произошла ошибка при изменении роли пользователя");
      }
    }
  
    async toggleUserBlockStatus(ctx) {
      try {
        const role = await this.botService.getUserRole(ctx);
        if (role !== USER_ROLES.ADMIN) {
          return ctx.reply("🚫 У вас нет прав администратора");
        }
  
        const userId = ctx.match[1];
        const action = ctx.match[0].split(':')[0];
  
        if (!mongoose.Types.ObjectId.isValid(userId)) {
          return ctx.reply("❌ Неверный ID пользователя");
        }
  
        const user = await User.findById(userId);
        if (!user) {
          return ctx.reply("❌ Пользователь не найден");
        }
  
        // Determine new status based on action
        const newStatus = action === ACTIONS.BLOCK_USER;
  
        // Skip if status is already set
        if (user.isBlocked === newStatus) {
          return ctx.reply(`ℹ️ Пользователь уже ${newStatus ? 'заблокирован' : 'разблокирован'}`);
        }
  
        user.isBlocked = newStatus;
        await user.save();
  
        const actionText = newStatus ? "заблокирован" : "разблокирован";
        await ctx.reply(`✅ Пользователь @${escapeMarkdown(user.username)} ${actionText}`);
  
        if (ctx.callbackQuery?.message) {
          await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
        }
  
        // Notify the user if they're being blocked
        if (newStatus) {
          await this.bot.telegram.sendMessage(
            user.telegramId,
            "🚫 Ваш аккаунт был заблокирован администратором. " +
              "Для выяснения причин обратитесь к администрации."
          );
        }
  
        // Update the appropriate list based on user role
        if (user.role === USER_ROLES.OPERATOR) {
          await this.showOperatorsList(ctx);
        } else {
          await this.showUsersList(ctx);
        }
      } catch (error) {
        console.error("Block user error:", error);
        await ctx.reply("⚠️ Произошла ошибка при изменении статуса пользователя");
      }
    }
  
    async showPendingCertificates(ctx) {
      try {
        const role = await this.botService.getUserRole(ctx);
        if (role !== USER_ROLES.ADMIN) {
          return ctx.reply("🚫 У вас нет прав администратора");
        }
  
        const certificates = await Certificate.find({
          status: CERTIFICATE_STATUS.PENDING,
        })
          .populate("operatorId")
          .sort({ createdAt: 1 });
  
        if (certificates.length === 0) {
          return ctx.reply("ℹ️ Нет сертификатов, ожидающих подтверждения");
        }
  
        await ctx.replyWithMarkdown(
          `⏳ *Сертификатов на подтверждение: ${certificates.length}*`
        );
  
        for (const cert of certificates) {
          const operator = cert.operatorId;
          const escapedFirstName = escapeMarkdown(operator.firstName);
          const escapedUsername = escapeMarkdown(operator.username);
  
          const message =
            `📋 *Новый сертификат*\n\n` +
            `👤 *Оператор:* ${escapedFirstName} @${escapedUsername}\n` +
            `📅 *Дата создания:* ${cert.createdAt.toLocaleString()}\n\n` +
            `🚗 *Автомобиль:* ${escapeMarkdown(cert.carBrand)} ${escapeMarkdown(cert.carModel)}\n` +
            `🔢 *Госномер:* ${escapeMarkdown(cert.licensePlate)}\n` +
            `🆔 *VIN:* ${escapeMarkdown(cert.vin)}\n` +
            `📜 *Номер рулона:* ${escapeMarkdown(cert.rollNumber)}`;
  
          await ctx.replyWithMarkdown(message);
  
          try {
            if (cert.rollPhoto) {
              await ctx.replyWithPhoto(cert.rollPhoto, {
                caption: "Фото рулона",
              });
            }
            if (cert.carPhoto) {
              await ctx.replyWithPhoto(cert.carPhoto, {
                caption: "Фото автомобиля",
              });
            }
          } catch (e) {
            console.error("Error sending photos:", e);
            await ctx.reply("⚠️ Не удалось загрузить прикрепленные фото");
          }
  
          const keyboard = Markup.inlineKeyboard([
            Markup.button.callback(
              "✅ Подтвердить",
              `${ACTIONS.APPROVE_CERTIFICATE}:${cert._id}`
            ),
            Markup.button.callback(
              "❌ Отклонить",
              `${ACTIONS.REJECT_CERTIFICATE}:${cert._id}`
            ),
          ]);
  
          await ctx.reply("Выберите действие:", keyboard);
          await ctx.reply("──────────────────");
        }
      } catch (error) {
        console.error("Pending certificates error:", error);
        await ctx.reply("⚠️ Произошла ошибка при загрузке сертификатов");
      }
    }
  
    async showStats(ctx) {
      try {
        const role = await this.botService.getUserRole(ctx);
        if (role !== USER_ROLES.ADMIN) {
          return ctx.reply("🚫 У вас нет прав администратора");
        }
  
        const [
          totalCertificates,
          pendingCertificates,
          approvedCertificates,
          rejectedCertificates,
        ] = await Promise.all([
          Certificate.countDocuments(),
          Certificate.countDocuments({ status: CERTIFICATE_STATUS.PENDING }),
          Certificate.countDocuments({ status: CERTIFICATE_STATUS.APPROVED }),
          Certificate.countDocuments({ status: CERTIFICATE_STATUS.REJECTED }),
        ]);
  
        const [totalUsers, operators, blockedUsers] = await Promise.all([
          User.countDocuments(),
          User.countDocuments({ role: USER_ROLES.OPERATOR }),
          User.countDocuments({ isBlocked: true }),
        ]);
  
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const newToday = await Certificate.countDocuments({
          createdAt: { $gte: today },
        });
  
        const message =
          `📊 *Статистика системы*\n\n` +
          `📋 *Сертификаты:*\n` +
          `• Всего: ${totalCertificates}\n` +
          `• Сегодня: ${newToday}\n` +
          `• Ожидают: ${pendingCertificates}\n` +
          `• Подтверждено: ${approvedCertificates}\n` +
          `• Отклонено: ${rejectedCertificates}\n\n` +
          `👤 *Пользователи:*\n` +
          `• Всего: ${totalUsers}\n` +
          `• Операторов: ${operators}\n` +
          `• Заблокировано: ${blockedUsers}`;
  
        await ctx.replyWithMarkdown(message);
      } catch (error) {
        console.error("Stats error:", error);
        await ctx.reply("⚠️ Произошла ошибка при загрузке статистики");
      }
    }
  
    async approveCertificate(ctx) {
      try {
        const role = await this.botService.getUserRole(ctx);
        if (role !== USER_ROLES.ADMIN) {
          return ctx.reply("🚫 У вас нет прав администратора");
        }
  
        const certificateId = ctx.match[1];
  
        if (!mongoose.Types.ObjectId.isValid(certificateId)) {
          return ctx.reply("❌ Неверный ID сертификата");
        }
  
        const certificate = await Certificate.findById(certificateId).populate(
          "operatorId"
        );
  
        if (!certificate) {
          return ctx.reply("❌ Сертификат не найден");
        }
  
        if (certificate.status !== CERTIFICATE_STATUS.PENDING) {
          return ctx.reply("⚠️ Этот сертификат уже был обработан");
        }
  
        const adminUser = await User.findOne({ telegramId: ctx.from.id });
        if (!adminUser) {
          return ctx.reply(
            "❌ Ваш аккаунт администратора не найден в базе данных"
          );
        }
  
        certificate.status = CERTIFICATE_STATUS.APPROVED;
        certificate.adminId = adminUser._id;
        certificate.approvedAt = new Date();
        await certificate.save();
  
        try {
          const pdfPath = await generateCertificatePDF(certificate);
  
          await this.bot.telegram.sendDocument(
            certificate.operatorId.telegramId,
            { source: pdfPath },
            {
              caption: "🎉 Ваш сертификат был подтвержден администратором!",
              parse_mode: "Markdown",
            }
          );
  
          fs.unlink(pdfPath, (err) => {
            if (err) console.error("Error deleting temp PDF:", err);
          });
  
          await ctx.reply(
            "✅ Сертификат успешно подтвержден и отправлен оператору"
          );
        } catch (pdfError) {
          console.error("PDF generation error:", pdfError);
          await this.bot.telegram.sendMessage(
            certificate.operatorId.telegramId,
            "🎉 Ваш сертификат был подтвержден администратором!\n\n" +
              "⚠️ Приносим извинения, техническая проблема с генерацией PDF файла."
          );
          await ctx.reply(
            "✅ Сертификат подтвержден, но возникла проблема с генерацией PDF"
          );
        }
  
        if (ctx.callbackQuery?.message) {
          await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
        }
      } catch (error) {
        console.error("Certificate approval error:", error);
        await ctx.reply("⚠️ Произошла ошибка при подтверждении сертификата");
      }
    }
  
    async startRejectCertificate(ctx) {
      try {
        const role = await this.botService.getUserRole(ctx);
        if (role !== USER_ROLES.ADMIN) {
          return ctx.reply("🚫 У вас нет прав администратора");
        }
  
        const certificateId = ctx.match[1];
  
        if (!mongoose.Types.ObjectId.isValid(certificateId)) {
          return ctx.reply("❌ Неверный ID сертификата");
        }
  
        this.rejectingCertificate[ctx.from.id] = certificateId;
  
        await ctx.reply(
          "📝 Укажите причину отказа (отправьте текстовое сообщение):"
        );
  
        if (ctx.callbackQuery?.message) {
          await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
        }
      } catch (error) {
        console.error("Start reject certificate error:", error);
        await ctx.reply("⚠️ Произошла ошибка при обработке запроса");
      }
    }
  
    async handleRejectReason(ctx) {
      try {
        const userId = ctx.from.id;
        const certificateId = this.rejectingCertificate[userId];
  
        if (!certificateId) return;
  
        const reason = ctx.message.text.trim();
        if (!reason || reason.length < 5) {
          return ctx.reply(
            "⚠️ Причина отказа должна содержать не менее 5 символов"
          );
        }
  
        delete this.rejectingCertificate[userId];
  
        if (!mongoose.Types.ObjectId.isValid(certificateId)) {
          return ctx.reply("❌ Неверный ID сертификата");
        }
  
        const certificate = await Certificate.findById(certificateId).populate(
          "operatorId"
        );
        if (!certificate) {
          return ctx.reply("❌ Сертификат не найден");
        }
  
        if (certificate.status !== CERTIFICATE_STATUS.PENDING) {
          return ctx.reply("⚠️ Этот сертификат уже был обработан");
        }
  
        const adminUser = await User.findOne({ telegramId: userId });
        if (!adminUser) {
          return ctx.reply(
            "❌ Ваш аккаунт администратора не найден в базе данных"
          );
        }
  
        certificate.status = CERTIFICATE_STATUS.REJECTED;
        certificate.adminId = adminUser._id;
        certificate.rejectionReason = reason;
        await certificate.save();
  
        await this.bot.telegram.sendMessage(
          certificate.operatorId.telegramId,
          `⚠️ Ваш сертификат (${escapeMarkdown(certificate.carBrand)} ${escapeMarkdown(certificate.carModel)}, ${escapeMarkdown(certificate.licensePlate)}) был отклонен.\n\n` +
            `*Причина:* ${escapeMarkdown(reason)}\n\n` +
            `Вы можете создать новый сертификат с исправленными данными.`,
          { parse_mode: "Markdown" }
        );
  
        await ctx.reply("✅ Сертификат отклонен. Оператор уведомлен о причине.");
      } catch (error) {
        console.error("Certificate rejection error:", error);
        await ctx.reply("⚠️ Произошла ошибка при отклонении сертификата");
      }
    }
  }
  
  module.exports = AdminController;