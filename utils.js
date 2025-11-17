import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Ensure logs directory exists
 */
export function ensureLogsDir() {
  const logsDir = path.join(__dirname, "logs");
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  return logsDir;
}

/**
 * Log a message to the API log file
 * @param {string} message - Message to log
 * @param {string} level - Log level (info, error, warn)
 */
export function log(message, level = "info") {
  const logsDir = ensureLogsDir();
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
  
  try {
    fs.appendFileSync(
      path.join(logsDir, "api.log"),
      logMessage
    );
  } catch (err) {
    console.error("Failed to write to log file:", err.message);
  }
  
  // Also log errors to error.log
  if (level === "error") {
    try {
      fs.appendFileSync(
        path.join(logsDir, "error.log"),
        logMessage
      );
    } catch (err) {
      console.error("Failed to write to error log:", err.message);
    }
  }
}

/**
 * Get log level from environment or default to 'info'
 * @returns {string} Log level
 */
export function getLogLevel() {
  return process.env.LOG_LEVEL || "info";
}

/**
 * Check if we should log at the given level
 * @param {string} level - Level to check
 * @returns {boolean} True if should log
 */
export function shouldLog(level) {
  const currentLevel = getLogLevel();
  const levels = { error: 0, warn: 1, info: 2, debug: 3 };
  return (levels[level] || 2) <= (levels[currentLevel] || 2);
}

