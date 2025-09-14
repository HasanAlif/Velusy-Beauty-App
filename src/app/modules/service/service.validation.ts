import { z } from "zod";

const createSchema = z.object({
  body: z.object({
    categoryId: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid category ID format")
      .optional(),
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
    categoryId: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid category ID format")
      .optional(),
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

const categoryServicesSchema = z.object({
  params: z.object({
    categoryId: z
      .string({ required_error: "categoryId is required" })
      .regex(
        /^[0-9a-fA-F]{24}$/,
        "categoryId must be a valid MongoDB ObjectId"
      ),
  }),
  query: z.object({
    search: z.string().optional(),
    page: z.coerce.number().min(1).optional(),
    limit: z.coerce.number().min(1).max(100).optional(),
  }),
});

const filterSchema = z.object({
  query: z
    .object({
      searchTerm: z.string().max(100).optional(),

      // Location filters
      location: z.string().max(100).optional(),
      city: z.string().max(100).optional(),
      streetAddress: z.string().max(200).optional(),

      // Category filter
      categoryId: z
        .string()
        .regex(/^[0-9a-fA-F]{24}$/, "Invalid category ID format")
        .optional(),

      // Service filters
      serviceName: z.string().max(100).optional(),

      // Price range filters
      minPrice: z.coerce.number().min(0).optional(),
      maxPrice: z.coerce.number().min(0).optional(),

      // Professional level filter
      professionalLevel: z
        .enum(["BEGINNER", "RISING_STAR", "PRO", "PRO_MASTER"])
        .optional(),

      // Verified professionals filter
      isVerified: z.coerce.boolean().optional(),

      // Pagination
      page: z.coerce.number().min(1).default(1).optional(),
      limit: z.coerce.number().min(1).max(100).default(20).optional(),
    })
    .refine(
      (data) => {
        // If both minPrice and maxPrice are provided, minPrice should be <= maxPrice
        if (data.minPrice !== undefined && data.maxPrice !== undefined) {
          return data.minPrice <= data.maxPrice;
        }
        return true;
      },
      {
        message: "minPrice must be less than or equal to maxPrice",
      }
    ),
});

const unifiedSearchSchema = z.object({
  query: z.object({
    // Search parameter for service names and professional names
    search: z
      .string()
      .min(1, "Search term is required")
      .max(100, "Search term must be between 1 and 100 characters"),

    // Pagination
    page: z.coerce.number().min(1).default(1).optional(),
    limit: z.coerce.number().min(1).max(100).default(20).optional(),
  }),
});

export const ServiceValidation = {
  createSchema,
  updateSchema,
  listQuery,
  serviceDetailsSchema,
  categoryServicesSchema,
  filterSchema,
  unifiedSearchSchema,
};
