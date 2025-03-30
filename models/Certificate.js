const mongoose = require('mongoose');
const { CERTIFICATE_STATUS } = require('../utils/constants');

const certificateSchema = new mongoose.Schema({
  operatorId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  adminId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  carBrand: { 
    type: String, 
    required: true 
  },
  carModel: { 
    type: String, 
    required: true 
  },
  licensePlate: { 
    type: String, 
    required: true, 
    unique: true 
  },
  vin: { 
    type: String, 
    required: true, 
    unique: true 
  },
  rollNumber: { 
    type: String, 
    required: true 
  },
  rollPhoto: { 
    type: String, 
    required: true 
  },
  carPhoto: { 
    type: String, 
    required: true 
  },
  status: { 
    type: String, 
    enum: Object.values(CERTIFICATE_STATUS),
    default: CERTIFICATE_STATUS.PENDING
  },
  rejectionReason: { 
    type: String 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  approvedAt: { 
    type: Date 
  }
});

certificateSchema.index({ licensePlate: 1, vin: 1 }, { unique: true });

module.exports = mongoose.model('Certificate', certificateSchema);