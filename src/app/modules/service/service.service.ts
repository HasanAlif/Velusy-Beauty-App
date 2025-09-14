import mongoose from "mongoose";
import { Service } from "./service.model";
import ApiError from "../../../errors/ApiErrors";
import httpStatus from "http-status";
import { IService } from "./service.model";
import { Types } from "mongoose";
import { User } from "../../models";
import { Category } from "../admin/category.model";
import haversineDistance from "../../../utils/HeversineDistance";

type ListArgs = {
  search?: string;
  page?: number;
  limit?: number;
  providerId?: string;
  userId: string;
};

const getAllCategories = async (options: {
  search?: string;
  page?: number;
  limit?: number;
}) => {
  const { search, page = 1, limit = 20 } = options;

  let query = Category.find({});

  if (search) {
    query = query.find({
      name: { $regex: search, $options: "i" },
    });
  }

  const total = await Category.countDocuments(query.getFilter());

  const categories = await query
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  return {
    categories,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const createIntoDb = async (
  payload: Partial<IService>,
  userId: string
): Promise<IService> => {
  let categoryId = payload.categoryId;

  // If categoryId is not provided, auto-detect from user's profession
  if (!categoryId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    if (!user.profession) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "User profession is required to create a service. Please update your profile with a valid profession."
      );
    }

    const category = await Category.findOne({ name: user.profession });
    if (!category) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `No category found for profession "${user.profession}". Please contact admin to add this category.`
      );
    }

    categoryId = new Types.ObjectId(category._id);
  } else {
    const categoryExists = await Category.findById(categoryId);
    if (!categoryExists) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Category not found");
    }
  }

  const servicePayload = {
    ...payload,
    categoryId,
  };

  const created = await Service.create(servicePayload);
  return created;
};

const getListFromDb = async ({
  search,
  page = 1,
  limit = 20,
  providerId,
  userId,
}: ListArgs) => {
  const filter: any = {
    providerId: new Types.ObjectId(userId),
  };

  if (providerId && Types.ObjectId.isValid(providerId)) {
    filter.providerId = new Types.ObjectId(providerId);
  }

  let query = Service.find(filter);
  if (search) {
    query = query.find({ $text: { $search: search } });
  }

  const total = await Service.countDocuments(query.getFilter());
  const data = await query
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  return { meta: { page, limit, total }, data };
};

const getByIdFromDb = async (id: string) => {
  const doc = await Service.findById(id);
  if (!doc) {
    throw new ApiError(httpStatus.NOT_FOUND, "Service not found");
  }
  return doc;
};

const updateIntoDb = async (
  id: string,
  payload: Partial<IService>,
  requester: { id: string; role: string }
) => {
  const existing = await Service.findById(id);
  if (!existing) {
    throw new ApiError(httpStatus.NOT_FOUND, "Service not found");
  }
  if (
    requester.role !== "PROFESSIONAL" &&
    existing.providerId.toString() !== requester.id
  ) {
    throw new ApiError(httpStatus.FORBIDDEN, "You cannot update this service");
  }

  if (payload.categoryId) {
    const categoryExists = await Category.findById(payload.categoryId);
    if (!categoryExists) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Category not found");
    }
  }

  Object.assign(existing, payload, { updatedAt: new Date() });
  await existing.save();
  return existing;
};

const deleteFromDb = async (
  id: string,
  requester: { id: string; role: string }
) => {
  const existing = await Service.findById(id);
  if (!existing) {
    throw new ApiError(httpStatus.NOT_FOUND, "Service not found");
  }
  if (
    requester.role !== "ADMIN" &&
    existing.providerId.toString() !== requester.id
  ) {
    throw new ApiError(httpStatus.FORBIDDEN, "You cannot delete this service");
  }

  if (existing.photo) {
    try {
      const { fileUploader } = await import("../../../helpars/fileUploader");
      await fileUploader.deleteFromCloudinary(existing.photo);
      console.log("Deleted service image from Cloudinary:", existing.photo);
    } catch (error) {
      console.error("Error deleting service image from Cloudinary:", error);
    }
  }

  await Service.findByIdAndDelete(id);
  return { message: "Service permanently deleted" };
};

