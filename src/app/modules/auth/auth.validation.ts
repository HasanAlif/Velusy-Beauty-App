import { z } from "zod";

const changePasswordValidationSchema = z.object({
  body: z.object({
    oldPassword: z.string().min(8),
    newPassword: z.string().min(8),
  }),
});

const resetPasswordValidationSchema = z.object({
  body: z
    .object({
      email: z.string().email("Please provide a valid email address"),
      newPassword: z
        .string()
        .min(8, "Password must be at least 8 characters long"),
      confirmPassword: z
        .string()
        .min(8, "Confirm password must be at least 8 characters long"),
      otp: z.string().min(6, "OTP must be at least 6 characters long"),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: "New password and confirm password do not match",
      path: ["confirmPassword"],
    }),
});

export const authValidation = {
  changePasswordValidationSchema,
  resetPasswordValidationSchema,
};
