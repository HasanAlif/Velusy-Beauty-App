import { User, IUser, UserRole, UserStatus } from "../../models";
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
const createUserIntoDb = async (req: Request) => {
  const payload = req.body?.data;
  if (!payload) {
    throw new ApiError(400, "Invalid request payload");
  }

  const { confirmPassword, ...userPayload } = JSON.parse(payload);
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

      const image = !Array.isArray(req.files) ? req.files?.image : undefined;
      const file = !Array.isArray(req.files) ? req.files?.file : undefined;

      // Handle file uploads - store in appropriate fields with specific folders
      // Profile image goes to profilePicture field (stored in 'profile-images' folder)
      if (image && image[0]) {
        const uploadedImage = await fileUploader.uploadProfileImage(image[0]);
        userPayload.profilePicture = uploadedImage.Location;
      }

      // General file goes to file field (stored in 'user-files' folder)
      if (file && file[0]) {
        const uploadedFile = await fileUploader.uploadGeneralFile(file[0]);
        userPayload.file = uploadedFile.Location;
      }

      // Fallback: if using req.file (single file upload), treat as profile picture
      if (req.file && !image && !file) {
        const uploadedImage = await fileUploader.uploadProfileImage(req.file);
        userPayload.profilePicture = uploadedImage.Location;
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
        profilePicture: createdUser[0].profilePicture, // Profile image URL
        file: createdUser[0].file, // General file URL
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
      profilePicture: 1,
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

// Create or update user profile with professional details
const createOrUpdateProfile = async (req: Request) => {
  const {
    fullName,
    userName,
    personalDescription,
    serviceType,
    serviceCategory,
    language,
    portfolio,
    certificates,
    companyCertificates,
    schedule,
  } = req.body;

  try {
    let user = await User.findOne({ userName });

    if (!user) {
      const newUserData = {
        fullName,
        userName,
        personalDescription,
        serviceType,
        serviceCategory,
        language,
        portfolio: portfolio || [],
        certificates: certificates || [],
        companyCertificates: companyCertificates || [],
        schedule: schedule || {},
        role: UserRole.PROFESSIONAL, // Set as professional by default
        status: UserStatus.ACTIVE,
        city: "Unknown", // Required field
        streetAddress: "Unknown", // Required field
      };

      user = await User.create(newUserData);
    } else {
      // Update existing user
      const updateData = {
        ...(fullName && { fullName }),
        ...(personalDescription && { personalDescription }),
        ...(serviceType && { serviceType }),
        ...(serviceCategory && { serviceCategory }),
        ...(language && { language }),
        ...(portfolio && { portfolio }),
        ...(certificates && { certificates }),
        ...(companyCertificates && { companyCertificates }),
        ...(schedule && { schedule }),
      };

      const updatedUser = await User.findByIdAndUpdate(user._id, updateData, {
        new: true,
        runValidators: true,
      });

      if (!updatedUser) {
        throw new ApiError(httpStatus.NOT_FOUND, "User not found for update");
      }

      user = updatedUser;
    }

    // Handle profile image upload if present
    if (req.file && user) {
      const uploadedImage = await fileUploader.uploadProfileImage(req.file);
      user.profilePicture = uploadedImage.Location;
      await user.save();
    }

    // Handle multiple file uploads for portfolio, certificates
    if (req.files && !Array.isArray(req.files) && user) {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      // Handle portfolio files
      if (files.portfolioFiles) {
        const portfolioUploads = await Promise.all(
          files.portfolioFiles.map(async (file) => {
            const uploaded = await fileUploader.uploadGeneralFile(file);
            return {
              fileUrl: uploaded.Location,
              fileType: file.mimetype.startsWith("image/")
                ? "image"
                : "document",
            };
          })
        );
        user.portfolio = [...(user.portfolio || []), ...portfolioUploads];
      }

      // Handle certificate files
      if (files.certificateFiles) {
        const certificateUploads = await Promise.all(
          files.certificateFiles.map(async (file) => {
            const uploaded = await fileUploader.uploadGeneralFile(file);
            return {
              fileUrl: uploaded.Location,
              fileType: file.mimetype.startsWith("image/")
                ? "image"
                : "document",
            };
          })
        );
        user.certificates = [
          ...(user.certificates || []),
          ...certificateUploads,
        ];
      }

      // Handle company certificate files
      if (files.companyCertificateFiles) {
        const companyCertUploads = await Promise.all(
          files.companyCertificateFiles.map(async (file) => {
            const uploaded = await fileUploader.uploadGeneralFile(file);
            return {
              fileUrl: uploaded.Location,
              fileType: file.mimetype.startsWith("image/")
                ? "image"
                : "document",
            };
          })
        );
        user.companyCertificates = [
          ...(user.companyCertificates || []),
          ...companyCertUploads,
        ];
      }

      await user.save();
    }

    // Ensure user is not null before accessing properties
    if (!user) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "User creation/update failed"
      );
    }

    return {
      success: true,
      message: "Profile created/updated successfully",
      data: {
        id: user._id,
        fullName: user.fullName,
        userName: user.userName,
        personalDescription: user.personalDescription,
        serviceType: user.serviceType,
        serviceCategory: user.serviceCategory,
        language: user.language,
        profilePicture: user.profilePicture,
        portfolio: user.portfolio,
        certificates: user.certificates,
        companyCertificates: user.companyCertificates,
        schedule: user.schedule,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    };
  } catch (error) {
    console.error("Error in createOrUpdateProfile:", error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Error in creating/updating profile: " +
        (error instanceof Error ? error.message : "Unknown error")
    );
  }
};

// Update user schedule
const updateSchedule = async (
  userId: string,
  scheduleData: { [date: string]: { time: string; status: string }[] }
) => {
  try {
    const user = await User.findById(userId);

    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    // Initialize schedule if it doesn't exist or parse if it's a string
    if (!user.schedule) {
      user.schedule = {};
    } else if (typeof user.schedule === "string") {
      try {
        user.schedule = JSON.parse(user.schedule);
      } catch (parseError) {
        console.log(
          "Error parsing existing schedule, initializing as empty object:",
          parseError
        );
        user.schedule = {};
      }
    }

    // Ensure schedule is an object
    if (typeof user.schedule !== "object" || user.schedule === null) {
      user.schedule = {};
    }

    // Process each date in the schedule data
    Object.keys(scheduleData).forEach((date) => {
      const timeSlots = scheduleData[date];

      // Validate date format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date)) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Invalid date format for ${date}. Use YYYY-MM-DD format.`
        );
      }

      // Validate each time slot
      timeSlots.forEach((slot) => {
        const timeRegex = /^\d{2}:\d{2}$/;
        if (!timeRegex.test(slot.time)) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Invalid time format for ${slot.time}. Use HH:MM format.`
          );
        }

        const validStatuses = [
          "AVAILABLE",
          "BOOKED",
          "UNAVAILABLE",
          "NOT_AVAILABLE",
        ];
        if (!validStatuses.includes(slot.status)) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Invalid status ${
              slot.status
            }. Must be one of: ${validStatuses.join(", ")}`
          );
        }
      });

      // Set the complete schedule for this date (replaces existing)
      if (user.schedule) {
        user.schedule[date] = timeSlots;
      }
    });

    // Mark the schedule field as modified for MongoDB
    user.markModified("schedule");
    await user.save();

    return {
      success: true,
      message: "Schedule updated successfully",
      data: {
        id: user._id,
        userName: user.userName,
        fullName: user.fullName,
        schedule: user.schedule,
        updatedAt: user.updatedAt,
      },
    };
  } catch (error) {
    console.error("Error updating schedule:", error);
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Error updating schedule: " +
        (error instanceof Error ? error.message : "Unknown error")
    );
  }
};

const getUserSchedule = async (userId: string) => {
  try {
    const user = await User.findById(userId).select("schedule");

    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    return {
      success: true,
      message: "User schedule retrieved successfully",
      data: {
        id: user._id,
        schedule: user.schedule || {},
      },
    };
  } catch (error) {
    console.error("Error retrieving user schedule:", error);
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Error retrieving schedule: " +
        (error instanceof Error ? error.message : "Unknown error")
    );
  }
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
  createOrUpdateProfile,
  updateSchedule,
  getUserSchedule,
};
