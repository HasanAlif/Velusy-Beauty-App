import express from "express";
import { authRoutes } from "../modules/auth/auth.routes";
import { notificationsRoute } from "../modules/notification/notification.routes";
import { userRoutes } from "../modules/user/user.route";
import { serviceRoutes } from "../modules/service/service.routes";

const router = express.Router();

const moduleRoutes = [
  {
    path: "/users",
    route: userRoutes,
  },
  {
    path: "/auth",
    route: authRoutes,
  },
  {
    path: "/notifications",
    route: notificationsRoute,
  },
  {
    path: "/services",
    route: serviceRoutes,
  },
];

moduleRoutes.forEach((route) => router.use(route.path, route.route));

export default router;
