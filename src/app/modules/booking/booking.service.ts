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

    // Check for conflicting bookings that overlap with the requested time
    const existingBookings = await Booking.find({
      professionalId: bookingData.professionalId,
      date: bookingDate,
      paymentStatus: { $in: ["Requested", "Pending", "In Progress"] },
    }).session(session);

    // Helper function to check if two time ranges overlap
    const timeRangesOverlap = (range1: string, range2: string) => {
      if (!range1.includes("-") && !range2.includes("-")) {
        // Both are single times
        return range1 === range2;
      }

      let start1, end1, start2, end2;

      if (range1.includes("-")) {
        [start1, end1] = range1.split("-").map((t) => t.replace(":", ""));
      } else {
        start1 = end1 = range1.replace(":", "");
      }

      if (range2.includes("-")) {
        [start2, end2] = range2.split("-").map((t) => t.replace(":", ""));
      } else {
        start2 = end2 = range2.replace(":", "");
      }

      // Convert to minutes for easier comparison
      const start1Minutes =
        parseInt(start1.slice(0, 2)) * 60 + parseInt(start1.slice(2));
      const end1Minutes =
        parseInt(end1.slice(0, 2)) * 60 + parseInt(end1.slice(2));
      const start2Minutes =
        parseInt(start2.slice(0, 2)) * 60 + parseInt(start2.slice(2));
      const end2Minutes =
        parseInt(end2.slice(0, 2)) * 60 + parseInt(end2.slice(2));

      return start1Minutes < end2Minutes && start2Minutes < end1Minutes;
    };

    for (const booking of existingBookings) {
      if (timeRangesOverlap(bookingData.scheduledAt, booking.scheduledAt)) {
        throw new ApiError(
          httpStatus.CONFLICT,
          "Professional already has a booking at this time slot"
        );
      }
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
  data: { serviceId: string; date: string; timeRange: string; location: string }
) => {
  const { serviceId, date, timeRange, location } = data;

  if (!serviceId || !date || !timeRange) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "serviceId, date, and timeRange are required"
    );
  }

  // Parse time range
  const timeRangeRegex =
    /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]-([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timeRangeRegex.test(timeRange)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Time range must be in format HH:MM-HH:MM (e.g., 01:00-03:00)"
    );
  }

  const [startTime, endTime] = timeRange.split("-");

  // Validate that start time is before end time
  if (startTime >= endTime) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Start time must be before end time"
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

  // Check for existing bookings that overlap with the requested time range
  const existingBookings = await Booking.find({
    serviceId,
    date,
    status: { $in: ["Pending", "In Progress"] },
  });

  // Helper function to check if two time ranges overlap
  const timeRangesOverlap = (range1: string, range2: string) => {
    const [start1, end1] = range1.split("-").map((t) => t.replace(":", ""));
    const [start2, end2] = range2.split("-").map((t) => t.replace(":", ""));

    // Convert to minutes for easier comparison
    const start1Minutes =
      parseInt(start1.slice(0, 2)) * 60 + parseInt(start1.slice(2));
    const end1Minutes =
      parseInt(end1.slice(0, 2)) * 60 + parseInt(end1.slice(2));
    const start2Minutes =
      parseInt(start2.slice(0, 2)) * 60 + parseInt(start2.slice(2));
    const end2Minutes =
      parseInt(end2.slice(0, 2)) * 60 + parseInt(end2.slice(2));

    return start1Minutes < end2Minutes && start2Minutes < end1Minutes;
  };

  for (const booking of existingBookings) {
    if (booking.scheduledAt.includes("-")) {
      // Existing booking is a time range
      if (timeRangesOverlap(timeRange, booking.scheduledAt)) {
        throw new ApiError(
          httpStatus.CONFLICT,
          "Service is already booked during this time range"
        );
      }
    } else {
      // Existing booking is a single time - check if it falls within the requested range
      const bookingTime = booking.scheduledAt.replace(":", "");
      const [startTime, endTime] = timeRange.split("-");
      const startMinutes = parseInt(startTime.replace(":", ""));
      const endMinutes = parseInt(endTime.replace(":", ""));
      const bookingMinutes = parseInt(bookingTime);

      if (bookingMinutes >= startMinutes && bookingMinutes <= endMinutes) {
        throw new ApiError(
          httpStatus.CONFLICT,
          "Service is already booked during this time range"
        );
      }
    }
  }

  // Find the provider
  const provider = await User.findById(providerId);
  if (!provider || provider.role !== "PROFESSIONAL") {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "Provider not found or not a professional"
    );
  }

  // Validate that the requested schedule is in the future (check start time)
  const requestedDateTime = new Date(`${date}T${startTime}`);
  const now = new Date();
  if (requestedDateTime <= now) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Schedule request must be for a future date and time"
    );
  }

  // Check provider's schedule for the entire time range
  const schedule = (provider.schedule as any) || {};
  const dayOfWeek = new Date(date)
    .toLocaleString("en-US", { weekday: "long" })
    .toLowerCase(); // e.g., "monday"

  let isAvailable = false;

  // Helper function to check if a time range is fully available
  const isTimeRangeAvailable = (scheduleData: any, requestedRange: string) => {
    const [reqStart, reqEnd] = requestedRange.split("-");

    if (scheduleData[date]) {
      const slots = scheduleData[date];
      if (Array.isArray(slots)) {
        for (const slot of slots) {
          if (slot.status === "AVAILABLE") {
            if (slot.time.includes("-")) {
              const [slotStart, slotEnd] = slot.time.split("-");
              if (slotStart <= reqStart && slotEnd >= reqEnd) {
                return true;
              }
            } else {
              continue;
            }
          }
        }
      }
    } else if (scheduleData[dayOfWeek]) {
      const weeklySlots = scheduleData[dayOfWeek];
      if (Array.isArray(weeklySlots) && weeklySlots.length > 0) {
        if (typeof weeklySlots[0] === "string") {
          for (const range of weeklySlots) {
            const [slotStart, slotEnd] = range.split("-");
            if (slotStart <= reqStart && slotEnd >= reqEnd) {
              return true;
            }
          }
        } else {
          for (const slot of weeklySlots) {
            if (slot.status === "AVAILABLE" && slot.time.includes("-")) {
              const [slotStart, slotEnd] = slot.time.split("-");
              if (slotStart <= reqStart && slotEnd >= reqEnd) {
                return true;
              }
            }
          }
        }
      }
    }
    return false;
  };

  isAvailable = isTimeRangeAvailable(schedule, timeRange);

  if (!isAvailable) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Provider is not available for the entire requested time range"
    );
  }

  // Create the booking request
  const bookingData = {
    guestId: userId,
    professionalId: providerId,
    serviceId,
    date,
    scheduledAt: timeRange,
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
    RequestedDate: booking.date.toISOString().split("T")[0],
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
    .populate(
      "professionalId",
      "firstName lastName profilePicture status profession"
    )
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
    RequestedDate: booking.date.toISOString().split("T")[0],
    RequestedLocation: booking.location,
    RequestedStatus: booking.status,
  };
};

