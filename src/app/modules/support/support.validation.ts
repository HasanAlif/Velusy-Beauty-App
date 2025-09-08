import { z } from "zod";

const createSchema = z.object({
  body: z.object({
    name: z
      .string({ required_error: "Name is required" })
      .min(2, "Name should be at least 2 characters long"),
    email: z
      .string({ required_error: "Email is required" })
      .email("Invalid email format"),
    phone: z
      .string({ required_error: "Phone number is required" })
      .min(10, "Phone number is too short"),
    service: z
      .string({ required_error: "Service is required" })
      .min(3, "Please specify the service"),
    note: z
      .string({ required_error: "Note is required" })
      .min(10, "Note should be at least 10 characters long"),
  }),
});

const listQuery = z.object({
  query: z.object({
    page: z.coerce.number().min(1).optional(),
    limit: z.coerce.number().min(1).max(100).optional(),
    search: z.string().optional(),
  }),
});

export const supportValidation = {
  createSchema,
  listQuery,
};
