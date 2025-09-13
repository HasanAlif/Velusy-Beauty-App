import mongoose, { Document, Schema, Types } from "mongoose";

export interface IService extends Document {
  _id: string;
  providerId: Types.ObjectId;
  categoryId: Types.ObjectId;
  name: string;
  atHome: boolean;
  atProviderLocation: boolean;
  description?: string;
  price: number;
  photo?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ServiceSchema = new Schema<IService>(
  {
    providerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    atHome: {
      type: Boolean,
      default: false,
    },
    atProviderLocation: {
      type: Boolean,
      default: false,
    },
    description: {
      type: String,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    photo: {
      type: String,
    },
  },
  { timestamps: true }
);

ServiceSchema.index({ name: "text", description: "text" });
ServiceSchema.index({ categoryId: 1, providerId: 1 });

export const Service = mongoose.model<IService>("Service", ServiceSchema);