const guestCompletedBookings = async (userId: string) => {
  const bookings = await Booking.find({
    guestId: userId,
    status: "Completed",
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
      Status: booking.status,
    };
  });

  return simplifiedBookings;
};

const getCompletedBookingDetails = async (
  userId: string,
  bookingId: string
) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid booking ID");
  }

  const booking = await Booking.findById(bookingId)
    .populate("guestId", "firstName lastName profilePicture")
    .populate("professionalId", "firstName lastName profilePicture")
    .populate("serviceId", "name price photo description");

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  const service = booking.serviceId as any;
  const guest = booking.guestId as any;
  const professional = booking.professionalId as any;

  return {
    _id: booking._id,
    serviceImage: service?.photo || null,
    serviceName: service?.name || null,
    serviceDescription: service?.description || null,
    professionalName: `${professional?.firstName || ""} ${
      professional?.lastName || ""
    }`.trim(),
    professionalProfilePicture: professional?.profilePicture || null,
    professionalProfession: professional?.profession || null,
    servicePrice: service?.price || null,
    serviceTime: booking.scheduledAt,
    serviceLocation: booking.location,
    status: booking.status,
  };
};

const getRejectedBookings = async (userId: string) => {
  const bookings = await Booking.find({
    guestId: userId,
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
      Status: booking.status,
    };
  });

  return simplifiedBookings;
};

const getRejectedBookingsDetails = async (
  userId: string,
  bookingId: string
) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid booking ID");
  }

  const booking = await Booking.findById(bookingId)
    .populate("guestId", "firstName lastName profilePicture")
    .populate(
      "professionalId",
      "firstName lastName profilePicture profession status"
    )
    .populate("serviceId", "name price photo description");

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  const service = booking.serviceId as any;
  const professional = booking.professionalId as any;

  return {
    _id: booking._id,
    serviceImage: service?.photo || null,
    serviceName: service?.name || null,
    serviceDescription: service?.description || null,
    professionalName: `${professional?.firstName || ""} ${
      professional?.lastName || ""
    }`.trim(),
    professionalProfilePicture: professional?.profilePicture || null,
    professionalProfession: professional?.profession || null,
    professionalStatus: professional?.status || null,
    servicePrice: service?.price || null,
    serviceTime: booking.scheduledAt,
    serviceDate: booking.date.toISOString().split("T")[0],
    serviceLocation: booking.location,
    status: booking.status,
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
  guestCompletedBookings,
  getCompletedBookingDetails,
  getRejectedBookings,
  getRejectedBookingsDetails,
};
