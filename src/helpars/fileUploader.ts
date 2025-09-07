import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import {
  S3Client,
  PutObjectCommand,
  ObjectCannedACL,
} from "@aws-sdk/client-s3";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import streamifier from "streamifier";
import dotenv from "dotenv";

dotenv.config();

// Configure DigitalOcean Spaces
const s3Client = new S3Client({
  region: "us-east-1",
  endpoint: process.env.DO_SPACE_ENDPOINT,
  credentials: {
    accessKeyId: process.env.DO_SPACE_ACCESS_KEY || "",
    secretAccessKey: process.env.DO_SPACE_SECRET_KEY || "",
  },
});

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer configuration using memoryStorage (for DigitalOcean & Cloudinary)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ✅ Fixed Cloudinary Storage
const cloudinaryStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    public_id: (req, file) => `${Date.now()}_${file.originalname}`,
  },
});

const cloudinaryUpload = multer({ storage: cloudinaryStorage });

// Upload single image with Cloudinary storage
const uploadSingleToCloudinary = cloudinaryUpload.single("image");

// Upload single image
const uploadSingle = upload.single("image");
const uploadProfilePicture = upload.single("profileImage"); // For profile image specifically
const uploadFile = upload.single("file");

// Upload multiple images
const uploadMultipleImage = upload.fields([{ name: "images", maxCount: 15 }]);
const uploadMultipleFiles = upload.fields([{ name: "files", maxCount: 15 }]);

// Upload profile and banner images
const userMutipleFiles = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "image", maxCount: 1 },
]);

// Upload for createOrUpdateProfile endpoint
const profileMultipleFiles = upload.fields([
  { name: "profilePicture", maxCount: 1 },
  { name: "portfolioFiles", maxCount: 5 },
  { name: "certificateFiles", maxCount: 5 },
  { name: "companyCertificateFiles", maxCount: 5 },
]);

// ✅ Enhanced Cloudinary Upload with better file handling
const uploadToCloudinary = async (
  file: Express.Multer.File,
  folder: string = "uploads"
): Promise<{ Location: string; public_id: string }> => {
  if (!file) {
    throw new Error("File is required for uploading.");
  }

  return new Promise((resolve, reject) => {
    // Generate unique filename
    const uniqueFilename = `${Date.now()}_${Math.random().toString(36).substring(2)}_${file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: "auto", // Supports images, videos, etc.
        public_id: uniqueFilename.split('.')[0], // Remove extension for public_id
        unique_filename: true,
        overwrite: false,
        quality: "auto",
        fetch_format: "auto"
      },
      (error, result) => {
        if (error) {
          console.error("Error uploading file to Cloudinary:", error);
          return reject(error);
        }

        // ✅ Explicitly return `Location` and `public_id`
        resolve({
          Location: result?.secure_url || "", // Cloudinary URL
          public_id: result?.public_id || "",
        });
      }
    );

    // Convert buffer to stream and upload
    streamifier.createReadStream(file.buffer).pipe(uploadStream);
  });
};

// ✅ Unchanged: DigitalOcean Upload
const uploadToDigitalOcean = async (file: Express.Multer.File) => {
  if (!file) {
    throw new Error("File is required for uploading.");
  }

  try {
    const Key = `nathancloud/${Date.now()}_${uuidv4()}_${file.originalname}`;
    const uploadParams = {
      Bucket: process.env.DO_SPACE_BUCKET || "",
      Key,
      Body: file.buffer, // ✅ Use buffer instead of file path
      ACL: "public-read" as ObjectCannedACL,
      ContentType: file.mimetype,
    };

    // Upload file to DigitalOcean Spaces
    await s3Client.send(new PutObjectCommand(uploadParams));

    // Format the URL
    const fileURL = `${process.env.DO_SPACE_ENDPOINT}/${process.env.DO_SPACE_BUCKET}/${Key}`;
    return {
      Location: fileURL,
      Bucket: process.env.DO_SPACE_BUCKET || "",
      Key,
    };
  } catch (error) {
    console.error("Error uploading file to DigitalOcean:", error);
    throw error;
  }
};

// Upload profile image specifically
const uploadProfileImage = async (file: Express.Multer.File) => {
  return uploadToCloudinary(file, "profile-images");
};

// Upload general file
const uploadGeneralFile = async (file: Express.Multer.File) => {
  return uploadToCloudinary(file, "user-files");
};

// Function to delete image from Cloudinary
const deleteFromCloudinary = async (imageUrl: string): Promise<boolean> => {
  try {
    if (!imageUrl) return false;
    
    const urlParts = imageUrl.split('/');
    const versionIndex = urlParts.findIndex(part => part.startsWith('v'));
    
    if (versionIndex === -1) return false;
    
    const publicIdWithExtension = urlParts.slice(versionIndex + 1).join('/');
    // Remove file extension
    const publicId = publicIdWithExtension.split('.')[0];
    
    // Delete from Cloudinary
    const result = await cloudinary.uploader.destroy(publicId);
    
    console.log('Cloudinary delete result:', result);
    return result.result === 'ok';
    
  } catch (error) {
    console.error('Error deleting image from Cloudinary:', error);
    return false;
  }
};

export const fileUploader = {
  upload,
  uploadSingle,
  uploadSingleToCloudinary,
  uploadProfilePicture,
  uploadMultipleFiles,
  uploadMultipleImage,
  userMutipleFiles,
  profileMultipleFiles,
  uploadFile,
  cloudinaryUpload,
  uploadToDigitalOcean,
  uploadToCloudinary,
  uploadProfileImage,
  uploadGeneralFile,
  deleteFromCloudinary,
};
