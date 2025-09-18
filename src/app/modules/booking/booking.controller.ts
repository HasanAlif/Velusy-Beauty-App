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

export const bookingController = {
  createBookingRequest,
  getBookingRequest,
  bookNow,
};
