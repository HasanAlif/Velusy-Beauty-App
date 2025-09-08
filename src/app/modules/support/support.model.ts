import { Schema, model, Document } from "mongoose";

export interface ISupport extends Document {
  name: string;
  email: string;
  phone: string;
  service: string;
  note: string;
  createdAt: Date;
}

const supportSchema = new Schema<ISupport>(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    },
    service: {
      type: String,
      required: true,
    },
    note: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

const Support = model<ISupport>("Support", supportSchema);

export default Support;
