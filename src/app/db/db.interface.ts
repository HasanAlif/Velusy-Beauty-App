import { UserRole } from "../models";

export interface IAdmin {
  name: string;
  username: string;
  email: string;
  phoneNumber: string;
  password: string;
  role: UserRole;
}
