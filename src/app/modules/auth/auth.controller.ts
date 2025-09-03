import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { authService } from "./auth.service";

// const createUser = catchAsync(async (req, res) => {
//   const result = await authService.createUser(req.body);
//   sendResponse(res, {
//     statusCode: httpStatus.CREATED,
//     success: true,
//     message: "User created successfully",
//     data: result,
//   });
// });

const loginUser = catchAsync(async (req, res) => {
  const result = await authService.loginUser(req.body);
  res.cookie("token", result.token, { httpOnly: true });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User logged in successfully",
    data: result,
  });
});

const logoutUser = catchAsync(async (req: Request, res: Response) => {
  // Clear the token cookie
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User Successfully logged out",
    data: null,
  });
});

// get user profile
const getMyProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await authService.getMyProfile(req.user.id);
  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: "User profile retrieved successfully",
    data: result,
  });
});

// change password
const changePassword = catchAsync(async (req: Request, res: Response) => {
  const { oldPassword, newPassword } = req.body;

  const result = await authService.changePassword(
    req.user.id,
    newPassword,
    oldPassword
  );
  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: "Password changed successfully",
    data: result,
  });
});

// forgot password
const forgotPassword = catchAsync(async (req: Request, res: Response) => {
  const result = await authService.forgotPassword(req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Check your email!",
    data: result,
  });
});
const resendOtp = catchAsync(async (req: Request, res: Response) => {
  const result = await authService.resendOtp(req.body.email);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Check your email!",
    data: result,
  });
});
const verifyForgotPasswordOtp = catchAsync(
  async (req: Request, res: Response) => {
    const result = await authService.verifyForgotPasswordOtp(req.body);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Check your email!",
      data: result,
    });
  }
);

const resetPassword = catchAsync(async (req: Request, res: Response) => {
  const { email, newPassword, otp } = req.body;

  await authService.resetPassword(email, newPassword, otp);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password Reset!",
    data: null,
  });
});

export const AuthController = {
  // createUser,
  loginUser,
  logoutUser,
  getMyProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  resendOtp,
  verifyForgotPasswordOtp,
};
