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

export interface IPortfolio {
  fileUrl: string;
  fileType: string;
}

export interface IUser extends Document {
  _id: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  userName?: string;
  profession?: string;
  personalDescription?: string;
  email: string;
  phoneNumber?: string;
  city: string;
  streetAddress: string;
  latitude: number;
  longitude: number;
  profilePicture?: string;
  file?: string;
  schedule?: { [date: string]: { time: string; status: string }[] };
  serviceType?: string;
  serviceCategory?: string;
  portfolio?: IPortfolio[];
  language?: string;
  certificates?: IPortfolio[];
  companyCertificates?: IPortfolio[];
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

const portfolioSchema = new Schema<IPortfolio>({
  fileUrl: { type: String, required: true },
  fileType: { type: String, required: true },
});

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
    fullName: {
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
    personalDescription: {
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
    latitude: {
      type: Number,
    },
    longitude: {
      type: Number,
    },
    profilePicture: {
      type: String,
    },
    schedule: {
      type: Object,
      default: {}, // Key as date, value as array of time slots
    },
    serviceType: {
      type: String,
      trim: true,
    },
    serviceCategory: {
      type: String,
      trim: true,
    },
    portfolio: {
      type: [portfolioSchema],
      default: [],
    },
    language: {
      type: String,
      trim: true,
    },
    certificates: {
      type: [portfolioSchema],
      default: [],
    },
    companyCertificates: {
      type: [portfolioSchema],
      default: [],
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
UserSchema.index({ userName: 1 });
UserSchema.index({ serviceType: 1 });
UserSchema.index({ serviceCategory: 1 });
UserSchema.index({ email: 1, userName: 1 });

export enum NotificationType {
  NORMAL = "NORMAL",
  URGENT = "URGENT",
  PROMOTIONAL = "PROMOTIONAL",
  SYSTEM = "SYSTEM",
}

export const User = mongoose.model<IUser>("User", UserSchema);
