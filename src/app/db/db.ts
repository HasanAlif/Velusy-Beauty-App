import { UserRole, User } from "../models";
import bcrypt from "bcrypt";
import config from "../../config";
import { IAdmin } from "./db.interface";

export const initiateSuperAdmin = async () => {
  const hashedPassword = await bcrypt.hash(
    "123456789",
    Number(config.bcrypt_salt_rounds)
  );
  const payload: IAdmin = {
    name: "Admin",
    email: "admin@gmail.com",
    phoneNumber: "0123456789",
    password: hashedPassword,
    role: UserRole.ADMIN,
    username: "Super Admin",
    city: "New York",
    streetAddress: "721 Broadway, New York, NY 10003",
  };

  const isExistUser = await User.findOne({
    email: payload.email,
  });

  if (isExistUser) return;

  await User.create(payload);
};

const dbService = {
  initiateSuperAdmin,
};

export default dbService;
