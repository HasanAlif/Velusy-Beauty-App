import { z } from "zod";

const createSchema = z.object({
  body: z.object({
    name: z.string({ required_error: "Service name is required" }).min(2),
    atHome: z
      .union([z.boolean(), z.string()])
      .optional()
      .transform((val) => {
        if (typeof val === "string") return val === "true";
        return val || false;
      }),
    atProviderLocation: z
      .union([z.boolean(), z.string()])
      .optional()
      .transform((val) => {
        if (typeof val === "string") return val === "true";
        return val || false;
      }),
    description: z.string().max(2000).optional(),
    price: z.union([z.number(), z.string()]).transform((val) => {
      const parsed = typeof val === "string" ? parseFloat(val) : val;
      if (isNaN(parsed)) throw new Error("Price must be a valid number");
      if (parsed < 0) throw new Error("Price must be non-negative");
      return parsed;
    }),
  }),
});

const updateSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    atHome: z
      .union([z.boolean(), z.string()])
      .optional()
      .transform((val) => {
        if (typeof val === "string") return val === "true";
        return val;
      }),
    atProviderLocation: z
      .union([z.boolean(), z.string()])
      .optional()
      .transform((val) => {
        if (typeof val === "string") return val === "true";
        return val;
      }),
    description: z.string().max(2000).optional(),
    price: z
      .union([z.number(), z.string()])
      .optional()
      .transform((val) => {
        if (val === undefined || val === null) return undefined;
        const parsed = typeof val === "string" ? parseFloat(val) : val;
        if (isNaN(parsed)) throw new Error("Price must be a valid number");
        if (parsed < 0) throw new Error("Price must be non-negative");
        return parsed;
      }),
  }),
});

const listQuery = z.object({
  query: z.object({
    search: z.string().optional(),
    page: z.coerce.number().min(1).optional(),
    limit: z.coerce.number().min(1).max(100).optional(),
    providerId: z.string().optional(),
  }),
});

const serviceDetailsSchema = z.object({
  params: z.object({
    serviceId: z
      .string({ required_error: "serviceId is required" })
      .regex(/^[0-9a-fA-F]{24}$/, "serviceId must be a valid MongoDB ObjectId"),
  }),
});

export const ServiceValidation = {
  createSchema,
  updateSchema,
  listQuery,
  serviceDetailsSchema,
};
