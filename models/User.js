const mongoose = require('mongoose');
const { USER_ROLES } = require('../utils/constants');

const userSchema = new mongoose.Schema({
  telegramId: { 
    type: Number, 
    required: true, 
    unique: true 
  },
  username: { 
    type: String 
  },
  firstName: { 
    type: String, 
    required: true 
  },
  lastName: { 
    type: String 
  },
  role: { 
    type: String, 
    required: true, 
    enum: Object.values(USER_ROLES),
    default: USER_ROLES.USER
  },
  isBlocked: { 
    type: Boolean, 
    default: false 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

userSchema.index({ telegramId: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);