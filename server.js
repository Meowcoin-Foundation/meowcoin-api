import express from "express";
import dotenv from "dotenv";
import { rpc } from "./rpc.js";
import { Cache, isCacheValid } from "./cache.js";
import { log, shouldLog } from "./utils.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const TTL = parseInt(process.env.CACHE_TTL_MS || 60000, 10);

// Meowcoin consensus parameters
const INITIAL_SUBSIDY = 5000;        // MEWC
const HALVING_INTERVAL = 2100000;   // blocks (~4 years @ 1 min blocks)

/**
 * Calculate block subsidy based on consensus rules
 * @param {number} height - Block height
 * @returns {number} Block subsidy in MEWC
 */
function getBlockSubsidy(height) {
  const halvings = Math.floor(height / HALVING_INTERVAL);
  
  // Cap at 64 halvings (like Bitcoin)
  if (halvings >= 64) {
    return 0;
  }
  
  return INITIAL_SUBSIDY / Math.pow(2, halvings);
}

// Middleware
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  if (shouldLog("info")) {
    log(`${req.method} ${req.path} - ${req.ip}`);
  }
  next();
});

/**
 * Fetch data with caching and fallback
 * @param {string} key - Cache key
 * @param {Function} fn - Async function to fetch fresh data
 * @returns {Promise<any>} Cached or fresh data
 */
async function cachedFetch(key, fn) {
  const now = Date.now();

  // Check if cache is still valid
  if (isCacheValid(TTL) && Cache.data[key] !== null && Cache.data[key] !== undefined) {
    if (shouldLog("debug")) {
      log(`Cache hit for ${key}`);
    }
    return Cache.data[key];
  }

  // Try to fetch fresh data
  try {
    const value = await fn();
    Cache.data[key] = value;
    Cache.updated = now;
    
    if (shouldLog("info")) {
      log(`Updated cache for ${key}: ${JSON.stringify(value)}`);
    }
    
    return value;
  } catch (err) {
    log(`RPC failure for ${key}: ${err.message}`, "error");
    
    // Fallback to cached value if available
    if (Cache.data[key] !== null && Cache.data[key] !== undefined) {
      log(`Using cached fallback for ${key}`, "warn");
      return Cache.data[key];
    }
    
    // No cache available, re-throw error
    throw err;
  }
}

// ==================== ENDPOINTS ====================

/**
 * GET /total-supply
 * Returns the current total supply
 */
app.get("/total-supply", async (req, res) => {
  try {
    const supply = await cachedFetch("total_supply", async () => {
      const info = await rpc("gettxoutsetinfo");
      if (!info || typeof info.total_amount === "undefined") {
        throw new Error("Invalid response from gettxoutsetinfo");
      }
      return info.total_amount;
    });

    res.json({ total_supply: supply });
  } catch (err) {
    log(`Error in /total-supply: ${err.message}`, "error");
    res.status(503).json({ 
      error: "Service temporarily unavailable",
      message: "Unable to fetch total supply"
    });
  }
});

/**
 * GET /circulating-supply
 * Returns the current circulating supply
 */
app.get("/circulating-supply", async (req, res) => {
  try {
    const circ = await cachedFetch("circulating_supply", async () => {
      const info = await rpc("gettxoutsetinfo");
      if (!info || typeof info.total_amount === "undefined") {
        throw new Error("Invalid response from gettxoutsetinfo");
      }
      return info.total_amount;
    });

    res.json({ circulating_supply: circ });
  } catch (err) {
    log(`Error in /circulating-supply: ${err.message}`, "error");
    res.status(503).json({ 
      error: "Service temporarily unavailable",
      message: "Unable to fetch circulating supply"
    });
  }
});

/**
 * GET /block-reward
 * Returns the current block reward and breakdown (consensus-derived subsidy)
 */
app.get("/block-reward", async (req, res) => {
  try {
    const data = await cachedFetch("block_reward", async () => {
      const chain = await rpc("getblockchaininfo");
      if (!chain || typeof chain.blocks === "undefined") {
        throw new Error("Invalid response from getblockchaininfo");
      }
      
      const height = chain.blocks;
      const subsidy = getBlockSubsidy(height);
      const miner = subsidy * 0.60;
      const foundation = subsidy * 0.40;

      return { 
        height, 
        subsidy_total: subsidy,
        miner, 
        foundation 
      };
    });

    res.json({
      height: data.height,
      block_reward: data.subsidy_total,
      miner_reward: data.miner,
      foundation_reward: data.foundation
    });
  } catch (err) {
    log(`Error in /block-reward: ${err.message}`, "error");
    res.status(503).json({ 
      error: "Service temporarily unavailable",
      message: "Unable to fetch block reward"
    });
  }
});

/**
 * GET /reward-breakdown
 * Returns detailed reward breakdown with percentages (consensus-derived subsidy)
 */
app.get("/reward-breakdown", async (req, res) => {
  try {
    const data = await cachedFetch("reward_breakdown", async () => {
      const chain = await rpc("getblockchaininfo");
      if (!chain || typeof chain.blocks === "undefined") {
        throw new Error("Invalid response from getblockchaininfo");
      }
      
      const height = chain.blocks;
      const subsidy = getBlockSubsidy(height);
      const miner = subsidy * 0.60;
      const foundation = subsidy * 0.40;

      return {
        height,
        subsidy_total: subsidy,
        miner_percentage: 60,
        foundation_percentage: 40,
        miner_reward: miner,
        foundation_reward: foundation
      };
    });

    res.json(data);
  } catch (err) {
    log(`Error in /reward-breakdown: ${err.message}`, "error");
    res.status(503).json({ 
      error: "Service temporarily unavailable",
      message: "Unable to fetch reward breakdown"
    });
  }
});

/**
 * GET /health
 * Health check endpoint
 */
app.get("/health", async (req, res) => {
  try {
    // Quick RPC check to verify connectivity
    await rpc("getblockcount");
    res.json({ 
      status: "ok",
      timestamp: new Date().toISOString(),
      cache_age_ms: Date.now() - Cache.updated
    });
  } catch (err) {
    log(`Health check failed: ${err.message}`, "error");
    res.status(503).json({ 
      status: "degraded",
      error: "RPC connection failed",
      timestamp: new Date().toISOString()
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  log(`Unhandled error: ${err.message}`, "error");
  res.status(500).json({ 
    error: "Internal server error",
    message: "An unexpected error occurred"
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: "Not found",
    message: `Endpoint ${req.path} not found`
  });
});

// Start server
app.listen(PORT, () => {
  log(`Meowcoin API server started on port ${PORT}`);
  console.log(`Meowcoin API running on port ${PORT}`);
});

