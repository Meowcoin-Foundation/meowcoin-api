import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
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

// Swagger/OpenAPI configuration
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Meowcoin Public API",
      version: "1.0.0",
      description: "A production-ready REST API service for querying Meowcoin blockchain data including supply metrics, block rewards, mining information, and network statistics.",
      contact: {
        name: "Meowcoin Foundation",
      },
      license: {
        name: "MIT",
      },
    },
    servers: [
      {
        url: "https://api.mewccrypto.com",
        description: "Production server",
      },
      {
        url: `http://localhost:${PORT}`,
        description: "Local development server",
      },
    ],
    tags: [
      {
        name: "Supply",
        description: "Supply-related endpoints",
      },
      {
        name: "Rewards",
        description: "Block reward and subsidy endpoints",
      },
      {
        name: "Mining",
        description: "Mining statistics and network information",
      },
      {
        name: "Health",
        description: "Health check endpoints",
      },
    ],
  },
  apis: ["./server.js"], // Path to the API files
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Swagger UI endpoint
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: ".swagger-ui .topbar { display: none }",
  customSiteTitle: "Meowcoin API Documentation",
}));

// Swagger JSON endpoint
app.get("/docs.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

// CORS middleware - allow all origins for public API
app.use(cors({
  origin: "*",
  methods: ["GET", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false
}));

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
 * @swagger
 * /total-supply:
 *   get:
 *     summary: Get total supply
 *     description: Returns the current total supply of Meowcoin based on the UTXO set
 *     tags: [Supply]
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_supply:
 *                   type: number
 *                   example: 8361822924.945867
 *                   description: Total supply in MEWC
 *       503:
 *         description: Service temporarily unavailable
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 message:
 *                   type: string
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
 * @swagger
 * /circulating-supply:
 *   get:
 *     summary: Get circulating supply
 *     description: Returns the current circulating supply of Meowcoin. Meowcoin has no premine or locked team allocation, so circulating supply equals mined supply minus burns.
 *     tags: [Supply]
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 circulating_supply:
 *                   type: number
 *                   example: 8361822924.945867
 *                   description: Circulating supply in MEWC
 *       503:
 *         description: Service temporarily unavailable
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
 * @swagger
 * /block-reward:
 *   get:
 *     summary: Get current block reward
 *     description: Returns the current block subsidy and reward split (60% miner, 40% foundation). Uses consensus-derived subsidy calculation.
 *     tags: [Rewards]
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 height:
 *                   type: integer
 *                   example: 1672942
 *                 block_reward:
 *                   type: number
 *                   example: 5000
 *                   description: Total block subsidy in MEWC
 *                 miner_reward:
 *                   type: number
 *                   example: 3000
 *                   description: Miner reward (60%) in MEWC
 *                 foundation_reward:
 *                   type: number
 *                   example: 2000
 *                   description: Foundation reward (40%) in MEWC
 *       503:
 *         description: Service temporarily unavailable
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
 * @swagger
 * /reward-breakdown:
 *   get:
 *     summary: Get detailed reward breakdown
 *     description: Returns detailed reward breakdown with percentages for the current block
 *     tags: [Rewards]
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 height:
 *                   type: integer
 *                   example: 1672942
 *                 subsidy_total:
 *                   type: number
 *                   example: 5000
 *                 miner_percentage:
 *                   type: integer
 *                   example: 60
 *                 foundation_percentage:
 *                   type: integer
 *                   example: 40
 *                 miner_reward:
 *                   type: number
 *                   example: 3000
 *                 foundation_reward:
 *                   type: number
 *                   example: 2000
 *       503:
 *         description: Service temporarily unavailable
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
 * Detect algorithm from block version using bitmasking
 * @param {number} version - Block version number
 * @returns {string} "meowpow", "scrypt", or "unknown"
 */
function detectAlgo(version) {
  const MASK = 0xFFFFFF00;
  const MPW = 0x30090000; // MeowPow
  const SCR = 0x30090100; // Scrypt
  
  if ((version & MASK) === MPW) return "meowpow";
  if ((version & MASK) === SCR) return "scrypt";
  return "unknown";
}

/**
 * Calculate average block time and block counts per algorithm
 * @param {Array} blocks - Array of block objects with time and version
 * @param {number} windowMinutes - Time window in minutes
 * @returns {Object} Statistics per algorithm
 */
function calculateBlockStats(blocks, windowMinutes) {
  const now = Math.floor(Date.now() / 1000);
  const windowSeconds = windowMinutes * 60;
  
  // Filter blocks within time window
  const windowBlocks = blocks.filter(b => 
    b.time && (now - b.time) <= windowSeconds
  );
  
  // Separate blocks by algorithm
  const meowpowBlocks = [];
  const scryptBlocks = [];
  
  windowBlocks.forEach(block => {
    const algo = detectAlgo(block.version);
    if (algo === "meowpow") {
      meowpowBlocks.push(block);
    } else if (algo === "scrypt") {
      scryptBlocks.push(block);
    }
  });
  
  // Sort by time (oldest first)
  meowpowBlocks.sort((a, b) => a.time - b.time);
  scryptBlocks.sort((a, b) => a.time - b.time);
  
  // Calculate average block time per algorithm
  function calculateAvgBlockTime(algoBlocks) {
    if (algoBlocks.length < 2) return null;
    
    const spacings = [];
    for (let i = 1; i < algoBlocks.length; i++) {
      const spacing = algoBlocks[i].time - algoBlocks[i - 1].time;
      // Filter out unreasonable values (0 to 1 hour)
      if (spacing > 0 && spacing <= 3600) {
        spacings.push(spacing);
      }
    }
    
    if (spacings.length === 0) return null;
    return spacings.reduce((a, b) => a + b, 0) / spacings.length;
  }
  
  const meowpowAvgTime = calculateAvgBlockTime(meowpowBlocks);
  const scryptAvgTime = calculateAvgBlockTime(scryptBlocks);
  
  return {
    meowpow: {
      blocks_found: meowpowBlocks.length,
      avg_block_time: meowpowAvgTime ? Math.round(meowpowAvgTime) : null
    },
    scrypt: {
      blocks_found: scryptBlocks.length,
      avg_block_time: scryptAvgTime ? Math.round(scryptAvgTime) : null
    }
  };
}

/**
 * @swagger
 * /mining-info:
 *   get:
 *     summary: Get mining information
 *     description: Returns mining information including block height, difficulty, network hash rate, average block time, and block counts for both MeowPow and Scrypt algorithms. Analyzes blocks from the last 60 minutes.
 *     tags: [Mining]
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 block_height:
 *                   type: integer
 *                   example: 1672942
 *                 window_minutes:
 *                   type: integer
 *                   example: 60
 *                   description: Time window analyzed in minutes
 *                 meowpow:
 *                   type: object
 *                   properties:
 *                     difficulty:
 *                       type: number
 *                       example: 695.79
 *                     hashrate:
 *                       type: number
 *                       example: 16520849211.44
 *                     blocks_found:
 *                       type: integer
 *                       example: 22
 *                       description: Number of MeowPow blocks found in the window
 *                     avg_block_time:
 *                       type: integer
 *                       nullable: true
 *                       example: 125
 *                       description: Average time between MeowPow blocks in seconds
 *                 scrypt:
 *                   type: object
 *                   properties:
 *                     difficulty:
 *                       type: number
 *                       example: 5917.16
 *                     hashrate:
 *                       type: number
 *                       example: 338176091462.52
 *                     blocks_found:
 *                       type: integer
 *                       example: 19
 *                       description: Number of Scrypt blocks found in the window
 *                     avg_block_time:
 *                       type: integer
 *                       nullable: true
 *                       example: 181
 *                       description: Average time between Scrypt blocks in seconds
 *       503:
 *         description: Service temporarily unavailable
 */
app.get("/mining-info", async (req, res) => {
  try {
    const windowMinutes = 60;
    const blocksToFetch = 576; // ~1 min blocks, covers 60 min window
    
    const data = await cachedFetch("mining_info", async () => {
      // Get block height
      const blockHeight = await rpc("getblockcount");
      
      // Get difficulty for both algorithms
      const meowpowDifficulty = await rpc("getdifficulty 0");
      const scryptDifficulty = await rpc("getdifficulty 1");
      
      // Get network hash rate for both algorithms
      const meowpowHashrate = await rpc("getnetworkhashps 0 -1 0");
      const scryptHashrate = await rpc("getnetworkhashps 0 -1 1");

      // Fetch recent blocks for block time analysis
      const blocks = [];
      const startHeight = Math.max(0, blockHeight - blocksToFetch + 1);
      
      for (let height = startHeight; height <= blockHeight; height++) {
        try {
          const hash = await rpc(`getblockhash ${height}`);
          const block = await rpc(`getblock ${hash} 1`);
          
          if (block && block.time && block.version !== undefined) {
            blocks.push({
              height: height,
              time: block.time,
              version: block.version
            });
          }
        } catch (err) {
          // Skip blocks that fail to fetch
          log(`Failed to fetch block ${height}: ${err.message}`, "warn");
        }
      }
      
      // Calculate block statistics
      const blockStats = calculateBlockStats(blocks, windowMinutes);

      return {
        block_height: blockHeight,
        window_minutes: windowMinutes,
        meowpow: {
          difficulty: meowpowDifficulty,
          hashrate: meowpowHashrate,
          blocks_found: blockStats.meowpow.blocks_found,
          avg_block_time: blockStats.meowpow.avg_block_time
        },
        scrypt: {
          difficulty: scryptDifficulty,
          hashrate: scryptHashrate,
          blocks_found: blockStats.scrypt.blocks_found,
          avg_block_time: blockStats.scrypt.avg_block_time
        }
      };
    });

    res.json(data);
  } catch (err) {
    log(`Error in /mining-info: ${err.message}`, "error");
    res.status(503).json({ 
      error: "Service temporarily unavailable",
      message: "Unable to fetch mining information"
    });
  }
});

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     description: Returns API health status and RPC connectivity information
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ok"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: "2024-01-01T00:00:00.000Z"
 *                 cache_age_ms:
 *                   type: integer
 *                   example: 12345
 *                   description: Age of cache in milliseconds
 *       503:
 *         description: Service is degraded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "degraded"
 *                 error:
 *                   type: string
 *                   example: "RPC connection failed"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
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

