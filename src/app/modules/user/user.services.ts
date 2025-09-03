import { User, IUser } from "../../models";
import * as bcrypt from "bcrypt";
import { Request } from "express";
import httpStatus from "http-status";
import { Secret } from "jsonwebtoken";
import config from "../../../config";
import ApiError from "../../../errors/ApiErrors";
import { fileUploader } from "../../../helpars/fileUploader";
import { jwtHelpers } from "../../../helpars/jwtHelpers";
import { paginationHelper } from "../../../helpars/paginationHelper";
import { IPaginationOptions } from "../../../interfaces/paginations";
import { userSearchAbleFields } from "./user.costant";
import { IUserFilterRequest } from "./user.interface";
import mongoose from "mongoose";

// Create a new user in the database.
const createUserIntoDb = async (
  payload: Partial<IUser> & { confirmPassword: string }
) => {
  const { confirmPassword, ...userPayload } = payload;
  if (confirmPassword !== userPayload.password) {
    throw new ApiError(400, "Password and confirmPassword do not match!");
  }

  // Start a session for transaction
  const session = await mongoose.startSession();

  try {
    const result = await session.withTransaction(async () => {
      const existingUser = await User.findOne({
        email: userPayload.email,
      }).session(session);

      if (existingUser) {
        throw new ApiError(
          400,
          `User with this email ${userPayload.email} already exists`
        );
      }

      const hashedPassword: string = await bcrypt.hash(
        userPayload.password!,
        Number(config.bcrypt_salt_rounds)
      );

      const createdUser = await User.create(
        [
          {
            ...userPayload,
            password: hashedPassword,
          },
        ],
        { session }
      );

      return {
        id: createdUser[0]._id,
        email: createdUser[0].email,
        name: createdUser[0].firstName + " " + createdUser[0].lastName,
        role: createdUser[0].role,
        createdAt: createdUser[0].createdAt,
        updatedAt: createdUser[0].updatedAt,
      };
    });

    const token = jwtHelpers.generateToken(
      {
        id: result.id,
        email: result.email,
        role: result.role,
      },
      config.jwt.jwt_secret as string,
      config.jwt.expires_in as string
    );

    return { result, token };
  } finally {
    await session.endSession();
  }
};

// retrieve all users from the database also searching and filtering
const getUsersFromDb = async (
  params: IUserFilterRequest,
  options: IPaginationOptions
) => {
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = params;

  const andConditions: any[] = [];

  if (params.searchTerm) {
    andConditions.push({
      $or: userSearchAbleFields.map((field) => ({
        [field]: {
          $regex: params.searchTerm,
          $options: "i",
        },
      })),
    });
  }

  if (Object.keys(filterData).length > 0) {
    andConditions.push({
      $and: Object.keys(filterData).map((key) => ({
        [key]: (filterData as any)[key],
      })),
    });
  }

  const whereConditions =
    andConditions.length > 0 ? { $and: andConditions } : {};

  const sortConditions: any = {};
  if (options.sortBy && options.sortOrder) {
    sortConditions[options.sortBy] = options.sortOrder === "desc" ? -1 : 1;
  } else {
    sortConditions.createdAt = -1;
  }

  const result = await User.find(whereConditions)
    .select({
      _id: 1,
      firstName: 1,
      lastName: 1,
      email: 1,
      profileImage: 1,
      role: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    .sort(sortConditions)
    .skip(skip)
    .limit(limit);

  const total = await User.countDocuments(whereConditions);

  if (!result || result.length === 0) {
    throw new ApiError(404, "No active users found");
  }

  return {
    meta: {
      page,
      limit,
      total,
    },
    data: result,
  };
};

// update profile by user own profile using token or email and id
const updateProfile = async (req: Request) => {
  const file = req.file;
  const stringData = req.body.data;
  let image;
  let parseData;

  const existingUser = await User.findById(req.user.id);
  if (!existingUser) {
    throw new ApiError(404, "User not found");
  }

  if (file) {
    image = (await fileUploader.uploadToDigitalOcean(file)).Location;
  }
  if (stringData) {
    parseData = JSON.parse(stringData);
  }

  const updateData: any = {};
  if (parseData?.firstName) updateData.firstName = parseData.firstName;
  if (parseData?.lastName) updateData.lastName = parseData.lastName;
  if (parseData?.email) updateData.email = parseData.email;
  if (image) updateData.profileImage = image;
  updateData.updatedAt = new Date();

  const result = await User.findByIdAndUpdate(existingUser._id, updateData, {
    new: true,
    select: {
      _id: 1,
      firstName: 1,
      lastName: 1,
      email: 1,
      profileImage: 1,
    },
  });

  return result;
};

// update user data into database by id for admin
const updateUserIntoDb = async (payload: Partial<IUser>, id: string) => {
  const userInfo = await User.findById(id);
  if (!userInfo) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found with id: " + id);
  }

  const result = await User.findByIdAndUpdate(userInfo._id, payload, {
    new: true,
    select: {
      _id: 1,
      firstName: 1,
      lastName: 1,
      email: 1,
      profileImage: 1,
      role: 1,
      createdAt: 1,
      updatedAt: 1,
    },
  });

  if (!result) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to update user profile"
    );
  }

  return result;
};

