import mongoose from 'mongoose';

export const LEAVE_TYPES = ['annual', 'sick', 'maternity', 'paternity', 'compassionate', 'study', 'unpaid'];

// Default annual entitlements in working days
export const LEAVE_ENTITLEMENTS = {
  annual:        21,
  sick:          10,
  maternity:     90,
  paternity:     14,
  compassionate: 5,
  study:         10,
  unpaid:        365,
};

export const LEAVE_TYPE_LABELS = {
  annual:        'Annual Leave',
  sick:          'Sick Leave',
  maternity:     'Maternity Leave',
  paternity:     'Paternity Leave',
  compassionate: 'Compassionate Leave',
  study:         'Study Leave',
  unpaid:        'Unpaid Leave',
};

const leaveSchema = new mongoose.Schema({
  staffId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },

  leaveType:   { type: String, enum: LEAVE_TYPES, required: true },
  startDate:   { type: Date, required: true },
  endDate:     { type: Date, required: true },
  workingDays: { type: Number, required: true, min: 1 },
  reason:      { type: String, required: true, trim: true, maxlength: 1000 },
  supportingDocUrl: { type: String },

  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
    default: 'pending',
    index: true,
  },

  approvedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt:      { type: Date },
  approverComment: { type: String, trim: true, maxlength: 500 },

  // Cached for fast balance aggregation queries
  year: { type: Number, required: true },
}, { timestamps: true });

leaveSchema.index({ staffId: 1, year: 1, leaveType: 1 });
leaveSchema.index({ schoolId: 1, status: 1, startDate: -1 });
leaveSchema.index({ schoolId: 1, startDate: 1, endDate: 1 });

export default mongoose.model('Leave', leaveSchema);
