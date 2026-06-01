import mongoose from 'mongoose';
import { PAYMENT_METHODS, PAYMENT_STATUSES, PAYMENT_SOURCE, TERMS } from '../../constants/index.js';
import { getRedis } from '../../config/redis.js';

const paymentSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true,
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: true,
      index: true,
    },
    academicYear: {
      type: String,
      required: [true, 'Academic year is required'],
      match: [/^\d{4}$/, 'Academic year must be a 4-digit year'],
    },
    term: {
      type: String,
      enum: TERMS,
      required: [true, 'Term is required'],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Payment amount is required'],
      min: [1, 'Payment amount must be at least 1'],
    },
    method: {
      type: String,
      enum: Object.values(PAYMENT_METHODS),
      required: [true, 'Payment method is required'],
    },
    // Receipt number, M-Pesa transaction code, bank slip number, etc.
    reference: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(PAYMENT_STATUSES),
      default: PAYMENT_STATUSES.COMPLETED,
    },
    // How this payment entered the system
    source: {
      type: String,
      enum: Object.values(PAYMENT_SOURCE),
      default: PAYMENT_SOURCE.MANUAL,
    },
    payerPhone: {
      type: String,
      trim: true,
    },
    payerName: {
      type: String,
      trim: true,
    },
    accountReference: {
      type: String,
      trim: true,
      uppercase: true,
      index: true,
    },
    // Staff member who recorded the payment (null for sms_webhook payments)
    recordedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: function () { return this.source === PAYMENT_SOURCE.MANUAL; },
    },
    // Payment type: 'fees' = regular fee structure payment, 'other' = ad-hoc item (transport, lunch, etc.)
    paymentType: {
      type: String,
      enum: ['fees', 'other'],
      default: 'fees',
      index: true,
    },
    // Populated when paymentType = 'other' — the name of the ad-hoc fee item
    feeItemName: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    // Populated when status = reversed
    reversalReason: {
      type: String,
      trim: true,
    },
    reversedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reversedAt: {
      type: Date,
    },
    // Actual date the payment was made (may differ from createdAt if recorded later)
    paymentDate: {
      type: Date,
      default: Date.now,
    },
    // Cloudinary URL of the generated PDF receipt (populated asynchronously by receipt worker)
    receiptUrl: {
      type: String,
    },
    // Auto-generated sequential receipt tracking number per school (e.g. RCT-2025-00001)
    receiptNumber: {
      type: String,
      trim: true,
      index: true,
    },
    // Staff member who first issued the printed receipt.
    receiptIssuedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    receiptIssuedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

// Composite index for fetching a student's payments in a given term
paymentSchema.index({ schoolId: 1, studentId: 1, academicYear: 1, term: 1 });
// Dashboard aggregations: filter by schoolId+status, range/sort on createdAt
paymentSchema.index({ schoolId: 1, status: 1, createdAt: -1 });
paymentSchema.index({ schoolId: 1, paymentDate: -1 });
paymentSchema.index({ schoolId: 1, classId: 1, paymentDate: -1 });
paymentSchema.index({ schoolId: 1, method: 1, status: 1 });
paymentSchema.index(
  { source: 1, reference: 1 },
  {
    unique: true,
    partialFilterExpression: {
      source: PAYMENT_SOURCE.MPESA_C2B,
      reference: { $type: 'string' },
    },
  }
);

// Auto-assign a sequential receipt number before first save.
// Uses a Redis atomic INCR per school-year to eliminate race conditions.
// Falls back to countDocuments only when Redis is unavailable (test env).
paymentSchema.pre('save', async function (next) {
  if (this.isNew && !this.receiptNumber) {
    try {
      const year = new Date().getFullYear();
      const redis = getRedis();
      let seq;
      if (redis) {
        const key = `receipt:seq:${this.schoolId}:${year}`;
        seq = await redis.incr(key);
        // First hit this year — set a 2-year TTL so old keys self-clean
        if (seq === 1) await redis.expire(key, 2 * 365 * 24 * 60 * 60);
      } else {
        seq = (await mongoose.model('Payment').countDocuments({ schoolId: this.schoolId })) + 1;
      }
      this.receiptNumber = `RCT-${year}-${String(seq).padStart(5, '0')}`;
    } catch {
      // Non-fatal — receipt number may be empty; payment still records
    }
  }
  next();
});

export default mongoose.models.Payment || mongoose.model('Payment', paymentSchema);
