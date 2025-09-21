import mongoose from "mongoose";
import Booking from "./booking.model";
import ApiError from "../../../errors/ApiErrors";
import httpStatus from "http-status";
import { User } from "../../models/User.model";
import { Service } from "../service/service.model";
import haversineDistance from "../../../utils/HeversineDistance";

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
      paymentStatus: { $in: ["Requested", "Pending", "In Progress"] },
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
    bookingData.paymentStatus = "Requested"; // Ensure status is set to default

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

  bookingData.paymentStatus = "Pending";
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

  bookingData.paymentStatus = "In Progress";
  const result = await bookingData.save();

  return result;
};

const scheduleRequest = async (
  userId: string,
  data: { serviceId: string; date: string; time: string; location: string }
) => {
  const { serviceId, date, time, location } = data;

  if (!serviceId || !date || !time) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "serviceId, date, and time are required"
    );
  }

  if (!mongoose.Types.ObjectId.isValid(serviceId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid service ID");
  }

  // Find the service
  const service = await Service.findById(serviceId);
  if (!service) {
    throw new ApiError(httpStatus.NOT_FOUND, "Service not found");
  }

  const providerId = service.providerId;
  if (!providerId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Service does not have a provider"
    );
  }

  // Check for existing booking at the same time
  const existingBooking = await Booking.findOne({
    serviceId,
    date,
    scheduledAt: time,
    paymentStatus: { $in: ["Requested", "Pending", "In Progress"] },
  });

  if (existingBooking) {
    throw new ApiError(
      httpStatus.CONFLICT,
      "Service is already booked at this time"
    );
  }

  // Find the provider
  const provider = await User.findById(providerId);
  if (!provider || provider.role !== "PROFESSIONAL") {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "Provider not found or not a professional"
    );
  }

  // Validate that the requested schedule is in the future
  const requestedDateTime = new Date(`${date}T${time}`);
  const now = new Date();
  if (requestedDateTime <= now) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Schedule request must be for a future date and time"
    );
  }

  // Check provider's schedule
  const schedule = (provider.schedule as any) || {};
  const dayOfWeek = new Date(date)
    .toLocaleString("en-US", { weekday: "long" })
    .toLowerCase(); // e.g., "monday"

  let isAvailable = false;

  // Check specific date schedule
  if (schedule[date]) {
    const timeSlot = schedule[date].find((slot: any) => slot.time === time);
    if (timeSlot && timeSlot.status === "AVAILABLE") {
      isAvailable = true;
    }
  } else if (schedule[dayOfWeek]) {
    // Check weekly schedule
    const weeklySlots = schedule[dayOfWeek];
    if (Array.isArray(weeklySlots) && weeklySlots.length > 0) {
      // If it's array of strings like "09:00-17:00"
      if (typeof weeklySlots[0] === "string") {
        const range = weeklySlots[0] as string;
        const [start, end] = range.split("-");
        if (time >= start && time <= end) {
          isAvailable = true;
        }
      } else {
        // If it's array of objects
        const timeSlot = weeklySlots.find((slot: any) => slot.time === time);
        if (timeSlot && timeSlot.status === "AVAILABLE") {
          isAvailable = true;
        }
      }
    }
  }

  if (!isAvailable) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Provider is not available at this time"
    );
  }

  // Create the booking request
  const bookingData = {
    guestId: userId,
    professionalId: providerId,
    serviceId,
    date,
    scheduledAt: time,
    location,
    status: "Requested",
    serviceName: service.name,
    price: service.price,
    description: service.description,
  };

  const newBooking = await Booking.create(bookingData);

  return {
    success: true,
    message: "Schedule request created successfully",
    booking: newBooking,
  };
};

const getScheduleRequest = async (userId: string) => {
  const bookings = await Booking.find({
    professionalId: userId,
    status: "Requested",
  })
    .populate("guestId", "latitude longitude")
    .populate("professionalId", "latitude longitude")
    .populate("serviceId", "name price photo description")
    .sort({ createdAt: -1 });

  // Calculate distance and return simplified response
  const simplifiedBookings = bookings.map((booking: any) => {
    const bookingObj = booking.toObject();
    const guest = bookingObj.guestId as any;
    const professional = bookingObj.professionalId as any;
    const service = bookingObj.serviceId as any;

    let distance = null;
    if (
      guest &&
      professional &&
      guest.latitude &&
      guest.longitude &&
      professional.latitude &&
      professional.longitude
    ) {
      const calculatedDistance = haversineDistance(
        guest.latitude,
        guest.longitude,
        professional.latitude,
        professional.longitude
      );
      distance = Math.round(calculatedDistance * 100) / 100;
    }

    return {
      _id: bookingObj._id,
      serviceName: service?.name || null,
      serviceImage: service?.photo || null,
      servicePrice: service?.price || null,
      distance: distance,
      createdAt: bookingObj.createdAt,
    };
  });

  return simplifiedBookings;
};

