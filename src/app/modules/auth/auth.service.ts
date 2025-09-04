import * as bcrypt from "bcrypt";
import crypto from "crypto";
import httpStatus from "http-status";
import { Secret } from "jsonwebtoken";
import config from "../../../config";
import ApiError from "../../../errors/ApiErrors";
import { jwtHelpers } from "../../../helpars/jwtHelpers";
import emailSender from "../../../shared/emailSender";
import { User, UserRole } from "../../models";

// user login
const loginUser = async (payload: {
  email: string;
  password: string;
  fcmToken?: string;
}) => {
  const userData = await User.findOne({
    email: payload.email,
  }).select({
    _id: 1,
    firstName: 1,
    lastName: 1,
    email: 1,
    role: 1,
    password: 1,
    createdAt: 1,
    updatedAt: 1,
    status: 1,
    profileImage: 1,
  });

  if (!userData?.email) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "User not found! with this email " + payload.email
    );
  }
  if (userData.status !== "ACTIVE") {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "User account already delete or Block."
    );
  }

  const isCorrectPassword: boolean = await bcrypt.compare(
    payload.password,
    userData.password
  );

  if (!isCorrectPassword) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Password incorrect!");
  }

  // update fcm token
  if (payload.fcmToken) {
    await User.findOneAndUpdate(
      { email: payload.email },
      { fcmToken: payload.fcmToken }
    );
  }

  const accessToken = jwtHelpers.generateToken(
    {
      id: userData._id,
      email: userData.email,
      role: userData.role,
    },
    config.jwt.jwt_secret as string,
    config.jwt.expires_in as string
  );

  const { password, ...withoutPassword } = userData.toObject();

  return { token: accessToken, userData: withoutPassword };
};

// get user profile
const getMyProfile = async (userId: string) => {
  const userProfile = await User.findById(userId).select({
    _id: 1,
    firstName: 1,
    lastName: 1,
    role: 1,
    phoneNumber: 1,
    status: 1,
    email: 1,
    profilePicture: 1,
    createdAt: 1,
    updatedAt: 1,
  });

  if (!userProfile) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found!");
  }

  return userProfile;
};

// change password
const changePassword = async (
  userId: string,
  newPassword: string,
  oldPassword: string
) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found!");
  }

  const isCorrectPassword: boolean = await bcrypt.compare(
    oldPassword,
    user.password
  );

  if (!isCorrectPassword) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Old password is incorrect!");
  }

  const hashedPassword = await bcrypt.hash(
    newPassword,
    Number(config.bcrypt_salt_rounds)
  );

  const result = await User.findByIdAndUpdate(
    userId,
    { password: hashedPassword },
    { new: true }
  );

  return result;
};

// forgot password
const forgotPassword = async (payload: { email: string }) => {
  const userData = await User.findOne({ email: payload.email });

  if (!userData) {
    throw new ApiError(httpStatus.BAD_REQUEST, "User does not exist!");
  }

  const otp = crypto.randomInt(100000, 999999).toString();
  const otpExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await User.findByIdAndUpdate(userData._id, {
    resetPasswordOtp: otp,
    resetPasswordOtpExpiry: otpExpiry,
  });

  // Send OTP via email
  await emailSender(
    payload.email,
    `<p>Your OTP for password reset is: <strong>${otp}</strong></p>`,
    "Password Reset OTP"
  );

  return { message: "OTP sent to your email", otp }; // Remove otp in production
};

// resend OTP
const resendOtp = async (email: string) => {
  const userData = await User.findOne({ email });

  if (!userData) {
    throw new ApiError(httpStatus.BAD_REQUEST, "User does not exist!");
  }

  const otp = crypto.randomInt(100000, 999999).toString();
  const otpExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await User.findByIdAndUpdate(userData._id, {
    resetPasswordOtp: otp,
    resetPasswordOtpExpiry: otpExpiry,
  });

  // Send OTP via email
  await emailSender(
    email,
    `<p>Your OTP for password reset is: <strong>${otp}</strong></p>`,
    "Password Reset OTP"
  );

  return { message: "OTP resent to your email", otp }; // Remove otp in production
};

// verify forgot password OTP
const verifyForgotPasswordOtp = async (payload: {
  email: string;
  otp: string;
}) => {
  const user = await User.findOne({ email: payload.email });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found!");
  }

  if (
    user.resetPasswordOtp !== payload.otp ||
    !user.resetPasswordOtpExpiry ||
    user.resetPasswordOtpExpiry < new Date()
  ) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid or expired OTP!");
  }

  return { message: "OTP verified successfully", isValid: true };
};

// reset password
const resetPassword = async (
  email: string,
  newPassword: string,
  confirmPassword: string,
  otp: string
) => {
  // Check if passwords match
  if (newPassword !== confirmPassword) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "New password and confirm password do not match!"
    );
  }

  const user = await User.findOne({ email });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found!");
  }

  if (
    user.resetPasswordOtp !== otp ||
    !user.resetPasswordOtpExpiry ||
    user.resetPasswordOtpExpiry < new Date()
  ) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid or expired OTP!");
  }

  const hashedPassword = await bcrypt.hash(
    newPassword,
    Number(config.bcrypt_salt_rounds)
  );

  await User.findByIdAndUpdate(user._id, {
    password: hashedPassword,
    resetPasswordOtp: undefined,
    resetPasswordOtpExpiry: undefined,
  });

  return { message: "Password reset successfully" };
};

export const authService = {
  loginUser,
  getMyProfile,
  changePassword,
  forgotPassword,
  resendOtp,
  verifyForgotPasswordOtp,
  resetPassword,
};
