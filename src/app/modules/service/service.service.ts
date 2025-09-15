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
      const rawDistance = haversineDistance(
        user.latitude,
        user.longitude,
        service.providerId.latitude,
        service.providerId.longitude
      );
      distance = Math.round(rawDistance * 100) / 100; // Round to 2 decimal places
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
      category,
      serviceName,
      service,
      searchTerm,
      minPrice,
      maxPrice,
      professionalLevel,
      isVerified,
      page = 1,
      limit = 20,
    } = req.query;

    const userId = req.user?.id;

    // Save search history for the user with auto-cleanup
    if (userId) {
      try {
        const searchData: any = {
          searchType: "filter",
          timestamp: new Date(),
        };

        if (searchTerm && searchTerm.trim()) {
          searchData.searchTerm = searchTerm.trim();
        }

        if (location && location.trim()) searchData.location = location.trim();
        if (city && city.trim()) searchData.city = city.trim();
        if (streetAddress && streetAddress.trim())
          searchData.streetAddress = streetAddress.trim();
        if (categoryId && categoryId.trim())
          searchData.categoryId = categoryId.trim();
        if (category && category.trim()) searchData.category = category.trim();
        if (serviceName && serviceName.trim())
          searchData.serviceName = serviceName.trim();
        if (service && service.trim()) searchData.service = service.trim();
        if (minPrice && minPrice.toString().trim())
          searchData.minPrice = Number(minPrice);
        if (maxPrice && maxPrice.toString().trim())
          searchData.maxPrice = Number(maxPrice);
        if (professionalLevel && professionalLevel.trim())
          searchData.professionalLevel = professionalLevel.trim();
        if (isVerified === true || isVerified === "true")
          searchData.isVerified = true;

        // Add to search history and keep only last 10
        await User.findByIdAndUpdate(
          userId,
          {
            $push: {
              searchHistory: {
                $each: [searchData],
                $slice: -10, // Keep only last 10 searches
              },
            },
          },
          { new: true }
        );
      } catch (error) {
        console.error("Error saving search history:", error);
      }
    }

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    const serviceQuery: any = {};

    if (categoryId && categoryId.trim() !== "") {
      if (Types.ObjectId.isValid(categoryId)) {
        serviceQuery.categoryId = new Types.ObjectId(categoryId);
      }
    } else if (category && category.trim() !== "") {
      const foundCategory = await Category.findOne({
        name: { $regex: `^${category.trim()}$`, $options: "i" },
      }).lean();

      if (foundCategory) {
        serviceQuery.categoryId = new Types.ObjectId(foundCategory._id);
      } else {
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
          message: `Category "${category}" not found`,
        });
      }
    }

    const serviceNameParam = service || serviceName;
    if (searchTerm && searchTerm.trim() !== "") {
      serviceQuery.name = { $regex: searchTerm.trim(), $options: "i" };
    } else if (serviceNameParam && serviceNameParam.trim() !== "") {
      serviceQuery.name = {
        $regex: `^${serviceNameParam.trim()}$`,
        $options: "i",
      };
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
    } else {
      // Specific city filter
      if (city && city.trim() !== "") {
        providerQuery.city = { $regex: city.trim(), $options: "i" };
      }
      // Specific street address filter
      if (streetAddress && streetAddress.trim() !== "") {
        providerQuery.streetAddress = {
          $regex: streetAddress.trim(),
          $options: "i",
        };
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
    }

    // Find matching providers first if we have provider filters
    let providerIds: Types.ObjectId[] | undefined;
    if (Object.keys(providerQuery).length > 1) {
      const matchingProviders = await User.find(providerQuery)
        .select("_id")
        .lean();
      providerIds = matchingProviders.map((p) => new Types.ObjectId(p._id));

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
    const userId = req.user?.id; // Get user ID from authenticated request

    if (!search || search.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Please provide a search term.",
      });
    }

    // Save search history for the user with auto-cleanup
    if (userId) {
      try {
        const searchData = {
          searchTerm: search.trim(),
          searchType: "unified",
          timestamp: new Date(),
        };

        // Add to search history and keep only last 10
        await User.findByIdAndUpdate(
          userId,
          {
            $push: {
              searchHistory: {
                $each: [searchData],
                $slice: -10, // Keep only last 10 searches
              },
            },
          },
          { new: true }
        );
      } catch (error) {
        console.error("Error saving search history:", error);
      }
    }

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

