import express from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { ServiceValidation } from "./service.validation";
import {
  createService,
  listServices,
  getServiceById,
  updateService,
  deleteService,
} from "./service.controller";
import { fileUploader } from "../../../helpars/fileUploader";
import { UserRole } from "../../models";

const router = express.Router();

router.post(
  "/add",
  auth(UserRole.PROFESSIONAL),
  fileUploader.uploadSingle,
  validateRequest(ServiceValidation.createSchema),
  createService
);

router.put(
  "/:id",
  auth(),
  fileUploader.uploadSingle,
  validateRequest(ServiceValidation.updateSchema),
  updateService
);

router.get(
  "/",
  auth(),
  validateRequest(ServiceValidation.listQuery),
  listServices
);

router.get("/:id", getServiceById);

router.delete("/:id", auth(), deleteService);

export const serviceRoutes = router;
