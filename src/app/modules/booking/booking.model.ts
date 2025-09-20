import { Schema, model, Document } from "mongoose";
import { Types } from "mongoose";

interface IBooking extends Document {
  guestId: Types.ObjectId;
  professionalId: Types.ObjectId;
  serviceId: Types.ObjectId;
  serviceTitle?: string;
  extraService?: string;
  price?: number;
  extrasPrice?: number;
  date: Date;
  location: string;
  description?: string;
  scheduledAt: string;
  status: "Requested" | "Pending" | "InProgress" | "Completed" | "Rejected";
  createdAt: Date;
  updatedAt: Date;
}

const bookingSchema = new Schema<IBooking>(
  {
    guestId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    professionalId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    serviceId: {
      type: Schema.Types.ObjectId,
      ref: "Service",
      required: true,
    },
    serviceTitle: {
      type: String,
    },
    extraService: {
      type: String,
    },
    price: {
      type: Number,
      required: true,
    },
    extrasPrice: {
      type: Number,
      default: 0,
    },
    date: {
      type: Date,
      required: true,
    },
    location: {
      type: String,
      required: true,
    },
    description: { 
      type: String, 
    },
    scheduledAt: { 
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["Requested", "Pending", "InProgress", "Completed", "Rejected"],
      default: "Requested",
    },
  },
  { timestamps: true }
);

const Booking = model<IBooking>("Booking", bookingSchema);

export default Booking;