const getIndividualScheduleRequest = async (
  userId: string,
  bookingId: string
) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid booking ID");
  }

  const booking = await Booking.findById(bookingId)
    .populate("guestId", "firstName lastName profilePicture status")
    .populate("serviceId", "name price photo description");

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  const service = booking.serviceId as any;
  const guest = booking.guestId as any;

  return {
    serviceImage: service?.photo || null,
    serviceName: service?.name || null,
    serviceDescription: service?.description || null,
    RequestedGuestImage: guest?.profilePicture || null,
    RequestedGuestName: `${guest?.firstName || ""} ${
      guest?.lastName || ""
    }`.trim(),
    RequestedGuestStatus: guest.status,
    servicePrice: service?.price || null,
    RequestedTime: booking.scheduledAt,
    RequestedDate: booking.date,
    RequestedLocation: booking.location,
    RequestedStatus: booking.status,
  };
};

const acceptScheduleRequest = async (userId: string, bookingId: string) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid booking ID");
  }

  const booking = await Booking.findById(bookingId);

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  if (booking.professionalId.toString() !== userId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "You can only Accept your own services"
    );
  }

  if (booking.status !== "Requested") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Only bookings with status 'Requested' can be accepted"
    );
  }
  booking.status = "Pending";
  await booking.save();

  return {
    _id: booking._id,
    RequestedStatus: booking.status,
  };
};

const rejectScheduleRequest = async (userId: string, bookingId: string) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid booking ID");
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  if (booking.professionalId.toString() !== userId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "You can only Reject your own services"
    );
  }

  if (booking.status !== "Requested") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Only bookings with status 'Requested' can be rejected"
    );
  }

  booking.status = "Rejected";
  await booking.save();

  return {
    _id: booking._id,
    RequestedStatus: booking.status,
  };
};

const getAllRejectScheduleRequest = async (userId: string) => {
  const bookings = await Booking.find({
    professionalId: userId,
    status: "Rejected",
  })
    .populate("guestId", "latitude longitude")
    .populate("professionalId", "latitude longitude")
    .populate("serviceId", "name price photo description")
    .sort({ createdAt: -1 });

  const simplifiedBookings = bookings.map((booking: any) => {
    const bookingObj = booking.toObject();
    const guest = bookingObj.guestId as any;
    const professional = bookingObj.professionalId as any;
    const service = bookingObj.serviceId as any;

    let distance = null;
    if (
      guest &&
      professional &&
      guest.latitude &&
      guest.longitude &&
      professional.latitude &&
      professional.longitude
    ) {
      const calculatedDistance = haversineDistance(
        guest.latitude,
        guest.longitude,
        professional.latitude,
        professional.longitude
      );
      distance = Math.round(calculatedDistance * 100) / 100;
    }

    return {
      _id: bookingObj._id,
      serviceName: service?.name || null,
      serviceImage: service?.photo || null,
      servicePrice: service?.price || null,
      distance: distance,
      RequestedStatus: booking.status,
    };
  });

  return simplifiedBookings;
};

const getAllPendingRequest = async (userId: string) => {
  const bookings = await Booking.find({
    professionalId: userId,
    status: "Pending",
  })
    .populate("guestId", "latitude longitude")
    .populate("professionalId", "latitude longitude")
    .populate("serviceId", "name price photo description")
    .sort({ createdAt: -1 });

  const simplifiedBookings = bookings.map((booking: any) => {
    const bookingObj = booking.toObject();
    const guest = bookingObj.guestId as any;
    const professional = bookingObj.professionalId as any;
    const service = bookingObj.serviceId as any;

    let distance = null;
    if (
      guest &&
      professional &&
      guest.latitude &&
      guest.longitude &&
      professional.latitude &&
      professional.longitude
    ) {
      const calculatedDistance = haversineDistance(
        guest.latitude,
        guest.longitude,
        professional.latitude,
        professional.longitude
      );
      distance = Math.round(calculatedDistance * 100) / 100;
    }

    return {
      _id: bookingObj._id,
      serviceName: service?.name || null,
      serviceImage: service?.photo || null,
      servicePrice: service?.price || null,
      distance: distance,
      RequestedStatus: booking.status,
    };
  });

  return simplifiedBookings;
};

const confirmPendingRequest = async (userId: string, bookingId: string) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid booking ID");
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  if (booking.professionalId.toString() !== userId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "You can only confirm your own services"
    );
  }

  if (booking.status !== "Pending") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Only bookings with status 'Pending' can be confirmed"
    );
  }

  // Check if professional already has an "In Progress" booking
  const inProgressCount = await Booking.countDocuments({
    professionalId: userId,
    status: "In Progress",
  });

  if (inProgressCount > 0) {
    throw new ApiError(
      httpStatus.CONFLICT,
      "You already have an In Progress Work. Please finish your current work before confirming a new one."
    );
  }

  booking.status = "In Progress";
  await booking.save();

  return {
    _id: booking._id,
    RequestedStatus: booking.status,
  };
};

