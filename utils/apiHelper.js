const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { logApiCall } = require("./logger");

const CACHE_FILE = path.join(__dirname, "..", "data", "cache.json");
const CACHE_DURATION_MS = 3 * 60 * 60 * 1000; // 3 hours

/**
 * Ensure the cache file exists. Auto-creates it if missing.
 */
function ensureCacheFileExists() {
  const dir = path.dirname(CACHE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(CACHE_FILE)) {
    fs.writeFileSync(CACHE_FILE, JSON.stringify({}), "utf8");
  }
}

/**
 * Check if a timestamp is within the valid 3-hour cache window.
 * @param {number} timestamp - The time the data was cached.
 * @returns {boolean} True if valid, false if expired.
 */
function isCacheValid(timestamp) {
  return Date.now() - timestamp < CACHE_DURATION_MS;
}

/**
 * Retrieve data from the cache using a specific key.
 * @param {string} key - the unique cache key.
 * @param {object} options - Options for retrieval (e.g. ignoreExpiry: true)
 * @returns {object|null} The cached data if valid/stale-requested, otherwise null.
 */
function getCache(key, { ignoreExpiry = false } = {}) {
  ensureCacheFileExists();
  try {
    const rawData = fs.readFileSync(CACHE_FILE, "utf8");
    const cache = JSON.parse(rawData);

    if (cache[key] && isCacheValid(cache[key].timestamp)) {
      console.log(`[CACHE HIT] Found valid data for key: ${key}`);
      return cache[key].data;
    } else if (cache[key]) {
      if (ignoreExpiry) {
        console.log(`[STALE CACHE HIT] Returning expired data for key: ${key}`);
        return cache[key].data;
      }
      console.log(`[CACHE EXPIRED] Data expired for key: ${key}`);
      delete cache[key]; // Clean up expired entry
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
    }
  } catch (error) {
    console.error("Error reading cache file:", error);
  }
  return null;
}

/**
 * Store data securely into the file-based cache.
 * @param {string} key - the unique cache key.
 * @param {object} data - the API payload to cache.
 */
function setCache(key, data) {
  ensureCacheFileExists();
  try {
    const rawData = fs.readFileSync(CACHE_FILE, "utf8");
    const cache = JSON.parse(rawData);
    
    cache[key] = {
      timestamp: Date.now(),
      data: data
    };

    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
    console.log(`[CACHE SAVED] Successful write for key: ${key}`);
  } catch (error) {
    console.error("Error writing to cache file:", error);
  }
}

/**
 * Makes a resilient OpenWeather API request with Primary -> Backup failover.
 * It also automatically handles JSON-based intelligent caching.
 *
 * @param {string} urlTemplate - API URL template with an __API_KEY__ placeholder.
 * @param {string} cacheKey - Unique key to identify this query in the cache (e.g. 'geo_london').
 * @param {string} endpointName - Human-readable endpoint name for logging (e.g. 'Geocoding').
 * @param {string} locationName - Human-readable location name for logging (e.g. 'London').
 * @returns {Promise<{ isCached: boolean, data: any }>}
 */
async function makeWeatherRequest(urlTemplate, cacheKey, endpointName, locationName) {
  // 1. Check Intelligent Cache First
  const cachedData = getCache(cacheKey);
  if (cachedData) {
    // Log the cache hit to the dashboard
    logApiCall({
      endpoint: endpointName,
      city: locationName,
      status: "cache_hit",
      statusCode: 200,
    });
    return { isCached: true, data: cachedData };
  }

  // Cache is Miss or Expired. Let's make the API request.
  const PRIMARY_KEY = process.env.PRIMARY_API_KEY || process.env.API_KEY;
  const BACKUP_KEY = process.env.BACKUP_API_KEY;

  if (!PRIMARY_KEY) {
    throw new Error("No PRIMARY_API_KEY found in .env");
  }

  console.log(`[API REQUEST] Fetching ${endpointName} for ${locationName}...`);

  try {
    // Attempt 1: Try Primary API Key
    const primaryUrl = urlTemplate.replace("__API_KEY__", PRIMARY_KEY);
    const response = await axios.get(primaryUrl);
    
    // Log success
    logApiCall({
      endpoint: endpointName,
      city: locationName,
      status: "success",
      statusCode: response.status,
    });

    // Save success to Cache
    setCache(cacheKey, response.data);

    return { isCached: false, data: response.data };

  } catch (err) {
    // Attempt 1 Failed. Should we Failover?
    const statusCode = err.response?.status;
    const isFailoverCandidate = !statusCode || statusCode === 401 || statusCode === 429 || statusCode >= 500;

    console.error(`[API ERROR WARNING] Primary key failed (${statusCode}): ${err.message}`);

    // If we have a backup key and it's a valid failover reason, retry.
    if (BACKUP_KEY && isFailoverCandidate) {
      console.log(`[API FALLBACK] Using BACKUP_API_KEY for ${endpointName}...`);

      try {
        const backupUrl = urlTemplate.replace("__API_KEY__", BACKUP_KEY);
        const backupResponse = await axios.get(backupUrl);

        // Backup succeeded! Log it.
        logApiCall({
          endpoint: endpointName,
          city: locationName,
          status: "success (backup)", // Indicate it was via backup key
          statusCode: backupResponse.status,
        });

        // Save backup success to Cache
        setCache(cacheKey, backupResponse.data);

        return { isCached: false, data: backupResponse.data };
      } catch (backupErr) {
        // Backup ALSO failed. We are totally offline/broken.
        console.error(`[CRITICAL] Backup key ALSO failed (${backupErr.response?.status}): ${backupErr.message}`);
        
        // Final lifeline: check if we have ANY data for this location, even if expired.
        const staleData = getCache(cacheKey, { ignoreExpiry: true });
        if (staleData) {
          console.log(`[STALE CACHE FALLBACK] Using expired cache for ${locationName}...`);
          logApiCall({
            endpoint: endpointName,
            city: locationName,
            status: "stale_cache",
            statusCode: 200,
            errorMsg: "API failed, used stale data",
          });
          return { isCached: true, data: staleData };
        }

        // We have no lifelines left.
        logApiCall({
          endpoint: endpointName,
          city: locationName,
          status: "error",
          statusCode: backupErr.response?.status || 500,
          errorMsg: backupErr.message,
        });

        throw backupErr; // Let the route catch it and show UI error
      }
    } else {
      // Not a real failover reason (e.g. 404 Not Found), or no backup key provided.
      
      // Before throwing, let's also check if stale data exists (e.g. if offline)
      const staleData = getCache(cacheKey, { ignoreExpiry: true });
      if (staleData) {
        console.log(`[STALE CACHE FALLBACK] Using expired cache for ${locationName}...`);
        logApiCall({
          endpoint: endpointName,
          city: locationName,
          status: "stale_cache",
          statusCode: 200,
          errorMsg: `API Error ${statusCode}, used stale data`,
        });
        return { isCached: true, data: staleData };
      }

      logApiCall({
        endpoint: endpointName,
        city: locationName,
        status: "error",
        statusCode: statusCode || 500,
        errorMsg: err.message,
      });

      throw err; // Let the route catch it
    }
  }
}

module.exports = {
  getCache,
  setCache,
  isCacheValid,
  makeWeatherRequest
};
