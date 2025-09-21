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
  scheduledAt: z
    .string()
    .min(1, "Scheduled date is required")
    .refine((val) => {
      // Allow single time (HH:MM) or time range (HH:MM-HH:MM)
      const singleTimeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      const timeRangeRegex =
        /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]-([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      return singleTimeRegex.test(val) || timeRangeRegex.test(val);
    }, "Scheduled time must be in format HH:MM or HH:MM-HH:MM"),
});

const scheduleRequestSchema = z
  .object({
    serviceId: z.string().min(1, "Service ID is required"),
    date: z.string().min(1, "Date is required"),
    time: z.string().optional(),
    timeRange: z.string().optional(),
    location: z.string().min(1, "Location is required"),
  })
  .refine((data) => {
    // Either time or timeRange must be provided
    if (!data.time && !data.timeRange) {
      throw new Error("Either time or timeRange is required");
    }
    return true;
  })
  .transform((data) => {
    // Convert time to timeRange if time is provided
    if (data.time && !data.timeRange) {
      // If time is already a range, use it as is, otherwise convert single time to range
      if (data.time.includes("-")) {
        return { ...data, timeRange: data.time, time: undefined };
      } else {
        // Convert single time to a range (add 1 hour)
        const [hours, minutes] = data.time.split(":");
        const startHour = parseInt(hours);
        const endHour = (startHour + 1) % 24;
        const timeRange = `${data.time}-${endHour
          .toString()
          .padStart(2, "0")}:${minutes}`;
        return { ...data, timeRange, time: undefined };
      }
    }
    return data;
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
