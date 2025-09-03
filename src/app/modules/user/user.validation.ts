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
  email: z.string().email().nonempty("Email is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .nonempty("Password is required"),
  fcmToken: z.string().optional(),
  // lat: z.number().optional(),
  // lon: z.number().optional(),
});

const userProfileComplete = z.object({
  einNumber: z.string().optional(),
  naicsCode: z.string().optional(),
  businessName: z.string().optional(),
  location: z.string().optional(),
  website: z.string().optional(),
  description: z.string().optional(),
  socialMediaTags: z.array(z.string()).optional(),
  specificCategory: z.array(z.string()).optional(),
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

export const UserValidation = {
  CreateUserValidationSchema,
  UserLoginValidationSchema,
  userProfileComplete,
  userOptionalProfileSchema,
};
