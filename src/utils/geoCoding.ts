import axios from "axios";
import config from "../config";

const GEOCODING_API_KEY = config.geocoding_api_key;

interface GoogleGeocodingResponse {
  results: {
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
    };
  }[];
  status: string;
  error_message?: string;
}

// Detect API service based on key format
const detectGeocodingService = (
  apiKey: string
): "google" | "serpapi" | "unknown" => {
  if (apiKey.startsWith("AIza") && apiKey.length === 39) {
    return "google";
  } else if (apiKey.length === 64 && /^[a-f0-9]+$/.test(apiKey)) {
    console.log("🔍 Detected SerpApi key");
    return "serpapi";
  }
  return "unknown";
};

// Google Geocoding API
const getCoordinatesFromGoogle = async (
  address: string
): Promise<{ latitude: number; longitude: number }> => {
  const GOOGLE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

  const response = await axios.get<GoogleGeocodingResponse>(GOOGLE_URL, {
    params: {
      address: address.trim(),
      key: GEOCODING_API_KEY,
    },
    timeout: 10000,
  });

  if (response.data.status !== "OK") {
    throw new Error(
      `Google Geocoding API error: ${response.data.status} - ${
        response.data.error_message || "Unknown error"
      }`
    );
  }

  const location = response.data.results[0]?.geometry?.location;
  if (!location) {
    throw new Error(`No location data found for address: ${address}`);
  }

  return {
    latitude: location.lat,
    longitude: location.lng,
  };
};

// SerpApi implementation
interface SerpApiResponse {
  search_metadata: {
    status: string;
  };
  knowledge_graph?: {
    gps_coordinates?: {
      latitude: number;
      longitude: number;
    };
  };
  local_results?: Array<{
    gps_coordinates?: {
      latitude: number;
      longitude: number;
    };
    position: number;
  }>;
  error?: string;
}

