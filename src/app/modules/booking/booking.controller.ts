import httpStatus from 'http-status';
import sendResponse from '../../../shared/sendResponse';
import catchAsync from '../../../shared/catchAsync';
import { bookingService } from './booking.service';

import { createBookingSchema } from './booking.validation';
import ApiError from '../../../errors/ApiErrors';

const createBookingRequest = catchAsync(async (req, res) => {
  // Merge guestId from logged-in user into request body
  // Grab user id from token payload - support both `id` and `_id` fields
  const userId = req.user?._id || req.user?.id || req.user?.userId;

  const bookingData = {
    ...req.body,
    guestId: userId,
  };

  // Validate merged bookingData using Zod schema
  const parseResult = createBookingSchema.safeParse(bookingData);
  if (!parseResult.success) {
    // Return error if validation fails
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      parseResult.error.errors.map((e) => e.message).join(', ')
    );
  }

  // Proceed to the service layer if validation passes
  const bookingResult = await bookingService.createBookingRequest(bookingData);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: bookingResult.message,
    data: bookingResult.booking,
  });
});



export const bookingController = {
  createBookingRequest,
};