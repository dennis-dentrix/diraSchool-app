import mongoose from 'mongoose';
import { STUDENT_STATUSES } from '../../constants/index.js';

// ── Guardian sub-schema ───────────────────────────────────────────────────────
// Stores rich parent/guardian contact details at enrollment time.
// If the guardian is also given a portal account, userId links to their User record.
const guardianSchema = new mongoose.Schema(
  {
    firstName:    { type: String, required: true, trim: true },
    lastName:     { type: String, required: true, trim: true },
    relationship: {
      type: String,
      enum: ['mother', 'father', 'guardian', 'other'],
      required: true,
    },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    occupation: { type: String, trim: true },
    // If this guardian has been given a parent portal account
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const studentSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: true,
      index: true,
    },
    // Admission number must be unique within the school
    admissionNumber: {
      type: String,
      required: [true, 'Admission number is required'],
      trim: true,
    },
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
    },
    gender: {
      type: String,
      enum: ['male', 'female'],
      required: [true, 'Gender is required'],
    },
    dateOfBirth: {
      type: Date,
    },
    birthCertificateNumber: {
      type: String,
      trim: true,
    },
    assessmentNumber: {
      type: String,
      trim: true,
    },
    enrollmentDate: {
      type: Date,
      default: Date.now,
    },
    // Rich guardian details captured at enrollment
    guardians: {
      type: [guardianSchema],
      default: [],
    },
    // Parent/guardian users with portal access (subset of guardians who have accounts)
    parentIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    status: {
      type: String,
      enum: Object.values(STUDENT_STATUSES),
      default: STUDENT_STATUSES.ACTIVE,
    },
    // Populated when status = transferred
    transferNote: {
      type: String,
      trim: true,
    },
    photo: {
      type: String, // URL / path — populated later
    },
    transportAssignment: {
      routeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TransportRoute',
      },
      routeName: { type: String, trim: true },
      driverName: { type: String, trim: true },
      driverPhone: { type: String, trim: true },
      dropOffPoint: { type: String, trim: true },
      assignedAt: { type: Date },
    },
    // Guards against accidental double-promotion within the same cycle
    // Format: "<academicYear>:<term>" (e.g. "2026:Term 1")
    lastPromotionCycle: { type: String, trim: true },
    lastPromotedAt: { type: Date },
  },
  { timestamps: true }
);

// Admission number is unique per school
studentSchema.index({ schoolId: 1, admissionNumber: 1 }, { unique: true });
// Dashboard/attendance aggregations: filter by school + active status
studentSchema.index({ schoolId: 1, status: 1 });

// ── Hooks — keep Class.studentCount in sync ───────────────────────────────────

studentSchema.post('save', async function (_doc, _next) {
  // Only increment on first save (creation), not on subsequent updates
  if (!this.wasNew) return;
  const Class = mongoose.model('Class');
  await Class.updateOne(
    { _id: this.classId },
    { $inc: { studentCount: 1 } }
  );
});

// Mark isNew before save so we can check it in post hook
studentSchema.pre('save', function (next) {
  this.wasNew = this.isNew;
  next();
});

studentSchema.post('deleteOne', { document: true, query: false }, async function () {
  const Class = mongoose.model('Class');
  await Class.updateOne(
    { _id: this.classId },
    { $inc: { studentCount: -1 } }
  );
});

export default mongoose.models.Student || mongoose.model('Student', studentSchema);