const getCoordinatesFromSerpApi = async (
  address: string
): Promise<{ latitude: number; longitude: number }> => {
  console.log("🔄 Attempting SerpApi geocoding...");

  const SERPAPI_URL = "https://serpapi.com/search";

  // Try Google Places first (most accurate for addresses) - Single attempt
  try {
    console.log("🔍 Trying Google Places API via SerpApi...");
    const placesResponse = await axios.get<any>(SERPAPI_URL, {
      params: {
        q: address,
        engine: "google_maps",
        type: "search",
        api_key: GEOCODING_API_KEY,
      },
      timeout: 15000,
    });

    // Try place_results first
    if (
      placesResponse.data.place_results &&
      placesResponse.data.place_results.length > 0
    ) {
      const place = placesResponse.data.place_results[0];
      if (place.gps_coordinates) {
        console.log("✅ Found coordinates via Google Places - place_results");
        return {
          latitude: place.gps_coordinates.latitude,
          longitude: place.gps_coordinates.longitude,
        };
      }
    }

    // Try local_results from Places API
    if (
      placesResponse.data.local_results &&
      placesResponse.data.local_results.length > 0
    ) {
      const localPlace = placesResponse.data.local_results[0];
      if (localPlace.gps_coordinates) {
        console.log("✅ Found coordinates via Google Places - local_results");
        return {
          latitude: localPlace.gps_coordinates.latitude,
          longitude: localPlace.gps_coordinates.longitude,
        };
      }
    }
  } catch (error) {
    console.log(
      "❌ Google Places via SerpApi failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
  }

  // Fallback: Try only the most effective regular search strategy
  console.log("🔍 Trying regular Google Search via SerpApi...");

  try {
    const response = await axios.get<SerpApiResponse>(SERPAPI_URL, {
      params: {
        q: `${address} coordinates`,
        engine: "google",
        api_key: GEOCODING_API_KEY,
        location: "United States",
        num: 10, // Increased back for better results
      },
      timeout: 15000,
    });

    console.log(
      "📊 SerpApi Response Status:",
      response.data.search_metadata?.status
    );
    console.log("📊 SerpApi Response Keys:", Object.keys(response.data));

    if (response.data.search_metadata.status !== "Success") {
      throw new Error(response.data.error || "Search failed");
    }

    // Try knowledge graph first (most reliable)
    if (response.data.knowledge_graph?.gps_coordinates) {
      const coords = response.data.knowledge_graph.gps_coordinates;
      console.log("✅ Found coordinates in knowledge graph");
      return {
        latitude: coords.latitude,
        longitude: coords.longitude,
      };
    }

    // Try local results
    if (response.data.local_results && response.data.local_results.length > 0) {
      console.log(
        `📍 Found ${response.data.local_results.length} local results`
      );
      for (const result of response.data.local_results) {
        if (result.gps_coordinates) {
          console.log("✅ Found coordinates in local results");
          return {
            latitude: result.gps_coordinates.latitude,
            longitude: result.gps_coordinates.longitude,
          };
        }
      }
    }

    // Try answer box
    const answerBox = (response.data as any).answer_box;
    if (answerBox) {
      console.log("📦 Found answer box");
      const answerText = JSON.stringify(answerBox);
      const coordMatch = answerText.match(/(-?\d+\.?\d+)[,\s]+(-?\d+\.?\d+)/);
      if (coordMatch) {
        const lat = parseFloat(coordMatch[1]);
        const lng = parseFloat(coordMatch[2]);
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          console.log("✅ Found coordinates in answer box");
          return { latitude: lat, longitude: lng };
        }
      }
    }

    // Try organic results with coordinate pattern matching
    const organicResults = (response.data as any).organic_results;
    if (organicResults && organicResults.length > 0) {
      console.log(`🔍 Found ${organicResults.length} organic results`);

      // Check first 5 results for better coverage
      for (let i = 0; i < Math.min(5, organicResults.length); i++) {
        const result = organicResults[i];
        const snippet = result.snippet || "";
        const title = result.title || "";
        const link = result.link || "";
        const combinedText = `${title} ${snippet}`;

        console.log(
          `🔍 Checking result ${i + 1}: ${title.substring(0, 50)}...`
        );

        // Enhanced coordinate pattern matching
        const coordPatterns = [
          // Decimal degrees with optional directions: "40.7589°N, 73.9851°W" or "40.7589, -73.9851"
          /(-?\d+\.?\d*)[°\s]*[NS]?[,\s]+(-?\d+\.?\d*)[°\s]*[EW]?/gi,
          // Explicit latitude/longitude: "latitude: 40.7589, longitude: -73.9851"
          /latitude[:\s]*(-?\d+\.?\d*)[,\s]*longitude[:\s]*(-?\d+\.?\d*)/gi,
          // Short form: "lat: 40.7589, lng: -73.9851"
          /lat[:\s]*(-?\d+\.?\d*)[,\s]*lng[:\s]*(-?\d+\.?\d*)/gi,
          // Reverse order: "longitude: -73.9851, latitude: 40.7589"
          /longitude[:\s]*(-?\d+\.?\d*)[,\s]*latitude[:\s]*(-?\d+\.?\d*)/gi,
          // Google Maps style: "/@40.7589,-73.9851"
          /@(-?\d+\.?\d*),(-?\d+\.?\d*)/gi,
          // Wikipedia style coordinates with degrees: "40°45′12″N 73°58′36″W"
          /(\d+)°(\d+)′(\d+)″N[,\s]*(\d+)°(\d+)′(\d+)″W/gi,
        ];

        for (let p = 0; p < coordPatterns.length; p++) {
          const pattern = coordPatterns[p];
          let match;

          // Reset regex lastIndex for global patterns
          pattern.lastIndex = 0;
          match = pattern.exec(combinedText);

          if (match) {
            let lat, lng;

            // Handle different pattern types
            if (p === 3) {
              // longitude first pattern
              lng = parseFloat(match[1]);
              lat = parseFloat(match[2]);
            } else if (p === 5) {
              // Wikipedia DMS format: 40°45′12″N 73°58′36″W
              // Convert degrees, minutes, seconds to decimal
              const latDeg = parseFloat(match[1]);
              const latMin = parseFloat(match[2]);
              const latSec = parseFloat(match[3]);
              const lngDeg = parseFloat(match[4]);
              const lngMin = parseFloat(match[5]);
              const lngSec = parseFloat(match[6]);

              lat = latDeg + latMin / 60 + latSec / 3600;
              lng = -(lngDeg + lngMin / 60 + lngSec / 3600); // West is negative
            } else {
              // latitude first patterns
              lat = parseFloat(match[1]);
              lng = parseFloat(match[2]);

              // For US addresses, if longitude is positive, it should be negative
              if (
                lng > 0 &&
                (address.toLowerCase().includes("usa") ||
                  address.toLowerCase().includes("united states") ||
                  address.toLowerCase().includes("new york") ||
                  address.toLowerCase().includes("california") ||
                  address.toLowerCase().includes("florida"))
              ) {
                lng = -lng;
              }
            }

            // Basic validation for reasonable coordinates
            if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
              console.log("✅ Found coordinates in organic results");
              console.log(`📍 Extracted: lat=${lat}, lng=${lng}`);
              console.log(
                `🔍 Pattern used: ${p + 1}, Text: "${combinedText.substring(
                  0,
                  100
                )}..."`
              );
              return {
                latitude: lat,
                longitude: lng,
              };
            }
          }
        }
      }
    }

    console.log("❌ No coordinates found in any SerpApi results");
    throw new Error("No coordinates found in search results");
  } catch (error) {
    console.log(
      "❌ Regular search failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
    throw new Error(
      `No coordinates found for address: ${address} using SerpApi`
    );
  }
};

