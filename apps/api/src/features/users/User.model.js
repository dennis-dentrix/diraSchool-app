import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLES } from '../../constants/index.js';

const userSchema = new mongoose.Schema(
  {
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
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    staffId: {
      type: String,
      trim: true,
    },
    tscNumber: {
      type: String,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 8,
      select: false, // never returned in queries by default
    },
    role: {
      type: String,
      enum: Object.values(ROLES),
      required: [true, 'Role is required'],
    },
    // null only for superadmin
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      index: true,
    },
    // Only populated for teachers — their assigned class
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
    },
    // Only populated for parents — their children
    children: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
      },
    ],
    // Forces password change before any other action (set on account creation)
    mustChangePassword: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
    },
    // ── Email verification ────────────────────────────────────────────────────
    // Required for school admins on self-registration.
    // Staff accounts created by admins skip this (emailVerified = true on creation).
    emailVerified: {
      type: Boolean,
      default: false,
    },
    // 6-digit numeric OTP — for manual entry on the verify screen.
    // Stored as plaintext; security comes from the short expiry + rate limiting.
    emailVerificationCode: {
      type: String,
      select: false,
    },
    // SHA-256 hash of a 32-byte random token — for the one-click fallback link.
    // Only the hash is stored so a DB leak can't be used to bypass verification.
    emailVerificationToken: {
      type: String,
      select: false,
    },
    // Shared expiry for both OTP and link (30 minutes).
    emailVerificationExpiry: {
      type: Date,
      select: false,
    },

    // ── Password reset ────────────────────────────────────────────────────────
    // Raw token is sent to the user via email. Only the SHA-256 hash is stored
    // so a DB leak cannot be used to reset passwords.
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpiry: {
      type: Date,
      select: false,
    },
    // ── Account invite ────────────────────────────────────────────────────────
    // Sent when an admin creates a new staff account. User clicks the email link
    // to set their own password. Raw token is emailed; only hash stored here.
    // Also reused for admin "re-send invite" / "reset password" actions.
    inviteToken: {
      type: String,
      select: false,
    },
    inviteTokenExpiry: {
      type: Date,
      select: false,
    },
    // True until the user accepts their invite (sets their own password).
    // Blocks login — user must complete invite flow first.
    invitePending: {
      type: Boolean,
      default: false,
    },

    // ── HR / Payroll fields ───────────────────────────────────────────────────
    employmentType: {
      type: String,
      enum: ['TSC', 'BOM', 'contract', 'permanent'],
    },
    dateOfJoining: {
      type: Date,
    },
    nationalId: {
      type: String,
      trim: true,
    },
    salaryGrade: {
      type: String,
      trim: true,
    },
    emergencyContact: {
      name:     { type: String, trim: true },
      phone:    { type: String, trim: true },
      relation: { type: String, trim: true },
    },
    bankDetails: {
      bankName:      { type: String, trim: true },
      accountNumber: { type: String, trim: true },
      branchCode:    { type: String, trim: true },
    },
  },
  { timestamps: true }
);

// ── Indexes ──────────────────────────────────────────────────────────────────

// Email is unique per school — same email can exist in different schools
userSchema.index({ schoolId: 1, email: 1 }, { unique: true });

// User list page: filter by school + active status + role (most common list query)
userSchema.index({ schoolId: 1, isActive: 1, role: 1 });
// Auth middleware: after JWT verify it looks up the user by _id — _id is already indexed,
// but this covers the common auth cache-miss path with select fields
userSchema.index({ schoolId: 1, role: 1 });

// Superadmins have no schoolId — their email must be globally unique
// partialFilterExpression allows multiple null schoolIds without violating uniqueness
userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { schoolId: { $exists: false } },
  }
);
// Login query: findOne({ email, isActive: true }) — the compound {schoolId,email} index
// only helps when schoolId is provided. This covers the login path for all school users.
userSchema.index({ email: 1, isActive: 1 });

// ── Hooks ────────────────────────────────────────────────────────────────────

// Hash password before save (only if modified)
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// ── Instance methods ──────────────────────────────────────────────────────────

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

export default mongoose.models.User || mongoose.model('User', userSchema);
