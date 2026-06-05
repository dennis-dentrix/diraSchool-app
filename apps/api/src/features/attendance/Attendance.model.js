import mongoose from 'mongoose';
import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_REGISTER_STATUSES,
} from '../../constants/index.js';

const attendanceEntrySchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(ATTENDANCE_STATUSES),
      required: true,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 300,
    },
  },
  { _id: false }
);

const attendanceSchema = new mongoose.Schema(
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
    // Day-level register date (normalised to midnight UTC)
    date: {
      type: Date,
      required: true,
      index: true,
    },
    academicYear: {
      type: String,
      required: true,
      match: [/^\d{4}$/, 'Academic year must be a 4-digit year'],
    },
    term: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(ATTENDANCE_REGISTER_STATUSES),
      default: ATTENDANCE_REGISTER_STATUSES.DRAFT,
    },
    entries: {
      type: [attendanceEntrySchema],
      default: [],
    },
    takenByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isSubstitute: {
      type: Boolean,
      default: false,
    },
    substituteTeacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    substituteNote: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    submittedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

// One register per class per day in a school
attendanceSchema.index({ schoolId: 1, classId: 1, date: 1 }, { unique: true });

export default mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);