// profile image upload or change
const profileImageChange = async (req: Request) => {
  const file = req.file;
  if (file) {
    const image = (await fileUploader.uploadToDigitalOcean(file)).Location;

    return await User.findByIdAndUpdate(
      req.user.id,
      { profileImage: image },
      { new: true }
    );
  }

  return null;
};

// delete user from db
const deleteUserFromDb = async (id: string) => {
  const user = await User.findById(id);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found with id: " + id);
  }

  const result = await User.findByIdAndUpdate(
    id,
    { status: "INACTIVE" },
    {
      new: true,
      select: {
        _id: 1,
        firstName: 1,
        lastName: 1,
        email: 1,
        status: 1,
        updatedAt: 1,
      },
    }
  );

  return result;
};

const accountUpdateIntoDb = async (
  payload: Partial<IUser>,
  id: string
): Promise<Partial<IUser> | null> => {
  const userInfo = await User.findById(id);
  if (!userInfo) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found with id: " + id);
  }

  const result = await User.findByIdAndUpdate(id, payload, {
    new: true,
    select: {
      _id: 1,
      email: 1,
      name: 1,
      firstName: 1,
      lastName: 1,
      role: 1,
      phoneNumber: 1,
      createdAt: 1,
      updatedAt: 1,
    },
  });

  return result;
};

const completeProfileIntoDB = async (req: Request & { user?: any }) => {
  const userId = req.user?.id;
  const profileData = req.body;

  if (!userId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "User not authenticated");
  }

  const userInfo = await User.findById(userId);
  if (!userInfo) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "User not found with id: " + userId
    );
  }

  // Check if this is a new profile completion or an update
  // Using existing fields to determine if profile is complete
  const isProfileComplete =
    userInfo.firstName && userInfo.lastName && userInfo.phoneNumber;
  const status = isProfileComplete ? httpStatus.OK : httpStatus.CREATED;

  const updatedProfile = await User.findByIdAndUpdate(userId, profileData, {
    new: true,
    select: {
      _id: 1,
      firstName: 1,
      lastName: 1,
      email: 1,
      phoneNumber: 1,
      city: 1,
      streetAddress: 1,
      profileImage: 1,
      profilePicture: 1,
      role: 1,
      status: 1,
      createdAt: 1,
      updatedAt: 1,
    },
  });

  return {
    profileData: updatedProfile,
    status,
  };
};

export const userService = {
  createUserIntoDb,
  getUsersFromDb,
  updateProfile,
  updateUserIntoDb,
  deleteUserFromDb,
  profileImageChange,
  accountUpdateIntoDb,
  completeProfileIntoDB,
};
