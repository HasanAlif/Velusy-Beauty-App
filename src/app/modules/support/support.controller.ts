import httpStatus from "http-status";
import sendResponse from "../../../shared/sendResponse";
import catchAsync from "../../../shared/catchAsync";
import { supportService } from "./support.service";
import { Request, Response } from "express";

export const createSupportMessage = catchAsync(
  async (req: Request, res: Response) => {
    const result = await supportService.createSupportMessage(req.body);

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Support message sent successfully",
      data: result,
    });
  }
);

export const getAllSupportMessages = catchAsync(
  async (req: Request, res: Response) => {
    const { page, limit, search } = req.query as any;

    const result = await supportService.getAllSupportMessages({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      search,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Support messages retrieved successfully",
      data: result.data,
      meta: result.meta,
    });
  }
);

export const getSupportMessageById = catchAsync(
  async (req: Request, res: Response) => {
    const result = await supportService.getSupportMessageById(req.params.id);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Support message retrieved successfully",
      data: result,
    });
  }
);
