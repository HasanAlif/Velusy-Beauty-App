import express from "express";
import validateRequest from "../../middlewares/validateRequest";
import { UserValidation } from "./user.validation";
import { userController } from "./user.controller";
import auth from "../../middlewares/auth";
import { UserRole } from "../../models";
import { fileUploader } from "../../../helpars/fileUploader";

const router = express.Router();

// *!register user
router.post(
  "/register",
  // validateRequest(UserValidation.CreateUserValidationSchema),
  fileUploader.userMutipleFiles,
  userController.createUser
);

// complete profile
router.post(
  "/complete-profile",
  validateRequest(UserValidation.userProfileComplete),
  auth(),
  fileUploader.uploadSingle,
  userController.completeProfile
);

// Create or update professional profile
router.post(
  "/create-update-profile",
  fileUploader.profileMultipleFiles,
  userController.createOrUpdateProfile
);

// image upload
// router.put(
//   "/profile-image",
//   auth(),
//   fileUploader.uploadSingle,
//   userController.profileImageChange
// );

// *!update  user
// router.put("/:id", auth(), userController.updateUser);

// account update
// router.patch(
//   "/account-update",
//   validateRequest(UserValidation.userOptionalProfileSchema),
//   auth(),
//   userController.accountUpdate
// );

// update schedule
router.patch(
  "/update-schedule",
  validateRequest(UserValidation.updateScheduleValidationSchema),
  auth(),
  userController.updateSchedule
);

// get user schedule
router.get("/schedule", auth(), userController.getUserSchedule);

//edit user profile
router.patch(
  "/edit-profile",
  auth(),
  fileUploader.uploadSingleToCloudinary,
  userController.editUserProfile
);

// change password
router.patch(
  "/change-password",
  validateRequest(UserValidation.changePasswordValidationSchema),
  auth(),
  userController.changePassword
);

// delete me
// router.delete("/delete-me", auth(), userController.deleteMe);

export const userRoutes = router;
