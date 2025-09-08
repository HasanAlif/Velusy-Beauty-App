import express from "express";
import {
  createSupportMessage,
  getAllSupportMessages,
  getSupportMessageById,
} from "./support.controller";
import validateRequest from "../../middlewares/validateRequest";
import auth from "../../middlewares/auth";
import { supportValidation } from "./support.validation";
import { UserRole } from "../../models";

const router = express.Router();

router.post(
  "/",
  validateRequest(supportValidation.createSchema),
  createSupportMessage
);

router.get(
  "/",
  auth(UserRole.ADMIN),
  validateRequest(supportValidation.listQuery),
  getAllSupportMessages
);

router.get("/:id", auth(UserRole.ADMIN), getSupportMessageById);

export const supportRoutes = router;
