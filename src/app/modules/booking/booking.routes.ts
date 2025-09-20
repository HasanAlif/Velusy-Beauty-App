import express from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { bookingController } from "./booking.controller";
import {
  createBookingRequestSchema,
  scheduleRequestValidationSchema,
} from "./booking.validation";
import { UserRole } from "../../models";

const router = express.Router();

router.post(
  "/request-booking",
  auth(UserRole.PROFESSIONAL),
  //validateRequest(createBookingRequestSchema),
  bookingController.createBookingRequest
);

router.get(
  "/request-booking/:guestId",
  auth(UserRole.GUEST),
  bookingController.getBookingRequest
);

router.post(
  "/book-now/:bookingId",
  auth(UserRole.GUEST),
  bookingController.bookNow
);

router.post(
  "/confirm-booking/:bookingId",
  auth(UserRole.GUEST),
  bookingController.confirmBooking
);

router.post(
  "/schedule-request",
  auth(UserRole.GUEST),
  validateRequest(scheduleRequestValidationSchema),
  bookingController.scheduleRequest
);

router.get(
  "/schedule-requests",
  auth(UserRole.PROFESSIONAL),
  bookingController.getScheduleRequest
);

router.get(
  "/schedule-request/:bookingId",
  auth(UserRole.PROFESSIONAL),
  bookingController.getIndividualScheduleRequest
);

router.patch(
  "/accept-schedule/:bookingId",
  auth(UserRole.PROFESSIONAL),
  bookingController.acceptScheduleRequest
);

router.patch(
  "/reject-schedule/:bookingId",
  auth(UserRole.PROFESSIONAL),
  bookingController.rejectScheduleRequest
);

router.get(
  "/rejected-schedule-requests",
  auth(UserRole.PROFESSIONAL),
  bookingController.getAllRejectScheduleRequest
);

router.get(
  "/pending-schedule-requests",
  auth(UserRole.PROFESSIONAL),
  bookingController.getAllPendingRequest
);

router.patch(
  "/confirm-pending-request/:bookingId",
  auth(UserRole.PROFESSIONAL),
  bookingController.confirmPendingRequest
);

router.get(
  "/in-progress-work",
  auth(UserRole.PROFESSIONAL),
  bookingController.getInProgressWork
);

router.patch(
  "/finish-in-progress-work/:bookingId",
  auth(UserRole.PROFESSIONAL),
  bookingController.finishInProgressWork
);

export const bookingRoutes = router;
