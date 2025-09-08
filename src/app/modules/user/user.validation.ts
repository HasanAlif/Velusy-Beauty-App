import { UserRole } from "../../models";
import { z } from "zod";

const CreateUserValidationSchema = z
  .object({
    firstName: z.string().min(2).max(30),
    lastName: z.string().min(2).max(30),
    email: z.string().email(),
    phone: z.string().regex(/^\+?[0-9]{10,15}$/),
    city: z.string(),
    streetAddress: z.string(),
    profilePicture: z.string().optional(),
    password: z.string().min(8),
    confirmPassword: z.string().optional(),
    role: z.nativeEnum(UserRole),
    fcmToken: z.string().optional(),
    // lat: z.number().optional(),
    // lon: z.number().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

const UserLoginValidationSchema = z.object({
  body: z.object({
    email: z.string().email().nonempty("Email is required"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters long")
      .nonempty("Password is required"),
    fcmToken: z.string().optional(),
    // lat: z.number().optional(),
    // lon: z.number().optional(),
  }),
});

const userProfileComplete = z.object({
  body: z.object({
    einNumber: z.string().optional(),
    naicsCode: z.string().optional(),
    businessName: z.string().optional(),
    location: z.string().optional(),
    website: z.string().optional(),
    description: z.string().optional(),
    socialMediaTags: z.array(z.string()).optional(),
    specificCategory: z.array(z.string()).optional(),
  }),
});

const userOptionalProfileSchema = z.object({
  fullName: z.string().optional(),
  email: z.string().email().optional(),
  phoneNumber: z.string().optional(),
  zipCode: z.string().optional(),
  // lat: z.number().optional(),
  // lon: z.number().optional(),
  einNumber: z.string().optional(),
  naicsCode: z.string().optional(),
  businessName: z.string().optional(),
  location: z.string().optional(),
  website: z.string().optional(),
  description: z.string().optional(),
  socialMediaTags: z.array(z.string()).optional(),
  specificCategory: z.array(z.string()).optional(),
});

const updateScheduleValidationSchema = z.object({
  schedule: z
    .record(
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Date keys must be in YYYY-MM-DD format")
        .refine(
          (dateString) => {
            const inputDate = new Date(dateString);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            return inputDate >= today;
          },
          {
            message: "Cannot schedule dates in the past",
          }
        ),
      z
        .array(
          z.object({
            time: z
              .string()
              .regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format"),
            status: z.enum(
              ["AVAILABLE", "BOOKED", "UNAVAILABLE", "NOT_AVAILABLE"],
              {
                errorMap: () => ({
                  message:
                    "Status must be 'AVAILABLE', 'BOOKED', 'UNAVAILABLE', or 'NOT_AVAILABLE'",
                }),
              }
            ),
          })
        )
        .min(1, "Each date must have at least one time slot")
    )
    .refine((schedule) => Object.keys(schedule).length > 0, {
      message: "Schedule must contain at least one date",
    }),
});

const editUserProfileValidationSchema = z
  .object({
    firstName: z.string().min(2).max(30).optional(),
    lastName: z.string().min(2).max(30).optional(),
    email: z.string().email().optional(),
    phoneNumber: z
      .string()
      .regex(/^\+?[0-9]{10,15}$/)
      .optional(),
    city: z.string().optional(),
    streetAddress: z.string().optional(),
    profileImage: z.string().url().optional(),
  })
  .refine(
    (data) => {
      return Object.values(data).some((value) => value !== undefined);
    },
    {
      message: "At least one field must be provided for update",
    }
  );

const changePasswordValidationSchema = z.object({
  body: z
    .object({
      oldPassword: z
        .string({ required_error: "Old password is required" })
        .min(8, "Old password must be at least 8 characters long"),
      newPassword: z
        .string({ required_error: "New password is required" })
        .min(8, "New password must be at least 8 characters long"),
      confirmPassword: z
        .string({ required_error: "Confirm password is required" })
        .min(8, "Confirm password must be at least 8 characters long"),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: "New password and confirm password do not match",
      path: ["confirmPassword"],
    }),
});

export const UserValidation = {
  CreateUserValidationSchema,
  UserLoginValidationSchema,
  userProfileComplete,
  userOptionalProfileSchema,
  updateScheduleValidationSchema,
  editUserProfileValidationSchema,
  changePasswordValidationSchema,
};
