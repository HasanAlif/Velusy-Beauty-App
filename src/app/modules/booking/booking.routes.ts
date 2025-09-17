import express from 'express';
import auth from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import { bookingController } from './booking.controller';
import { createBookingRequestSchema } from './booking.validation';
import { UserRole } from '../../models';

const router = express.Router();

router.post(
  '/request-booking',
  auth(UserRole.PROFESSIONAL, UserRole.GUEST),
  validateRequest(createBookingRequestSchema),
  bookingController.createBookingRequest,
);



export const bookingRoutes = router;