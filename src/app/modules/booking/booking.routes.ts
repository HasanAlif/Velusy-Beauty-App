import express from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { bookingController } from "./booking.controller";
import { createBookingRequestSchema } from "./booking.validation";
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

export const bookingRoutes = router;