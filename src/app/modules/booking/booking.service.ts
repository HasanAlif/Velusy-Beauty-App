import mongoose from "mongoose";
import Booking from "./booking.model";
import ApiError from "../../../errors/ApiErrors";
import httpStatus from "http-status";
import { User } from "../../models/User.model";
import { Service } from "../service/service.model";

const createBookingRequest = async (
  senderId: string,
  receiverId: string,
  data: any
) => {
  if (!senderId || !receiverId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "senderId and receiverId are required"
    );
  }

  // Set professionalId from senderId (professional), guestId from receiverId (guest)
  const bookingData = {
    ...data,
    professionalId: senderId,
    guestId: receiverId,
  };

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // Validate required fields
    const requiredFields = [
      "guestId",
      "professionalId",
      "serviceId",
      "date",
      "location",
      "scheduledAt",
    ];
    const missingFields = requiredFields.filter((field) => !bookingData[field]);

    if (missingFields.length > 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Missing required fields: ${missingFields.join(", ")}`
      );
    }

    if (!mongoose.Types.ObjectId.isValid(bookingData.guestId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid guest ID provided");
    }
    if (!mongoose.Types.ObjectId.isValid(bookingData.professionalId)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Invalid professional ID provided"
      );
    }
    if (!mongoose.Types.ObjectId.isValid(bookingData.serviceId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid service ID provided");
    }

    // Verify guest exists and has GUEST role
    const guest = await User.findById(bookingData.guestId).session(session);
    if (!guest) {
      throw new ApiError(httpStatus.NOT_FOUND, "Guest user not found");
    }
    if (guest.role !== "GUEST") {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "User should create booking with GUEST role"
      );
    }

    // Verify professional exists and has PROFESSIONAL role
    const professional = await User.findById(
      bookingData.professionalId
    ).session(session);
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
    const service = await Service.findById(bookingData.serviceId).session(
      session
    );
    if (!service) {
      throw new ApiError(httpStatus.NOT_FOUND, "Service not found");
    }
    if (
      service.providerId.toString() !== bookingData.professionalId.toString()
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Service does not belong to the specified professional"
      );
    }

    // Fetch service data and add to bookingData
    bookingData.serviceName = service.name;
    bookingData.price = service.price;
    bookingData.description = service.description;

    // Validate booking date is in the future
    const bookingDate = new Date(bookingData.date);
    const now = new Date();
    if (bookingDate <= now) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Booking date must be in the future"
      );
    }

    // Validate price is positive
    if (bookingData.price <= 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Price must be greater than 0"
      );
    }

    // Validate extrasPrice if provided
    if (bookingData.extrasPrice && bookingData.extrasPrice < 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Extras price cannot be negative"
      );
    }

    // Check for conflicting bookings at the same time slot
    const conflictingBooking = await Booking.findOne({
      professionalId: bookingData.professionalId,
      date: bookingDate,
      scheduledAt: bookingData.scheduledAt,
      status: { $in: ["Requested", "Accepted", "InProgress"] },
    }).session(session);

    if (conflictingBooking) {
      throw new ApiError(
        httpStatus.CONFLICT,
        "Professional already has a booking at this time slot"
      );
    }

    // Prepare booking data with service title if not provided
    bookingData.serviceTitle = bookingData.serviceTitle || service.name;
    bookingData.extrasPrice = bookingData.extrasPrice || 0;
    bookingData.status = "Requested"; // Ensure status is set to default

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

const getBookingRequest = async (senderId: string, receiverId: string) => {
  if (!mongoose.Types.ObjectId.isValid(senderId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid sender ID provided");
  }

  // const booking = await Booking.findOne({ guestId: senderId, professionalId: receiverId })
  //   .sort({ createdAt: -1 })
  //   .populate("guestId", "firstName lastName email profilePicture phone")
  //   .populate(
  //     "professionalId",
  //     "firstName lastName email profilePicture phone profession city"
  //   )
  //   .populate("serviceId", "name price photo description");

  const booking = await Booking.findOne({
    guestId: senderId,
    professionalId: receiverId,
  })
    .sort({ createdAt: -1 })
    .populate("serviceId", "name price photo description");

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  return booking;
};

const bookNow = async (userId: string, data: { bookingId: string }) => {
  const bookingId = data.bookingId;
  if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid or missing booking ID");
  }

  const bookingData = await Booking.findById(bookingId);
  if (!bookingData) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  if (bookingData.guestId.toString() !== userId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "You can only accept bookings for your own services"
    );
  }

  bookingData.status = "Accepted";
  const result = await bookingData.save();

  return result;
};


const confirmBooking = async (userId: string, data: { bookingId: string }) => {
  const bookingId = data.bookingId;
  if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid or missing booking ID");
  }

  const bookingData = await Booking.findById(bookingId);
  if (!bookingData) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  if (bookingData.guestId.toString() !== userId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "You can only confirm bookings for your own services"
    );
  }

  bookingData.status = "InProgress";
  const result = await bookingData.save();

  return result;
};

export const bookingService = {
  createBookingRequest,
  getBookingRequest,
  bookNow,
  confirmBooking,
};
