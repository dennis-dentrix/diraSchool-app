import mongoose from 'mongoose';

const schoolInquirySchema = new mongoose.Schema(
  {
    firstName:  { type: String, required: true, trim: true },
    lastName:   { type: String, required: true, trim: true },
    email:      { type: String, required: true, trim: true, lowercase: true },
    phone:      { type: String, required: true, trim: true },
    schoolName: { type: String, required: true, trim: true },
    message:    { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['pending', 'contacted', 'closed'],
      default: 'pending',
      index: true,
    },
    notes:       { type: String, trim: true, default: '' },
    reviewedAt:  { type: Date, default: null },
    reviewedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

export default mongoose.models.SchoolInquiry ||
  mongoose.model('SchoolInquiry', schoolInquirySchema);
