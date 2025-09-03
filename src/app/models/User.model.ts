import mongoose, { Document, Schema } from "mongoose";

export enum UserRole {
  ADMIN = "ADMIN",
  GUEST = "GUEST",
  PROFESSIONAL = "PROFESSIONAL",
}

export enum UserStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  BLOCKED = "BLOCKED",
}

export interface IUser extends Document {
  _id: string;
  firstName?: string;
  lastName?: string;
  userName?: string;
  profession?: string;
  email: string;
  phoneNumber?: string;
  city: string;
  streetAddress: string;
  profilePicture?: string;
  file?: string;
  password: string;
  role: UserRole;
  status: UserStatus;
  isDeleted: boolean;
  fcmToken?: string;
  resetPasswordOtp?: string;
  resetPasswordOtpExpiry?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    firstName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    userName: {
      type: String,
      trim: true,
    },
    profession: {
      type: String,
      trim: true,
    },
    file: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phoneNumber: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      required: true,
    },
    streetAddress: {
      type: String,
      required: true,
    },
    profilePicture: {
      type: String,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.GUEST,
    },
    status: {
      type: String,
      enum: Object.values(UserStatus),
      default: UserStatus.ACTIVE,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    fcmToken: {
      type: String,
    },
    resetPasswordOtp: {
      type: String,
    },
    resetPasswordOtpExpiry: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);
// Index for better performance
UserSchema.index({ role: 1 });
UserSchema.index({ status: 1 });

export enum NotificationType {
  NORMAL = "NORMAL",
  URGENT = "URGENT",
  PROMOTIONAL = "PROMOTIONAL",
  SYSTEM = "SYSTEM",
}

export const User = mongoose.model<IUser>("User", UserSchema);
