import httpStatus from "http-status";
import sendResponse from "../../../shared/sendResponse";
import catchAsync from "../../../shared/catchAsync";
import { ServiceService } from "./service.service";
import { Request, Response } from "express";
import { IService } from "./service.model";

export const getCategories = catchAsync(async (req: Request, res: Response) => {
  const result = await ServiceService.getAllCategories(req.query);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Categories retrieved successfully",
    meta: result.pagination,
    data: result.categories,
  });
});

export const createService = catchAsync(
  async (req: Request & { user?: any }, res) => {
    const photo = req.file
      ? (
          await (
            await import("../../../helpars/fileUploader")
          ).fileUploader.uploadToCloudinary(req.file, "service-images")
        ).Location
      : undefined;

    const payload = {
      providerId: req.user.id,
      name: req.body.name,
      atHome: req.body.atHome,
      atProviderLocation: req.body.atProviderLocation,
      description: req.body.description,
      price: req.body.price,
      photo,
    };

    const result = await ServiceService.createIntoDb(payload as IService);
    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Service created",
      data: result,
    });
  }
);

export const listServices = catchAsync(
  async (req: Request & { user?: any }, res) => {
    const { search, page, limit, providerId } = req.query as any;
    const result = await ServiceService.getListFromDb({
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      providerId,
      userId: req.user.id,
    });

    const meta = {
      ...result.meta,
      totalPages: Math.ceil(result.meta.total / result.meta.limit),
    };

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Service list fetched",
      data: result.data,
      meta,
    });
  }
);

export const getServiceById = catchAsync(async (req, res) => {
  const result = await ServiceService.getByIdFromDb(req.params.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Service details fetched",
    data: result,
  });
});

export const updateService = catchAsync(
  async (req: Request & { user?: any }, res) => {
    let photoUrl: string | undefined;
    if (req.file) {
      const currentService = await ServiceService.getByIdFromDb(req.params.id);

      // Delete old image from Cloudinary if it exists
      if (currentService?.photo) {
        console.log("Deleting old service photo:", currentService.photo);
        await (
          await import("../../../helpars/fileUploader")
        ).fileUploader.deleteFromCloudinary(currentService.photo);
      }

      // Upload new image to Cloudinary
      photoUrl = (
        await (
          await import("../../../helpars/fileUploader")
        ).fileUploader.uploadToCloudinary(req.file, "service-images")
      ).Location;
      console.log("New service photo URL:", photoUrl);
    }

    const payload: any = { ...req.body };
    if (photoUrl) payload.photo = photoUrl;

    const result = await ServiceService.updateIntoDb(req.params.id, payload, {
      id: req.user.id,
      role: req.user.role,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Service updated",
      data: result,
    });
  }
);

export const deleteService = catchAsync(
  async (req: Request & { user?: any }, res) => {
    const result = await ServiceService.deleteFromDb(req.params.id, {
      id: req.user.id,
      role: req.user.role,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Service deleted",
      data: result,
    });
  }
);

// Get service details with provider information
export const serviceDetails = catchAsync(async (req: Request, res) => {
  const { serviceId } = req.params;

  if (!serviceId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: "Service ID is required",
      data: null,
    });
  }

  const serviceWithProvider = await ServiceService.serviceDetails(serviceId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Service details with provider information retrieved successfully",
    data: serviceWithProvider,
  });
});