const suggestedServices = async (userId: string) => {
  try {
    // Get user information and search history
    const user = await User.findById(userId).lean();
    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    // Get user location for distance calculation
    const userLocation =
      typeof user.latitude === "number" && typeof user.longitude === "number"
        ? { latitude: user.latitude, longitude: user.longitude }
        : null;

    // Check if user has search history
    if (!user.searchHistory || user.searchHistory.length === 0) {
      const randomServices = await Service.find()
        .populate({
          path: "providerId",
          select:
            "userName firstName lastName profilePicture city streetAddress profession isVerified latitude longitude",
          match: { role: "PROFESSIONAL" },
        })
        .populate({
          path: "categoryId",
          select: "name",
        })
        .limit(10)
        .lean()
        .sort({ createdAt: -1 });

      const validServices = randomServices.filter(
        (service) => service.providerId !== null
      );

      const formattedSuggestions = validServices.map((service: any) => {
        const baseResponse = {
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
          providerIsVerified: service.providerId?.isVerified || false,
          providerId: service.providerId?._id?.toString(),
        };

        // Calculate distance if both user and provider have coordinates
        let distance = null;
        if (
          userLocation &&
          service.providerId &&
          typeof service.providerId.latitude === "number" &&
          typeof service.providerId.longitude === "number"
        ) {
          const rawDistance = haversineDistance(
            userLocation.latitude,
            userLocation.longitude,
            service.providerId.latitude,
            service.providerId.longitude
          );
          distance = Math.round(rawDistance * 100) / 100; // Round to 2 decimal places
        }

        return {
          ...baseResponse,
          distance,
        };
      });

      return {
        suggestions: formattedSuggestions,
        basedOn: "popular services",
        message: `Found ${formattedSuggestions.length} popular services for you`,
      };
    }

    // Use search history to get suggestions
    const recentSearches = user.searchHistory.slice(-5).reverse(); // Get last 5 searches, newest first
    let serviceIds: Set<string> = new Set();

    // Collect service IDs from search history
    for (const search of recentSearches) {
      const searchData = search as any;

      if (searchData.foundServices && Array.isArray(searchData.foundServices)) {
        searchData.foundServices.forEach((serviceId: string) => {
          serviceIds.add(serviceId);
        });
      }
    }

    // Convert Set to Array - prioritize services from search history
    const serviceIdArray = Array.from(serviceIds);

    // Get services from search history first
    let historyServices: any[] = [];
    if (serviceIdArray.length > 0) {
      historyServices = await Service.find({
        _id: {
          $in: serviceIdArray.map((id) => new mongoose.Types.ObjectId(id)),
        },
      })
        .populate({
          path: "providerId",
          select:
            "userName firstName lastName profilePicture city streetAddress profession isVerified latitude longitude",
          match: { role: "PROFESSIONAL" },
        })
        .populate({
          path: "categoryId",
          select: "name",
        })
        .lean()
        .sort({ createdAt: -1 });

      // Filter out services without valid providers
      historyServices = historyServices.filter(
        (service) => service.providerId !== null
      );
    }

    // If we need more services to reach 10, get additional random ones
    let additionalServices: any[] = [];
    if (historyServices.length < 10) {
      const usedIds = historyServices.map((s) => s._id.toString());
      additionalServices = await Service.find({
        _id: { $nin: usedIds.map((id) => new mongoose.Types.ObjectId(id)) },
      })
        .populate({
          path: "providerId",
          select:
            "userName firstName lastName profilePicture city streetAddress profession isVerified latitude longitude",
          match: { role: "PROFESSIONAL" },
        })
        .populate({
          path: "categoryId",
          select: "name",
        })
        .limit(10 - historyServices.length)
        .lean()
        .sort({ createdAt: -1 });

      additionalServices = additionalServices.filter(
        (service) => service.providerId !== null
      );
    }

    // Combine history services and additional services
    const allServices = [...historyServices, ...additionalServices].slice(
      0,
      10
    );

    // Format services with distance calculation
    const formattedSuggestions = allServices.map((service: any) => {
      const baseResponse = {
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
        providerIsVerified: service.providerId?.isVerified || false,
        providerId: service.providerId?._id?.toString(),
      };

      // Calculate distance if both user and provider have coordinates
      let distance = null;
      if (
        userLocation &&
        service.providerId &&
        typeof service.providerId.latitude === "number" &&
        typeof service.providerId.longitude === "number"
      ) {
        const rawDistance = haversineDistance(
          userLocation.latitude,
          userLocation.longitude,
          service.providerId.latitude,
          service.providerId.longitude
        );
        distance = Math.round(rawDistance * 100) / 100; // Round to 2 decimal places
      }
      return {
        ...baseResponse,
        distance,
      };
    });

    const historyBasedCount = historyServices.length;
    const totalSuggestions = formattedSuggestions.length;

    return {
      suggestions: formattedSuggestions,
      basedOn:
        historyBasedCount > 0 ? "your search history" : "popular services",
      message:
        historyBasedCount > 0
          ? `Found ${totalSuggestions} suggestions (${historyBasedCount} from your search history)`
          : `Found ${totalSuggestions} suggested services for you`,
      total: totalSuggestions,
    };
  } catch (error) {
    console.error("Error getting suggested services:", error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Error getting suggestions"
    );
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
  suggestedServices,
};
