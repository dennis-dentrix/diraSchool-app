import mongoose from 'mongoose';
import { DAYS_OF_WEEK, TERMS } from '../../constants/index.js';

export const CALENDAR_EVENT_TYPES = [
  'holiday',
  'midterm_break',
  'sports_day',
  'academic_clinic',
  'parents_meeting',
  'school_trip',
  'custom',
];

const calendarEventSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    eventType:   { type: String, enum: CALENDAR_EVENT_TYPES, default: 'custom' },
    date:        { type: Date, required: true },
    endDate:     { type: Date },   // optional — for multi-day events
    description: { type: String, trim: true },
  },
  { timestamps: false }
);

const termDateSchema = new mongoose.Schema(
  {
    name:      { type: String, enum: TERMS, required: true },
    startDate: { type: Date, required: true },
    endDate:   { type: Date, required: true },
  },
  { _id: false }
);

const holidaySchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    date:        { type: Date, required: true },
    description: { type: String, trim: true },
  },
  { timestamps: false }
  // _id is auto-assigned so we can reference holidays by id for DELETE
);

const schoolSettingsSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      unique: true,
      index: true,
    },
    currentAcademicYear: {
      type: String,
      match: [/^\d{4}$/, 'Academic year must be a 4-digit year'],
    },
    // Active term for this school — set by admins, used to auto-populate attendance
    currentTerm: {
      type: String,
      enum: TERMS,
      required: true,
      default: 'Term 1',
    },
    // Term date windows — used to validate attendance dates, lock report card periods, etc.
    terms: {
      type: [termDateSchema],
      default: [],
    },
    // School holidays (no attendance taken, timetable suspended)
    holidays: {
      type: [holidaySchema],
      default: [],
    },
    // Typed calendar events — sports day, midterm breaks, parent meetings, trips, etc.
    calendarEvents: {
      type: [calendarEventSchema],
      default: [],
    },
    // Days the school operates — defaults Mon–Fri
    workingDays: {
      type: [String],
      enum: DAYS_OF_WEEK,
      default: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    },
    // Branding / report card header data
    logo:          { type: String },       // Cloudinary URL
    logoPublicId:  { type: String, trim: true },
    motto:         { type: String, trim: true },
    principalName: { type: String, trim: true },
    // Override the address stored on the School record (optional)
    physicalAddress: { type: String, trim: true },
    // Per-school leave entitlements (working days per year).
    // Falls back to system defaults when not set.
    leaveEntitlements: {
      annual:        { type: Number, default: 21,  min: 0 },
      sick:          { type: Number, default: 10,  min: 0 },
      maternity:     { type: Number, default: 90,  min: 0 },
      paternity:     { type: Number, default: 14,  min: 0 },
      compassionate: { type: Number, default: 5,   min: 0 },
      study:         { type: Number, default: 10,  min: 0 },
      unpaid:        { type: Number, default: 365, min: 0 },
    },
    // Geofence — boundary staff must be within to check in
    geofence: {
      latitude:      { type: Number },
      longitude:     { type: Number },
      radius_meters: { type: Number, default: 150, min: 50, max: 500 },
      configured_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      configured_at: { type: Date },
    },
    // Daily check-in deadline "HH:MM" 24-h Kenya time — late if checked in after this
    checkInDeadline: { type: String, default: '08:00' },
    checkOutTime:    { type: String, default: '17:00' },
  },
  { timestamps: true }
);

export default mongoose.models.SchoolSettings ||
  mongoose.model('SchoolSettings', schoolSettingsSchema);
