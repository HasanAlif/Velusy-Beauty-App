import mongoose from "mongoose";
import Support from "./support.model";
import { ISupport } from "./support.model";
import ApiError from "../../../errors/ApiErrors";
import httpStatus from "http-status";

const createSupportMessage = async (payload: {
  name: string;
  email: string;
  phone: string;
  service: string;
  note: string;
}): Promise<ISupport> => {
  const created = await Support.create(payload);
  return created;
};

const getAllSupportMessages = async (query: {
  page?: number;
  limit?: number;
  search?: string;
}) => {
  const { page = 1, limit = 20, search } = query;

  const filter: any = {};

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { service: { $regex: search, $options: "i" } },
      { note: { $regex: search, $options: "i" } },
    ];
  }

  const total = await Support.countDocuments(filter);
  const data = await Support.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  return {
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    data,
  };
};

const getSupportMessageById = async (id: string): Promise<ISupport> => {
  const message = await Support.findById(id);
  if (!message) {
    throw new ApiError(httpStatus.NOT_FOUND, "Support message not found");
  }
  return message;
};

export const supportService = {
  createSupportMessage,
  getAllSupportMessages,
  getSupportMessageById,
};
