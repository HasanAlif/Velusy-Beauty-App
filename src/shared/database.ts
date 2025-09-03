import mongoose from "mongoose";
import config from "../config";
import { User, UserRole } from "../app/models";
import bcrypt from "bcrypt";

async function connectMongoDB() {
  try {
    await mongoose.connect(config.database_url as string, {
      serverSelectionTimeoutMS: 5000,
      heartbeatFrequencyMS: 2000,
    });
    console.log("MongoDB connected successfully!");

    await initiateSuperAdmin();
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
}

mongoose.connection.on("connected", () => {
  console.log("Mongoose connected to MongoDB");
});

mongoose.connection.on("error", (err) => {
  console.error("Mongoose connection error:", err);
});

mongoose.connection.on("disconnected", () => {
  console.log("Mongoose disconnected from MongoDB");
});

async function initiateSuperAdmin() {
  const hashedPassword = await bcrypt.hash(
    "123456789",
    Number(config.bcrypt_salt_rounds)
  );
  const payload = {
    name: "Admin",
    email: "admin@gmail.com",
    phoneNumber: "0123456789",
    password: hashedPassword,
    role: UserRole.ADMIN,
    username: "Super Admin",
    city: "Dhaka",
    streetAddress: "Khilkhet, Nikunja-2",
  };

  const isExistUser = await User.findOne({
    email: payload.email,
  });

  if (isExistUser) return;

  await User.create(payload);
}

connectMongoDB();

export { connectMongoDB };
