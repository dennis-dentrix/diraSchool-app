import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140,
    },
    message: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    type: {
      type: String,
      enum: ['info', 'success', 'warning', 'error'],
      default: 'info',
      index: true,
    },
    link: {
      type: String,
      trim: true,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// List query: filter by user, sort by newest
notificationSchema.index({ schoolId: 1, userId: 1, createdAt: -1 });
// Unread-count query: partial index only on unread docs — sparse would skip null values
// so we use partialFilterExpression to index only where readAt is null (unread)
notificationSchema.index(
  { schoolId: 1, userId: 1 },
  { partialFilterExpression: { readAt: null }, name: 'unread_count_idx' }
);

export default mongoose.models.Notification ||
  mongoose.model('Notification', notificationSchema);

