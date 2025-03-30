require('dotenv').config();

module.exports = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/certificate_bot',
  ADMIN_IDS: process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [],
  OPERATOR_IDS: process.env.OPERATOR_IDS ? process.env.OPERATOR_IDS.split(',') : [],
};