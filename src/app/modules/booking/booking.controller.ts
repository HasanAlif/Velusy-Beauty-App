import httpStatus from "http-status";
import sendResponse from "../../../shared/sendResponse";
import catchAsync from "../../../shared/catchAsync";
import { bookingService } from "./booking.service";

import { createBookingSchema } from "./booking.validation";
import ApiError from "../../../errors/ApiErrors";
import mongoose from "mongoose";

const createBookingRequest = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.user?.id || req.user?.userId;

  const { guestId, ...data } = req.body;

  if (!guestId || typeof guestId !== "string" || guestId.trim() === "") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "guestId is required and must be a non-empty string in request body"
    );
  }

  if (!mongoose.Types.ObjectId.isValid(guestId)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "guestId must be a valid MongoDB ObjectId"
    );
  }

  const parseResult = createBookingSchema.safeParse({
    senderId: userId,
    receiverId: guestId,
    ...data,
  });
  if (!parseResult.success) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      parseResult.error.errors.map((e) => e.message).join(", ")
    );
  }

  const bookingResult = await bookingService.createBookingRequest(
    userId,
    guestId,
    data
  );
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: bookingResult.message,
    data: bookingResult.booking,
  });
});

const getBookingRequest = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.user?.id || req.user?.userId;
  const { guestId } = req.params;

  const booking = await bookingService.getBookingRequest(userId, guestId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Booking request retrieved successfully",
    data: booking,
  });
});

const bookNow = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.user?.id || req.user?.userId;
  const { bookingId } = req.params;

  const booking = await bookingService.bookNow(userId, { bookingId });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Booking confirmed successfully",
    data: booking,
  });
});

const confirmBooking = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.user?.id || req.user?.userId;
  const { bookingId } = req.params;

  const booking = await bookingService.confirmBooking(userId, { bookingId });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Booking confirmed successfully",
    data: booking,
  });
});

const scheduleRequest = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.user?.id || req.user?.userId;
  const { serviceId, date, timeRange, location } = req.body;

  const result = await bookingService.scheduleRequest(userId, {
    serviceId,
    date,
    timeRange,
    location,
  });
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: result.message,
    data: result.booking,
  });
});

const getScheduleRequest = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.user?.id || req.user?.userId;

  const bookings = await bookingService.getScheduleRequest(userId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Schedule requests retrieved successfully",
    data: bookings,
  });
});

const getIndividualScheduleRequest = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.user?.id || req.user?.userId;
  const { bookingId } = req.params;

  const booking = await bookingService.getIndividualScheduleRequest(
    userId,
    bookingId
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Individual schedule request retrieved successfully",
    data: booking,
  });
});

const acceptScheduleRequest = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.user?.id || req.user?.userId;
  const { bookingId } = req.params;

  const booking = await bookingService.acceptScheduleRequest(userId, bookingId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Schedule request Accepted successfully",
    data: booking,
  });
});

const rejectScheduleRequest = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.user?.id || req.user?.userId;
  const { bookingId } = req.params;

  const booking = await bookingService.rejectScheduleRequest(userId, bookingId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Schedule request rejected successfully",
    data: booking,
  });
});

const getAllRejectScheduleRequest = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.user?.id || req.user?.userId;

  const bookings = await bookingService.getAllRejectScheduleRequest(userId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "All rejected schedule requests retrieved successfully",
    data: bookings,
  });
});

const getAllPendingRequest = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.user?.id || req.user?.userId;

  const bookings = await bookingService.getAllPendingRequest(userId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "All pending schedule requests retrieved successfully",
    data: bookings,
  });
});

const confirmPendingRequest = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.user?.id || req.user?.userId;
  const { bookingId } = req.params;

  const booking = await bookingService.confirmPendingRequest(userId, bookingId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Pending request confirmed successfully",
    data: booking,
  });
});

const getInProgressWork = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.user?.id || req.user?.userId;

  const booking = await bookingService.getInProgressWork(userId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "In Progress Work retrieved successfully",
    data: booking,
  });
});

const finishInProgressWork = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.user?.id || req.user?.userId;
  const { bookingId } = req.params;

  const booking = await bookingService.finishInProgressWork(userId, bookingId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "In Progress Work finished successfully",
    data: booking,
  });
});

const getCompletedWork = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.user?.id || req.user?.userId;

  const bookings = await bookingService.getCompletedWork(userId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Completed Work retrieved successfully",
    data: bookings,
  });
});

const getGuestRequest = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.user?.id || req.user?.userId;

  const bookings = await bookingService.getGuestRequest(userId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Guest booking requests retrieved successfully",
    data: bookings,
  });
});

const getGuestRequestDetails = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.user?.id || req.user?.userId;
  const { bookingId } = req.params;

  const booking = await bookingService.getGuestRequestDetails(
    userId,
    bookingId
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Guest booking request details retrieved successfully",
    data: booking,
  });
});

const guestCompletedBookings = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.user?.id || req.user?.userId;

  const bookings = await bookingService.guestCompletedBookings(userId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Guest completed bookings retrieved successfully",
    data: bookings,
  });
});

export const bookingController = {
  createBookingRequest,
  getBookingRequest,
  bookNow,
  confirmBooking,
  scheduleRequest,
  getScheduleRequest,
  getIndividualScheduleRequest,
  acceptScheduleRequest,
  rejectScheduleRequest,
  getAllRejectScheduleRequest,
  getAllPendingRequest,
  confirmPendingRequest,
  getInProgressWork,
  finishInProgressWork,
  getCompletedWork,
  getGuestRequest,
  getGuestRequestDetails,
  guestCompletedBookings,
};