const getInProgressWork = async (userId: string) => {
  const booking = await Booking.findOne({
    professionalId: userId,
    status: "In Progress",
  })
    .populate("guestId", "firstName lastName profilePicture")
    .populate("serviceId", "name price photo");

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "No In Progress Work found");
  }

  const bookingObj = booking.toObject();
  const guest = bookingObj.guestId as any;
  const service = bookingObj.serviceId as any;

  return {
    _id: booking._id,
    RequestedStatus: booking.status,
    serviceImage: service?.photo || null,
    serviceLocation: booking.location,
    RequestedGuestImage: guest?.profilePicture || null,
    RequestedGuestName: `${guest?.firstName || ""} ${
      guest?.lastName || ""
    }`.trim(),
    serviceName: service?.name || null,
    servicePrice: service?.price || null,
    serviceTime: booking.scheduledAt,
  };
};

const finishInProgressWork = async (userId: string, bookingId: string) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid booking ID");
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  if (booking.professionalId.toString() !== userId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "You can only finish your own services"
    );
  }

  if (booking.status !== "In Progress") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Only bookings with status 'In Progress' can be finished"
    );
  }

  booking.status = "Completed";
  await booking.save();

  return {
    _id: booking._id,
    RequestedStatus: booking.status,
  };
};

const getCompletedWork = async (userId: string) => {
  const bookings = await Booking.find({
    professionalId: userId,
    status: "Completed",
  })
    .populate("guestId", "latitude longitude")
    .populate("professionalId", "latitude longitude")
    .populate("serviceId", "name price photo description")
    .sort({ createdAt: -1 });

  if (!bookings || bookings.length === 0) {
    throw new ApiError(httpStatus.NOT_FOUND, "No Completed Work found");
  }

  const simplifiedBookings = bookings.map((booking: any) => {
    const bookingObj = booking.toObject();
    const guest = bookingObj.guestId as any;
    const professional = bookingObj.professionalId as any;
    const service = bookingObj.serviceId as any;

    let distance = null;
    if (
      guest &&
      professional &&
      guest.latitude &&
      guest.longitude &&
      professional.latitude &&
      professional.longitude
    ) {
      const calculatedDistance = haversineDistance(
        guest.latitude,
        guest.longitude,
        professional.latitude,
        professional.longitude
      );
      distance = Math.round(calculatedDistance * 100) / 100;
    }

    return {
      _id: bookingObj._id,
      serviceName: service?.name || null,
      serviceImage: service?.photo || null,
      servicePrice: service?.price || null,
      distance: distance,
      Status: booking.status,
    };
  });

  return simplifiedBookings;
};

const getGuestRequest = async (userId: string) => {
  const bookings = await Booking.find({
    guestId: userId,
    status: { $in: ["Requested", "Pending", "In Progress"] },
  })
    .populate("guestId", "latitude longitude")
    .populate("professionalId", "latitude longitude")
    .populate("serviceId", "name price photo description")
    .sort({ createdAt: -1 });

  const simplifiedBookings = bookings.map((booking: any) => {
    const bookingObj = booking.toObject();
    const guest = bookingObj.guestId as any;
    const professional = bookingObj.professionalId as any;
    const service = bookingObj.serviceId as any;

    let distance = null;
    if (
      guest &&
      professional &&
      guest.latitude &&
      guest.longitude &&
      professional.latitude &&
      professional.longitude
    ) {
      const calculatedDistance = haversineDistance(
        guest.latitude,
        guest.longitude,
        professional.latitude,
        professional.longitude
      );
      distance = Math.round(calculatedDistance * 100) / 100;
    }

    return {
      _id: bookingObj._id,
      serviceName: service?.name || null,
      serviceImage: service?.photo || null,
      servicePrice: service?.price || null,
      distance: distance,
      RequestedStatus: booking.status,
    };
  });

  return simplifiedBookings;
};

const getGuestRequestDetails = async (userId: string, bookingId: string) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid booking ID");
  }

  const booking = await Booking.findById(bookingId)
    .populate("professionalId", "firstName lastName profilePicture status profession")
    .populate("serviceId", "name price photo description");

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  const service = booking.serviceId as any;
  const professional = booking.professionalId as any;

  return {
    serviceImage: service?.photo || null,
    serviceName: service?.name || null,
    serviceDescription: service?.description || null,
    ProviderImage: professional?.profilePicture || null,
    ProviderName: `${professional?.firstName || ""} ${
      professional?.lastName || ""
    }`.trim(),
    ProviderProfession: professional?.profession || null,
    ProviderStatus: professional.status,
    servicePrice: service?.price || null,
    RequestedTime: booking.scheduledAt,
    RequestedDate: booking.date,
    RequestedLocation: booking.location,
    RequestedStatus: booking.status,
  };
};

export const bookingService = {
  createBookingRequest,
  getBookingRequest,
  bookNow,
  confirmBooking,
  confirmPendingRequest,
  getIndividualScheduleRequest,
  scheduleRequest,
  getScheduleRequest,
  acceptScheduleRequest,
  rejectScheduleRequest,
  getAllRejectScheduleRequest,
  getAllPendingRequest,
  getInProgressWork,
  finishInProgressWork,
  getCompletedWork,
  getGuestRequest,
  getGuestRequestDetails,
};