export const getCoordinates = async (
  address: string
): Promise<{ latitude: number; longitude: number }> => {
  try {
    // Validate inputs
    if (!address || address.trim() === "") {
      throw new Error("Address is required for geocoding");
    }

    if (!GEOCODING_API_KEY) {
      throw new Error("Geocoding API key is not configured");
    }

    console.log(`Attempting to geocode address: "${address}"`);

    // Detect which service to use
    const service = detectGeocodingService(GEOCODING_API_KEY);
    console.log(`Detected geocoding service: ${service}`);

    let coordinates: { latitude: number; longitude: number };

    switch (service) {
      case "google":
        coordinates = await getCoordinatesFromGoogle(address);
        break;
      case "serpapi":
        try {
          coordinates = await getCoordinatesFromSerpApi(address);
        } catch (serpError) {
          console.log(
            "⚠️ SerpApi failed, trying Google Geocoding as fallback..."
          );
          coordinates = await getCoordinatesFromGoogle(address);
        }
        break;
      default:
        // Try Google first, then SerpApi as fallback
        try {
          console.log("Trying Google API...");
          coordinates = await getCoordinatesFromGoogle(address);
        } catch (googleError) {
          console.log("🔄 Google API failed. Trying SerpApi...");
          coordinates = await getCoordinatesFromSerpApi(address);
        }
    }

    console.log(`Geocoding successful for "${address}":`, coordinates);
    return coordinates;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("Axios error during geocoding:", {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        address: address,
      });

      if (error.code === "ENOTFOUND") {
        throw new Error("Network error: Unable to reach geocoding API");
      } else if (error.code === "ECONNABORTED") {
        throw new Error("Geocoding request timeout");
      } else {
        throw new Error(`Network error during geocoding: ${error.message}`);
      }
    } else {
      console.error("Geocoding error:", error);
      throw error instanceof Error
        ? error
        : new Error("Unknown geocoding error");
    }
  }
};
