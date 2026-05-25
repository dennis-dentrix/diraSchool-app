import mongoose from 'mongoose';
import Book from './Book.model.js';
import BookLoan from './BookLoan.model.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { paginate } from '../../utils/pagination.js';
import { LOAN_STATUSES, AUDIT_ACTIONS, AUDIT_RESOURCES } from '../../constants/index.js';
import { logAction } from '../../utils/auditLogger.js';
import { searchRegex } from '../../utils/search.js';

// ── Books ──────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/library/books
 */
export const createBook = asyncHandler(async (req, res) => {
  const { title, author, isbn, category, totalCopies } = req.body;
  const schoolId = req.user.schoolId;

  try {
    const book = await Book.create({
      schoolId,
      title,
      author,
      isbn,
      category,
      totalCopies,
      availableCopies: totalCopies,
    });

    logAction(req, {
      action: AUDIT_ACTIONS.CREATE,
      resource: AUDIT_RESOURCES.BOOK,
      resourceId: book._id,
      meta: { title, totalCopies },
    });

    return sendSuccess(res, { book }, 201);
  } catch (err) {
    if (err.code === 11000) {
      return sendError(res, 'A book with this ISBN already exists in the library.', 409);
    }
    throw err;
  }
});

/**
 * GET /api/v1/library/books
 */
export const listBooks = asyncHandler(async (req, res) => {
  const filter = { schoolId: req.user.schoolId };

  if (req.query.category) filter.category = req.query.category;
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';
  if (req.query.search) {
    const re = searchRegex(req.query.search);
    filter.$or = [{ title: re }, { author: re }, { isbn: re }];
  }

  const total = await Book.countDocuments(filter);
  const { skip, limit, meta } = paginate(req.query, total);

  const books = await Book.find(filter)
    .sort({ title: 1 })
    .skip(skip)
    .limit(limit);

  return sendSuccess(res, { books, meta });
});

/**
 * GET /api/v1/library/books/:id
 */
export const getBook = asyncHandler(async (req, res) => {
  const book = await Book.findOne({ _id: req.params.id, schoolId: req.user.schoolId });
  if (!book) return sendError(res, 'Book not found.', 404);
  return sendSuccess(res, { book });
});

/**
 * PATCH /api/v1/library/books/:id
 */
export const updateBook = asyncHandler(async (req, res) => {
  const book = await Book.findOne({ _id: req.params.id, schoolId: req.user.schoolId });
  if (!book) return sendError(res, 'Book not found.', 404);

  // If totalCopies changes, adjust availableCopies proportionally
  if (req.body.totalCopies !== undefined) {
    const delta = req.body.totalCopies - book.totalCopies;
    req.body.availableCopies = Math.max(0, book.availableCopies + delta);
  }

  Object.assign(book, req.body);
  await book.save();

  return sendSuccess(res, { book });
});

// ── Loans ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/library/loans
 * Issues a book to a borrower (student or staff).
 * Uses a transaction to atomically decrement availableCopies.
 */
export const issueLoan = asyncHandler(async (req, res) => {
  const { bookId, borrowerType, borrowerId, borrowerName, dueDate, notes } = req.body;
  const schoolId = req.user.schoolId;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Lock the book record for update
    const book = await Book.findOne({ _id: bookId, schoolId }).session(session);
    if (!book) {
      await session.abortTransaction();
      return sendError(res, 'Book not found.', 404);
    }
    if (!book.isActive) {
      await session.abortTransaction();
      return sendError(res, 'This book is no longer active.', 400);
    }
    if (book.availableCopies < 1) {
      await session.abortTransaction();
      return sendError(res, 'No copies available for loan.', 409);
    }

    // Decrement available copies
    book.availableCopies -= 1;
    await book.save({ session });

    const [loan] = await BookLoan.create(
      [
        {
          schoolId,
          bookId,
          borrowerType,
          borrowerId,
          borrowerName: borrowerName || undefined,
          dueDate,
          notes: notes || undefined,
          status: LOAN_STATUSES.ACTIVE,
          issuedByUserId: req.user._id,
        },
      ],
      { session }
    );

    await session.commitTransaction();

    logAction(req, {
      action: AUDIT_ACTIONS.ISSUE,
      resource: AUDIT_RESOURCES.BOOK_LOAN,
      resourceId: loan._id,
      meta: { bookId: bookId.toString(), borrowerType, borrowerId: borrowerId.toString(), dueDate },
    });

    return sendSuccess(res, { loan }, 201);
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

/**
 * GET /api/v1/library/loans
 */
export const listLoans = asyncHandler(async (req, res) => {
  const filter = { schoolId: req.user.schoolId };

  if (req.query.bookId)       filter.bookId       = req.query.bookId;
  if (req.query.borrowerId)   filter.borrowerId   = req.query.borrowerId;
  if (req.query.borrowerType) filter.borrowerType = req.query.borrowerType;
  if (req.query.status)       filter.status       = req.query.status;

  const total = await BookLoan.countDocuments(filter);
  const { skip, limit, meta } = paginate(req.query, total);

  const loans = await BookLoan.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('bookId', 'title isbn author')
    .populate('issuedByUserId', 'firstName lastName')
    .populate('returnedToUserId', 'firstName lastName');

  return sendSuccess(res, { loans, meta });
});

/**
 * GET /api/v1/library/loans/:id
 */
export const getLoan = asyncHandler(async (req, res) => {
  const loan = await BookLoan.findOne({ _id: req.params.id, schoolId: req.user.schoolId })
    .populate('bookId', 'title isbn author category')
    .populate('issuedByUserId', 'firstName lastName')
    .populate('returnedToUserId', 'firstName lastName');

  if (!loan) return sendError(res, 'Loan record not found.', 404);
  return sendSuccess(res, { loan });
});

/**
 * POST /api/v1/library/loans/:id/return
 * Marks a loan as returned and increments availableCopies.
 */
export const returnBook = asyncHandler(async (req, res) => {
  const schoolId = req.user.schoolId;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const loan = await BookLoan.findOne({ _id: req.params.id, schoolId }).session(session);
    if (!loan) {
      await session.abortTransaction();
      return sendError(res, 'Loan record not found.', 404);
    }
    if (loan.status === LOAN_STATUSES.RETURNED) {
      await session.abortTransaction();
      return sendError(res, 'This book has already been returned.', 400);
    }

    loan.status          = LOAN_STATUSES.RETURNED;
    loan.returnedAt      = new Date();
    loan.returnedToUserId = req.user._id;
    if (req.body.notes) loan.notes = req.body.notes;
    await loan.save({ session });

    // Increment available copies
    await Book.updateOne(
      { _id: loan.bookId },
      { $inc: { availableCopies: 1 } },
      { session }
    );

    await session.commitTransaction();

    logAction(req, {
      action: AUDIT_ACTIONS.RETURN,
      resource: AUDIT_RESOURCES.BOOK_LOAN,
      resourceId: loan._id,
      meta: { bookId: loan.bookId.toString() },
    });

    return sendSuccess(res, { loan });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

/**
 * PATCH /api/v1/library/loans/:id/overdue
 * Marks an active loan as overdue (can be run by a scheduled job or manually).
 */
export const markOverdue = asyncHandler(async (req, res) => {
  const loan = await BookLoan.findOne({
    _id: req.params.id,
    schoolId: req.user.schoolId,
    status: LOAN_STATUSES.ACTIVE,
  });

  if (!loan) return sendError(res, 'Active loan not found.', 404);

  loan.status = LOAN_STATUSES.OVERDUE;
  await loan.save();

  return sendSuccess(res, { loan });
});
