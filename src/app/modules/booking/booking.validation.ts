import { z } from "zod";

const createSchema = z.object({
  body: z.object({
    name: z
      .string({
        required_error: "Name is required",
      })
      .min(1, "Name cannot be empty"),
    description: z.string().optional(),
  }),
});

const updateSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Name cannot be empty").optional(),
    description: z.string().optional(),
  }),
});

export const bookingValidation = {
  createSchema,
  updateSchema,
};

export const createBookingSchema = z.object({
  senderId: z.string().min(1, "Professional ID is required"),
  receiverId: z.string().min(1, "Guest ID is required"),
  serviceId: z.string().min(1, "Service ID is required"),
  serviceTitle: z.string().optional(),
  extraService: z.string().optional(),
  price: z.number().positive("Price must be greater than 0").optional(),
  extrasPrice: z.number().min(0).optional(),
  date: z.string().min(1, "Date is required"),
  location: z.string().min(1, "Location is required"),
  description: z.string().optional(),
  scheduledAt: z.string().min(1, "Scheduled date is required"),
});

const scheduleRequestSchema = z.object({
  serviceId: z.string().min(1, "Service ID is required"),
  date: z.string().min(1, "Date is required"),
  time: z.string().min(1, "Time is required"),
  location: z.string().min(1, "Location is required"),
});

// Wrapper schema to match validateRequest middleware which passes { body, query, params }
export const createBookingRequestSchema = z.object({
  body: createBookingSchema,
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

export const scheduleRequestValidationSchema = z.object({
  body: scheduleRequestSchema,
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});