const serviceDetails = async (serviceId: string) => {
  try {
    if (!Types.ObjectId.isValid(serviceId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid service ID provided");
    }

    // Find the service first
    const service = await Service.findById(serviceId)
      .select({
        name: 1,
        price: 1,
        photo: 1,
        description: 1,
        //atHome: 1,
        //atProviderLocation: 1,
        providerId: 1,
      })
      .lean();

    if (!service) {
      throw new ApiError(httpStatus.NOT_FOUND, "Service not found");
    }

    // Find the provider details
    const provider = await User.findById(service.providerId)
      .select({
        firstName: 1,
        lastName: 1,
        profilePicture: 1,
        serviceCategory: 1,
        city: 1,
        streetAddress: 1,
        schedule: 1,
      })
      .lean();

    if (!provider) {
      throw new ApiError(httpStatus.NOT_FOUND, "Service provider not found");
    }

    // Combine service and provider details
    return {
      // Service information
      serviceId: service._id,
      serviceName: service.name,
      serviceImage: service.photo,
      servicePrice: service.price,
      serviceDescription: service.description,
      //serviceAtHome: service.atHome,
      //serviceAtProviderLocation: service.atProviderLocation,

      // Provider information
      providerId: provider._id,
      providerName: `${provider.firstName || ""} ${
        provider.lastName || ""
      }`.trim(),
      providerImage: provider.profilePicture,
      providerServiceCategory: provider.serviceCategory,
      providerLocation: {
        city: provider.city,
        streetAddress: provider.streetAddress,
      },
      providerSchedule: provider.schedule || {},
    };
  } catch (error) {
    console.error("Error fetching service details:", error);
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Error fetching service details: " +
        (error instanceof Error ? error.message : "Unknown error")
    );
  }
};

const getServicesByCategory = async ({
  categoryId,
  search,
  page = 1,
  limit = 20,
  userId,
}: {
  categoryId: string;
  search?: string;
  page?: number;
  limit?: number;
  userId: string;
}) => {
  const categoryExists = await Category.findById(categoryId);
  if (!categoryExists) {
    throw new ApiError(httpStatus.NOT_FOUND, "Category not found");
  }

  // Get logged-in user's coordinates
  const user = await User.findById(userId).lean();
  if (
    !user ||
    typeof user.latitude !== "number" ||
    typeof user.longitude !== "number"
  ) {
    throw new ApiError(httpStatus.BAD_REQUEST, "User location not found");
  }

  const filter: any = {
    categoryId: new Types.ObjectId(categoryId),
  };

  let query = Service.find(filter);
  if (search) {
    query = query.find({ $text: { $search: search } });
  }

  const total = await Service.countDocuments(query.getFilter());
  const services = await query
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate(
      "providerId",
      "userName profession profilePicture city streetAddress schedule latitude longitude"
    )
    .lean();

  const servicesResponse = services.map((service: any) => {
    let distance = null;
    if (
      service.providerId &&
      typeof service.providerId.latitude === "number" &&
      typeof service.providerId.longitude === "number"
    ) {
      distance = haversineDistance(
        user.latitude,
        user.longitude,
        service.providerId.latitude,
        service.providerId.longitude
      );
    }
    return {
      serviceId: service._id?.toString() || null,
      serviceImage: service.photo || null,
      serviceName: service.name || null,
      price: service.price || null,
      providerName: service.providerId?.userName || null,
      providerImage: service.providerId?.profilePicture || null,
      distance,
    };
  });

  return {
    services: servicesResponse,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getIndividualServiceDetails = async (serviceId: string) => {
  try {
    if (!Types.ObjectId.isValid(serviceId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid service ID provided");
    }

    const service = await Service.findById(serviceId)
      .populate(
        "providerId",
        "userName firstName lastName profession profilePicture city streetAddress schedule"
      )
      .lean();

    if (!service) {
      throw new ApiError(httpStatus.NOT_FOUND, "Service not found");
    }

    const provider = service.providerId as any;

    return {
      serviceImage: service.photo || null,
      serviceName: service.name || null,
      price: service.price || null,
      serviceDescription: service.description || null,
      providerCity: provider?.city || null,
      providerStreetAddress: provider?.streetAddress || null,
      providerName: provider?.userName || null,
      providerImage: provider?.profilePicture || null,
      providerProfession: provider?.profession || null,
      providerSchedule: provider?.schedule || {},
    };
  } catch (error) {
    console.error("Error fetching service details:", error);
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Error fetching service details: " +
        (error instanceof Error ? error.message : "Unknown error")
    );
  }
};

const saveService = async (serviceId: string, userId: string) => {
  const service = await Service.findById(serviceId);
  if (!service) {
    throw new ApiError(httpStatus.NOT_FOUND, "Service not found");
  }

  // Add service to user's saved services (prevents duplicates with $addToSet)
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { $addToSet: { savedServices: serviceId } },
    { new: true }
  ).populate("savedServices", "name price photo description");

  if (!updatedUser) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  return {
    saved: true,
    totalSaved: updatedUser.savedServices?.length || 0,
  };
};

const unsaveService = async (serviceId: string, userId: string) => {
  // Remove service from user's saved services
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { $pull: { savedServices: serviceId } },
    { new: true }
  ).populate("savedServices", "name price photo description");

  if (!updatedUser) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  return {
    saved: false,
    message: "Service removed from saved list",
    totalSaved: updatedUser.savedServices?.length || 0,
  };
};

