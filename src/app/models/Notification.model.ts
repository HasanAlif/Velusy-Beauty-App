import mongoose, { Document, Schema } from "mongoose";
import { NotificationType } from "./User.model";

export interface INotification extends Document {
  _id: string;
  userId: string;
  title: string;
  body: string;
  type: NotificationType;
  postId?: string;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: {
      type: String,
      required: true,
      ref: "User",
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: Object.values(NotificationType),
      default: NotificationType.NORMAL,
    },
    postId: {
      type: String,
      required: false,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Index for better performance
NotificationSchema.index({ userId: 1 });
NotificationSchema.index({ type: 1 });
NotificationSchema.index({ createdAt: -1 });

export const Notification = mongoose.model<INotification>(
  "Notification",
  NotificationSchema
);
