import express from "express";
import { authRoutes } from "../modules/auth/auth.routes";
import { notificationsRoute } from "../modules/notification/notification.routes";
import { userRoutes } from "../modules/user/user.route";
import { serviceRoutes } from "../modules/service/service.routes";
import { supportRoutes } from "../modules/support/support.routes";
import { DistanceRoutes } from "../modules/distance/distance.routes";
import { adminRoutes } from "../modules/admin/admin.routes";

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
  {
    path: "/support",
    route: supportRoutes,
  },
  {
    path: "/distance",
    route: DistanceRoutes,
  },
  {
    path: "/admin",
    route: adminRoutes,
  },
];

moduleRoutes.forEach((route) => router.use(route.path, route.route));

export default router;
