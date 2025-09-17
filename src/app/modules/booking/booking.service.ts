import mongoose from "mongoose";
import Booking from "./booking.model";
import ApiError from "../../../errors/ApiErrors";
import httpStatus from "http-status";
import { User } from "../../models/User.model";
import { Service } from "../service/service.model";

const createBookingRequest = async (data: any) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // Validate required fields
    const requiredFields = [
      "guestId",
      "professionalId",
      "serviceId",
      "price",
      "date",
      "location",
      "scheduledAt",
    ];
    const missingFields = requiredFields.filter((field) => !data[field]);

    if (missingFields.length > 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Missing required fields: ${missingFields.join(", ")}`
      );
    }

    // Validate ObjectIds
    if (!mongoose.Types.ObjectId.isValid(data.guestId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid guest ID provided");
    }
    if (!mongoose.Types.ObjectId.isValid(data.professionalId)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Invalid professional ID provided"
      );
    }
    if (!mongoose.Types.ObjectId.isValid(data.serviceId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid service ID provided");
    }

    // Validate that guest and professional are different users
    if (data.guestId.toString() === data.professionalId.toString()) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Guest and professional cannot be the same user"
      );
    }

    // Verify guest exists and has GUEST role
    const guest = await User.findById(data.guestId).session(session);
    if (!guest) {
      throw new ApiError(httpStatus.NOT_FOUND, "Guest user not found");
    }
    if (guest.role !== "GUEST") {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "User must have GUEST role to create booking"
      );
    }

    // Verify professional exists and has PROFESSIONAL role
    const professional = await User.findById(data.professionalId).session(
      session
    );
    if (!professional) {
      throw new ApiError(httpStatus.NOT_FOUND, "Professional user not found");
    }
    if (professional.role !== "PROFESSIONAL") {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Service provider must have PROFESSIONAL role"
      );
    }

    // Verify service exists and belongs to the professional
    const service = await Service.findById(data.serviceId).session(session);
    if (!service) {
      throw new ApiError(httpStatus.NOT_FOUND, "Service not found");
    }
    if (service.providerId.toString() !== data.professionalId.toString()) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Service does not belong to the specified professional"
      );
    }

    // Validate booking date is in the future
    const bookingDate = new Date(data.date);
    const now = new Date();
    if (bookingDate <= now) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Booking date must be in the future"
      );
    }

    // Validate price is positive
    if (data.price <= 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Price must be greater than 0"
      );
    }

    // Validate extrasPrice if provided
    if (data.extrasPrice && data.extrasPrice < 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Extras price cannot be negative"
      );
    }

    // Check for conflicting bookings at the same time slot
    const conflictingBooking = await Booking.findOne({
      professionalId: data.professionalId,
      date: bookingDate,
      scheduledAt: data.scheduledAt,
      status: { $in: ["Requested", "Accepted", "InProgress"] },
    }).session(session);

    if (conflictingBooking) {
      throw new ApiError(
        httpStatus.CONFLICT,
        "Professional already has a booking at this time slot"
      );
    }

    // Prepare booking data with service title if not provided
    const bookingData = {
      ...data,
      serviceTitle: data.serviceTitle || service.name,
      extrasPrice: data.extrasPrice || 0,
      status: "Requested", // Ensure status is set to default
    };

    // Create the booking
    const result = await Booking.create([bookingData], { session });

    // Populate the created booking with related data
    const populatedBooking = await Booking.findById(result[0]._id)
      .populate("guestId", "firstName lastName email profilePicture phone")
      .populate(
        "professionalId",
        "firstName lastName email profilePicture phone profession city"
      )
      .populate("serviceId", "name price photo description")
      .session(session);

    await session.commitTransaction();

    return {
      success: true,
      message: "Booking request created successfully",
      booking: populatedBooking,
    };
  } catch (error) {
    await session.abortTransaction();

    if (error instanceof ApiError) {
      throw error;
    }

    console.error("Error creating booking request:", error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to create booking request: " +
        (error instanceof Error ? error.message : "Unknown error")
    );
  } finally {
    session.endSession();
  }
};

export const bookingService = {
  createBookingRequest,
};
