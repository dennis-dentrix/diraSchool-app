import mongoose from 'mongoose';
import { PLAN_TIERS } from '../../constants/index.js';

const subscriptionPaymentSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    initiatedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    merchantReference: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
      default: 'pending',
      index: true,
    },
    billingCycle: {
      type: String,
      enum: ['per-term', 'annual', 'multi-year'],
      default: 'per-term',
    },
    currency: {
      type: String,
      default: 'KES',
      uppercase: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    studentCount: {
      type: Number,
      required: true,
      min: 1,
    },
    addOns: {
      transport: { type: Boolean, default: false },
      sms:       { type: Boolean, default: false },
    },
    addOnsPerTerm: {
      type: Number,
      min: 0,
      default: 0,
    },
    subtotalExVat: {
      type: Number,
      required: true,
      min: 0,
    },
    vatAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    selectedPlanTier: {
      type: String,
      enum: Object.values(PLAN_TIERS),
      default: PLAN_TIERS.STANDARD,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 240,
    },
    checkoutUrl: {
      type: String,
      trim: true,
    },
    paidAt: Date,
    paystackRawResponse: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  { timestamps: true }
);

subscriptionPaymentSchema.index({ schoolId: 1, createdAt: -1 });

export default mongoose.models.SubscriptionPayment
  || mongoose.model('SubscriptionPayment', subscriptionPaymentSchema);
