import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import pick from "../../../shared/pick";
import sendResponse from "../../../shared/sendResponse";
import { userFilterableFields } from "./user.costant";
import { userService } from "./user.service";
import { fileUploader } from "../../../helpars/fileUploader";

const createUser = catchAsync(async (req: Request, res: Response) => {
  const result = await userService.createUserIntoDb(req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User Registered successfully!",
    data: result,
  });
});

// get all user form db
// const getUsers = catchAsync(async (req: Request, res: Response) => {
//   const filters = pick(req.query, userFilterableFields);
//   const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);

//   const result = await userService.getUsersFromDb(filters, options);
//   sendResponse(res, {
//     statusCode: httpStatus.OK,
//     success: true,
//     message: "Users retrieve successfully!",
//     data: result,
//   });
// });

// get all user form db
// const updateProfile = catchAsync(
//   async (req: Request & { user?: any }, res: Response) => {
//     const user = req?.user;

//     const result = await userService.updateProfile(req);
//     sendResponse(res, {
//       statusCode: httpStatus.OK,
//       success: true,
//       message: "Profile updated successfully!",
//       data: result,
//     });
//   }
// );

// complete profile
const completeProfile = catchAsync(
  async (req: Request & { user?: any }, res: Response) => {
    const { profileData, status } = await userService.completeProfileIntoDB(
      req
    );

    sendResponse(res, {
      statusCode: status,
      success: true,
      message: `Profile ${
        status === 201 ? "created" : "updated"
      } successfully!`,
      data: profileData,
    });
  }
);

// *! update user role and account status
// const updateUser = catchAsync(async (req: Request, res: Response) => {
//   const id = req.params.id;
//   const result = await userService.updateUserIntoDb(req.body, id);
//   sendResponse(res, {
//     statusCode: httpStatus.OK,
//     success: true,
//     message: "User updated successfully!",
//     data: result,
//   });
// });

// *! update user role and account status
// const profileImageChange = catchAsync(async (req: Request, res: Response) => {
//   const id = req.params.id;
//   const result = await userService.profileImageChange(req);

//   sendResponse(res, {
//     statusCode: httpStatus.OK,
//     success: true,
//     message: "User updated successfully!",
//     data: result,
//   });
// });

// update user role and account status
// const accountUpdate = catchAsync(async (req: Request, res: Response) => {
//   const id = req.user.id;
//   const result = await userService.accountUpdateIntoDb(req.body, id);

//   sendResponse(res, {
//     statusCode: httpStatus.OK,
//     success: true,
//     message: "User account updated successfully!",
//     data: result,
//   });
// });

// *! delete user account with password verification
const deleteMe = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const { password, confirmDeletion } = req.body;

  if (!password) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: "Password is required for account deletion",
      data: null,
    });
  }

  if (!confirmDeletion) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: "You must confirm account deletion",
      data: null,
    });
  }

  const result = await userService.deleteUserFromDb(userId, password);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Account deleted permanently and successfully!",
    data: result,
  });
});

// Create or update professional profile
const createOrUpdateProfile = catchAsync(
  async (req: Request, res: Response) => {
    const result = await userService.createOrUpdateProfile(req);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: result.success,
      message: result.message,
      data: result.data,
    });
  }
);

const getUserSchedule = catchAsync(
  async (req: Request & { user?: any }, res: Response) => {
    const userId = req.user.id;

    const result = await userService.getUserSchedule(userId);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "User schedule retrieved successfully",
      data: result,
    });
  }
);

// Update user schedule
const updateSchedule = catchAsync(async (req: Request, res: Response) => {
  const { schedule } = req.body;
  const userId = req.user.id;

  if (
    !schedule ||
    typeof schedule !== "object" ||
    Object.keys(schedule).length === 0
  ) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: "schedule is required and must be a non-empty object",
      data: null,
    });
  }

  const result = await userService.updateSchedule(userId, schedule);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: result.success,
    message: result.message,
    data: result.data,
  });
});

const editUserProfile = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;

  const { firstName, lastName, email, phoneNumber, city, streetAddress } =
    req.body;

  const updateData: any = {};

  if (firstName !== undefined && firstName !== "")
    updateData.firstName = firstName;
  if (lastName !== undefined && lastName !== "") updateData.lastName = lastName;
  if (email !== undefined && email !== "") updateData.email = email;
  if (phoneNumber !== undefined && phoneNumber !== "")
    updateData.phoneNumber = phoneNumber;
  if (city !== undefined && city !== "") updateData.city = city;
  if (streetAddress !== undefined && streetAddress !== "")
    updateData.streetAddress = streetAddress;

  // Handle profile image upload if provided
  if (req.file) {
    // Get current user to check if they have an existing profile picture
    const currentUser = await userService.findUserById(userId);

    // Delete old image from Cloudinary if it exists
    if (currentUser?.profilePicture) {
      console.log("Deleting old profile picture:", currentUser.profilePicture);
      await fileUploader.deleteFromCloudinary(currentUser.profilePicture);
    }

    // Set new image URL (Cloudinary automatically provides this via middleware)
    updateData.profilePicture = req.file.path; // Cloudinary URL from uploadSingleToCloudinary
    console.log("New profile picture URL:", updateData.profilePicture);
  }

  // Check if at least one field is being updated (including file)
  if (Object.keys(updateData).length === 0) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: "At least one field must be provided for update",
      data: null,
    });
  }

  // Manual validation for provided fields
  if (
    updateData.firstName &&
    (updateData.firstName.length < 2 || updateData.firstName.length > 30)
  ) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: "First name must be between 2 and 30 characters",
      data: null,
    });
  }

  if (
    updateData.lastName &&
    (updateData.lastName.length < 2 || updateData.lastName.length > 30)
  ) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: "Last name must be between 2 and 30 characters",
      data: null,
    });
  }

  if (updateData.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(updateData.email)) {
      return sendResponse(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: "Invalid email format",
        data: null,
      });
    }
  }

  if (updateData.phoneNumber) {
    const phoneRegex = /^\+?[0-9]{10,15}$/;
    if (!phoneRegex.test(updateData.phoneNumber)) {
      return sendResponse(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: "Invalid phone number format. Use +1234567890 format",
        data: null,
      });
    }
  }

  const result = await userService.editUserProfile(userId, updateData);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User profile updated successfully!",
    data: result,
  });
});

const changePassword = catchAsync(async (req: Request, res: Response) => {
  const { oldPassword, newPassword, confirmPassword } = req.body;

  if (!oldPassword || !newPassword || !confirmPassword) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: "oldPassword, newPassword, and confirmPassword are required",
      data: null,
    });
  }

  const result = await userService.changePassword(
    req.user.id,
    oldPassword,
    newPassword,
    confirmPassword
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Password changed successfully",
    data: result,
  });
});

export const userController = {
  createUser,
  // getUsers,
  // updateProfile,
  // updateUser,
  // accountUpdate,
  completeProfile,
  deleteMe,
  // profileImageChange,
  createOrUpdateProfile,
  updateSchedule,
  getUserSchedule,
  editUserProfile,
  changePassword,
};
