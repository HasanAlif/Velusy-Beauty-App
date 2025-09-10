import mongoose from "mongoose";
import { Service } from "./service.model";
import ApiError from "../../../errors/ApiErrors";
import httpStatus from "http-status";
import { IService } from "./service.model";
import { Types } from "mongoose";
import { User } from "../../models";

type ListArgs = {
  search?: string;
  page?: number;
  limit?: number;
  providerId?: string;
  userId: string;
};

const createIntoDb = async (payload: Partial<IService>): Promise<IService> => {
  const created = await Service.create(payload);
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

export const ServiceService = {
  createIntoDb,
  getListFromDb,
  getByIdFromDb,
  serviceDetails,
  updateIntoDb,
  deleteFromDb,
};
