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
  serviceDetails,
  getCategories,
  getServicesByCategory,
  getIndividualServiceDetails,
} from "./service.controller";
import { fileUploader } from "../../../helpars/fileUploader";
import { UserRole } from "../../models";

const router = express.Router();

router.get("/categories", auth(UserRole.GUEST), getCategories);

router.get(
  "/category/:categoryId",
  auth(UserRole.GUEST),
  validateRequest(ServiceValidation.categoryServicesSchema),
  getServicesByCategory
);

router.get(
  "/individual/:serviceId",
  validateRequest(ServiceValidation.serviceDetailsSchema),
  auth(UserRole.GUEST),
  getIndividualServiceDetails
);

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

router.get(
  "/details/:serviceId",
  validateRequest(ServiceValidation.serviceDetailsSchema),
  auth(UserRole.GUEST),
  serviceDetails
);

router.get("/:id", getServiceById);

router.delete("/:id", auth(), deleteService);

export const serviceRoutes = router;
