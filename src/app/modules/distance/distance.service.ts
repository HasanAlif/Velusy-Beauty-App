import httpStatus from "http-status";
import ApiError from "../../../errors/ApiErrors";
import { User, UserStatus } from "../../models";
import haversineDistance from "../../../utils/HeversineDistance";
import { Types } from "mongoose";
import { Service } from "../service/service.model";

// Helper function to ensure coordinates exist and are valid
const ensureCoords = (user: any) => {
  const lat = user.latitude;
  const lng = user.longitude;

  if (typeof lat !== "number" || typeof lng !== "number") {
    return null;
  }

  return { lat, lng };
};

// Calculate distance between two users
const distanceBetweenUsers = async (fromId: string, toId: string) => {
  try {
    if (!Types.ObjectId.isValid(fromId) || !Types.ObjectId.isValid(toId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid user IDs provided");
    }

    // Fetch both users with coordinates
    const [userA, userB] = await Promise.all([
      User.findById(fromId).select({
        firstName: 1,
        lastName: 1,
        latitude: 1,
        longitude: 1,
        status: 1,
      }),
      User.findById(toId).select({
        firstName: 1,
        lastName: 1,
        latitude: 1,
        longitude: 1,
        status: 1,
      }),
    ]);

    if (!userA || !userB) {
      throw new ApiError(httpStatus.NOT_FOUND, "One or both users not found");
    }

    if (
      userA.status === UserStatus.BLOCKED ||
      userB.status === UserStatus.BLOCKED
    ) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        "Cannot calculate distance for blocked users"
      );
    }

    if (
      userA.status === UserStatus.INACTIVE ||
      userB.status === UserStatus.INACTIVE
    ) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        "Cannot calculate distance for inactive users"
      );
    }

    // Get coordinates for both users
    const coordsA = ensureCoords(userA);
    const coordsB = ensureCoords(userB);

    if (!coordsA || !coordsB) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Coordinates missing for one or both users"
      );
    }

    // Calculate distance using Haversine formula
    const distanceKm = haversineDistance(
      coordsA.lat,
      coordsA.lng,
      coordsB.lat,
      coordsB.lng
    );

    return {
      km: distanceKm,
      fromUser: {
        id: userA._id,
        name: `${userA.firstName || ""} ${userA.lastName || ""}`.trim(),
        coordinates: { latitude: coordsA.lat, longitude: coordsA.lng },
      },
      toUser: {
        id: userB._id,
        name: `${userB.firstName || ""} ${userB.lastName || ""}`.trim(),
        coordinates: { latitude: coordsB.lat, longitude: coordsB.lng },
      },
    };
  } catch (error) {
    console.error("Error calculating distance between users:", error);
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Error calculating distance: " +
        (error instanceof Error ? error.message : "Unknown error")
    );
  }
};

// Find nearby users within radius, sorted by distance
const findNearbyUsers = async (opts: {
  userId: string;
  radiusKm?: number;
  role?: string;
  limit?: number;
}) => {
  try {
    const { userId, radiusKm = 10, role, limit = 50 } = opts;

    // Validate user ID
    if (!Types.ObjectId.isValid(userId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid user ID provided");
    }

    // Get the current user's coordinates
    const currentUser = await User.findById(userId).select({
      latitude: 1,
      longitude: 1,
      status: 1,
    });

    if (!currentUser) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    if (currentUser.status !== UserStatus.ACTIVE) {
      throw new ApiError(httpStatus.FORBIDDEN, "User account is not active");
    }

    const currentCoords = ensureCoords(currentUser);
    if (!currentCoords) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Your coordinates are missing. Please update your profile with a complete address."
      );
    }

    // Build query to find nearby users who have services
    const query: any = {
      _id: { $ne: new Types.ObjectId(userId) },
      status: UserStatus.ACTIVE,
      latitude: { $exists: true, $ne: null },
      longitude: { $exists: true, $ne: null },
    };

    if (role) {
      query.role = role;
    }

    // First, get all professionals who have services
    const professionalsWithServices = await Service.aggregate([
      {
        $group: {
          _id: "$providerId",
          serviceCount: { $sum: 1 },
        },
      },
      {
        $match: {
          serviceCount: { $gt: 0 },
        },
      },
    ]);

    const professionalIds = professionalsWithServices.map((p) => p._id);

    // Add filter to only get professionals who have services
    query._id = {
      $ne: new Types.ObjectId(userId),
      $in: professionalIds,
    };

    // Get all users that match the criteria and have services
    const allUsers = await User.find(query)
      .select({
        firstName: 1,
        lastName: 1,
        email: 1,
        role: 1,
        profilePicture: 1,
        city: 1,
        streetAddress: 1,
        latitude: 1,
        longitude: 1,
        serviceType: 1,
        serviceCategory: 1,
      })
      .lean();

    // Calculate distance for each user and filter by radius, only include users with services
    const professionalServices: Array<{
      professionalId: any;
      professionalName: string;
      professionalImage?: string;
      //professionalEmail: string;
      //professionalCity?: string;
      //professionalAddress?: string;
      //professionalServiceType?: string;
      //professionalServiceCategory?: string;
      serviceId: any;
      serviceName: string;
      serviceImage?: string;
      servicePrice: number;
      //serviceDescription?: string;
      serviceAtHome: boolean;
      serviceAtProviderLocation: boolean;
      distanceKm: number;
      // professionalCoordinates: {
      //   latitude: number;
      //   longitude: number;
      // };
    }> = [];

    for (const user of allUsers) {
      const userCoords = ensureCoords(user);
      if (!userCoords) continue;

      const distanceKm = haversineDistance(
        currentCoords.lat,
        currentCoords.lng,
        userCoords.lat,
        userCoords.lng
      );

      // Only include users within the specified radius
      if (distanceKm <= radiusKm) {
        // Get services for this professional
        const services = await Service.find({
          providerId: user._id,
        })
          .select({
            name: 1,
            price: 1,
            photo: 1,
            description: 1,
            atHome: 1,
            atProviderLocation: 1,
          })
          .lean();

        // Create a combined object for each service with professional details
        services.forEach((service) => {
          professionalServices.push({
            // Professional information
            professionalId: user._id,
            professionalName: `${user.firstName || ""} ${
              user.lastName || ""
            }`.trim(),
            professionalImage: user.profilePicture,
            //professionalEmail: user.email,
            //professionalCity: user.city,
            //professionalAddress: user.streetAddress,
            //professionalServiceType: user.serviceType,
            //professionalServiceCategory: user.serviceCategory,

            // Service information
            serviceId: service._id,
            serviceName: service.name,
            serviceImage: service.photo,
            servicePrice: service.price,
            //serviceDescription: service.description,
            serviceAtHome: service.atHome,
            serviceAtProviderLocation: service.atProviderLocation,

            // Distance information
            distanceKm: Number(distanceKm.toFixed(2)),
            // professionalCoordinates: {
            //   latitude: userCoords.lat,
            //   longitude: userCoords.lng,
            // },
          });
        });
      }
    }

    // Sort by distance and apply limit
    const sortedServices = professionalServices
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);

    return sortedServices;
  } catch (error) {
    console.error("Error finding nearby users:", error);
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Error finding nearby users: " +
        (error instanceof Error ? error.message : "Unknown error")
    );
  }
};

export const DistanceService = {
  distanceBetweenUsers,
  findNearbyUsers,
};