const getSavedServices = async (userId: string) => {
  const user = await User.findById(userId)
    .populate(
      "savedServices",
      "name price photo description categoryId providerId"
    )
    .select("savedServices");

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  return {
    savedServices: user.savedServices || [],
    totalSaved: user.savedServices?.length || 0,
  };
};

const filterServices = async (req: any, res: any) => {
  try {
    const {
      location,
      city,
      streetAddress,
      categoryId,
      serviceName,
      searchTerm,
      minPrice,
      maxPrice,
      professionalLevel,
      isVerified,
      page = 1,
      limit = 20,
    } = req.query;

    console.log("Filter parameters received:", req.query);

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    const serviceQuery: any = {};

    // Category filter
    if (categoryId && categoryId.trim() !== "") {
      if (Types.ObjectId.isValid(categoryId)) {
        serviceQuery.categoryId = new Types.ObjectId(categoryId);
      }
    }

    // Service name filter or search term in service names
    if (searchTerm && searchTerm.trim() !== "") {
      serviceQuery.name = { $regex: searchTerm.trim(), $options: "i" };
      console.log(`Searching services by term: "${searchTerm}"`);
    } else if (serviceName && serviceName.trim() !== "") {
      serviceQuery.name = { $regex: serviceName.trim(), $options: "i" };
      console.log(`Filtering services by name: "${serviceName}"`);
    }

    // Price range filters
    if (minPrice && minPrice.trim() !== "") {
      serviceQuery.price = { ...serviceQuery.price, $gte: Number(minPrice) };
    }
    if (maxPrice && maxPrice.trim() !== "") {
      serviceQuery.price = { ...serviceQuery.price, $lte: Number(maxPrice) };
    }

    // Build provider query for location and professional level filters
    const providerQuery: any = { role: "PROFESSIONAL" };

    // Add isVerified filter if provided
    if (isVerified === true || isVerified === "true") {
      providerQuery.isVerified = true;
      console.log("Filtering for verified professionals only");
    }

    const providerSearchConditions: any[] = [];

    // Add search term conditions for professionals
    if (searchTerm && searchTerm.trim() !== "") {
      const searchRegex = new RegExp(searchTerm.trim(), "i");
      providerSearchConditions.push(
        { userName: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex },
        { profession: searchRegex }
      );
    }

    // Enhanced location filters - search by professional city or street address
    if (location && location.trim() !== "") {
      const locationRegex = new RegExp(location.trim(), "i");
      providerSearchConditions.push(
        { city: locationRegex },
        { streetAddress: locationRegex }
      );
      console.log(`Searching for professionals in location: "${location}"`);
    } else {
      // Specific city filter
      if (city && city.trim() !== "") {
        providerQuery.city = { $regex: city.trim(), $options: "i" };
        console.log(`Filtering by city: "${city}"`);
      }
      // Specific street address filter
      if (streetAddress && streetAddress.trim() !== "") {
        providerQuery.streetAddress = {
          $regex: streetAddress.trim(),
          $options: "i",
        };
        console.log(`Filtering by street address: "${streetAddress}"`);
      }
    }

    if (providerSearchConditions.length > 0) {
      if (Object.keys(providerQuery).length > 1) {
        providerQuery.$and = [
          { $or: providerSearchConditions },
          ...Object.keys(providerQuery)
            .filter((key) => key !== "role")
            .map((key) => ({ [key]: providerQuery[key] })),
        ];
        Object.keys(providerQuery)
          .filter((key) => !["role", "$and"].includes(key))
          .forEach((key) => delete providerQuery[key]);
      } else {
        providerQuery.$or = providerSearchConditions;
      }
    }

    // Professional level filter
    if (professionalLevel && professionalLevel.trim() !== "") {
      if (providerQuery.$and) {
        providerQuery.$and.push({
          professionalLevel: professionalLevel.trim(),
        });
      } else {
        providerQuery.professionalLevel = professionalLevel.trim();
      }
      console.log(`Filtering by professional level: "${professionalLevel}"`);
    }

    console.log(
      "Built provider query:",
      JSON.stringify(providerQuery, null, 2)
    );

    // Find matching providers first if we have provider filters
    let providerIds: Types.ObjectId[] | undefined;
    if (Object.keys(providerQuery).length > 1) {
      const matchingProviders = await User.find(providerQuery)
        .select("_id")
        .lean();
      providerIds = matchingProviders.map((p) => new Types.ObjectId(p._id));

      console.log(`Found ${providerIds.length} matching professionals`);

      if (providerIds && providerIds.length === 0) {
        return res.status(200).json({
          success: true,
          count: 0,
          filters: req.query,
          data: [],
          pagination: {
            total: 0,
            page: pageNum,
            limit: limitNum,
            totalPages: 0,
          },
          message: location
            ? `No professionals found in "${location}"`
            : "No professionals match the specified criteria",
        });
      }

      if (providerIds) {
        serviceQuery.providerId = { $in: providerIds };
      }
    }

    // Get total count for pagination
    const total = await Service.countDocuments(serviceQuery);

    // Execute the main query with population and pagination
    const services = await Service.find(serviceQuery)
      .populate({
        path: "providerId",
        select:
          "userName firstName lastName profilePicture city streetAddress profession professionalLevel isVerified",
        match: providerQuery, // This will filter populated providers
      })
      .populate({
        path: "categoryId",
        select: "name",
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Filter out services where provider didn't match the criteria
    const filteredServices = services.filter(
      (service) => service.providerId !== null
    );

    console.log(`Found ${filteredServices.length} services matching filters`);

    // Format the response
    const formattedServices = filteredServices.map((service: any) => ({
      serviceId: service._id?.toString(),
      serviceName: service.name,
      serviceImage: service.photo,
      servicePrice: service.price,
      serviceDescription: service.description,
      categoryId: service.categoryId?._id?.toString(),
      categoryName: service.categoryId?.name,
      providerName:
        `${service.providerId?.firstName || ""} ${
          service.providerId?.lastName || ""
        }`.trim() || service.providerId?.userName,
      providerImage: service.providerId?.profilePicture,
      providerCity: service.providerId?.city,
      providerStreetAddress: service.providerId?.streetAddress,
      providerProfession: service.providerId?.profession,
      providerLevel: service.providerId?.professionalLevel,
      providerIsVerified: service.providerId?.isVerified || false,
      providerId: service.providerId?._id?.toString(),
      createdAt: service.createdAt,
    }));

    const totalPages = Math.ceil(total / limitNum);

    return res.status(200).json({
      success: true,
      count: formattedServices.length,
      filters: req.query,
      data: formattedServices,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
      },
      message: location
        ? `Found ${formattedServices.length} service(s) from professionals in "${location}"`
        : `Found ${formattedServices.length} service(s) matching your criteria`,
    });
  } catch (error) {
    console.error("Error filtering services:", error);
    return res.status(500).json({
      success: false,
      message:
        "Error filtering services: " +
        (error instanceof Error ? error.message : "Unknown error"),
    });
  }
};

// Unified search - search service names and professional names
const unifiedSearch = async (req: any, res: any) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;

    if (!search || search.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Please provide a search term.",
      });
    }

    console.log(`Unified search for: "${search}"`);

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    const searchRegex = new RegExp(search.trim(), "i");

    // Build provider query
    const providerBaseQuery: any = { role: "PROFESSIONAL" };

    // First, find services that match the search term
    const serviceQuery: any = { name: searchRegex };

    const serviceMatches = await Service.find(serviceQuery)
      .populate({
        path: "providerId",
        select:
          "userName firstName lastName profilePicture city streetAddress profession professionalLevel isVerified",
      })
      .populate({
        path: "categoryId",
        select: "name",
      })
      .lean();

    const professionalQuery = {
      ...providerBaseQuery,
      $or: [
        { userName: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex },
        { profession: searchRegex },
      ],
    };

    const professionalMatches = await User.find(professionalQuery)
      .select("_id")
      .lean();

    // Get services from matching professionals
    let professionalServices: any[] = [];
    if (professionalMatches.length > 0) {
      professionalServices = await Service.find({
        providerId: { $in: professionalMatches.map((p) => p._id) },
      })
        .populate({
          path: "providerId",
          select:
            "userName firstName lastName profilePicture city streetAddress profession professionalLevel isVerified",
        })
        .populate({
          path: "categoryId",
          select: "name",
        })
        .lean();
    }

    // Combine and deduplicate results
    const allServices = [...serviceMatches, ...professionalServices];
    const uniqueServices = allServices.filter(
      (service, index, self) =>
        index ===
        self.findIndex((s) => s._id.toString() === service._id.toString())
    );

    // Sort by creation date (newest first)
    uniqueServices.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Apply pagination
    const total = uniqueServices.length;
    const paginatedServices = uniqueServices.slice(skip, skip + limitNum);

    console.log(
      `Found ${total} unique services matching search term "${search}"`
    );

    // Format the response
    const formattedServices = paginatedServices.map((service: any) => ({
      serviceId: service._id?.toString(),
      serviceName: service.name,
      serviceImage: service.photo,
      servicePrice: service.price,
      serviceDescription: service.description,
      categoryId: service.categoryId?._id?.toString(),
      categoryName: service.categoryId?.name,
      providerName:
        service.providerId?.userName ||
        `${service.providerId?.firstName || ""} ${
          service.providerId?.lastName || ""
        }`.trim(),
      providerImage: service.providerId?.profilePicture,
      providerCity: service.providerId?.city,
      providerStreetAddress: service.providerId?.streetAddress,
      providerProfession: service.providerId?.profession,
      providerLevel: service.providerId?.professionalLevel,
      providerIsVerified: service.providerId?.isVerified || false,
      providerId: service.providerId?._id?.toString(),
      createdAt: service.createdAt,
    }));

    const totalPages = Math.ceil(total / limitNum);

    const responseMessage = `Found ${total} service(s) matching "${search}" in service names and professional names`;

    return res.status(200).json({
      success: true,
      count: formattedServices.length,
      searchTerm: search,
      data: formattedServices,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
      },
      message: responseMessage,
    });
  } catch (error) {
    console.error("Error in unified search:", error);
    return res.status(500).json({
      success: false,
      message:
        "Error performing search: " +
        (error instanceof Error ? error.message : "Unknown error"),
    });
  }
};

export const ServiceService = {
  getAllCategories,
  createIntoDb,
  getListFromDb,
  getIndividualServiceDetails,
  getByIdFromDb,
  serviceDetails,
  getServicesByCategory,
  saveService,
  unsaveService,
  getSavedServices,
  updateIntoDb,
  deleteFromDb,
  filterServices,
  unifiedSearch,
};
