import mongoose, { Document, Schema } from "mongoose";
import { Category } from "../modules/admin/category.model";

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

export enum ProfessionalLevel {
  BEGINNER = "BEGINNER",
  RISING_STAR = "RISING_STAR",
  PRO = "PRO",
  PRO_MASTER = "PRO_MASTER",
}

export interface IPortfolio {
  fileUrl: string;
  fileType: string;
}

export interface ISearchHistory {
  searchTerm?: string;
  filters?: {
    location?: string;
    city?: string;
    streetAddress?: string;
    categoryId?: string;
    category?: string;
    serviceName?: string;
    service?: string;
    minPrice?: number;
    maxPrice?: number;
    professionalLevel?: string;
    isVerified?: boolean;
  };
  resultServices?: string[];
  resultProfessionals?: string[];
  searchType: "unified" | "filter" | "unifiedSearch";
  timestamp: Date;
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
  savedServices?: mongoose.Types.ObjectId[];
  searchHistory?: ISearchHistory[];
  professionalLevel?: ProfessionalLevel;
  isVerified?: boolean;
  password: string;
  role: UserRole;
  status: UserStatus;
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

// Custom validator for profession field to check against category names
const validateProfession = async function (
  professionValue: string
): Promise<boolean> {
  if (!professionValue) return true;

  try {
    const category = await Category.findOne({ name: professionValue });
    return !!category;
  } catch (error) {
    console.error("Error validating profession:", error);
    return false;
  }
};

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
      validate: {
        validator: validateProfession,
        message: "Profession must be a valid category name created by admin",
      },
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
    savedServices: {
      type: [{ type: Schema.Types.ObjectId, ref: "Service" }],
      default: [],
    },
    searchHistory: {
      type: [
        {
          searchTerm: { type: String },
          filters: {
            location: { type: String },
            city: { type: String },
            streetAddress: { type: String },
            categoryId: { type: String },
            category: { type: String },
            serviceName: { type: String },
            service: { type: String },
            minPrice: { type: Number },
            maxPrice: { type: Number },
            professionalLevel: { type: String },
            isVerified: { type: Boolean },
          },
          resultServices: [{ type: String }],
          resultProfessionals: [{ type: String }],
          searchType: {
            type: String,
            enum: ["unified", "filter", "unifiedSearch"],
            required: true,
          },
          timestamp: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    professionalLevel: {
      type: String,
      enum: Object.values(ProfessionalLevel),
      default: ProfessionalLevel.BEGINNER,
    },
    isVerified: {
      type: Boolean,
      default: false,
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
UserSchema.index({ isVerified: 1 });
UserSchema.index({ role: 1, isVerified: 1 });

export enum NotificationType {
  NORMAL = "NORMAL",
  URGENT = "URGENT",
  PROMOTIONAL = "PROMOTIONAL",
  SYSTEM = "SYSTEM",
}

export const User = mongoose.model<IUser>("User", UserSchema);

// Helper function to get available professions (category names)
export const getAvailableProfessions = async (): Promise<string[]> => {
  try {
    const categories = await Category.find({}, "name").lean();
    return categories.map((category) => category.name);
  } catch (error) {
    console.error("Error fetching available professions:", error);
    return [];
  }
};
