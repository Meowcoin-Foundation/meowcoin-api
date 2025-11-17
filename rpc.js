import dotenv from "dotenv";

dotenv.config();

const RPC_HOST = process.env.RPC_HOST || "127.0.0.1";
const RPC_PORT = process.env.RPC_PORT || 8332;
const RPC_USER = process.env.RPC_USER;
const RPC_PASS = process.env.RPC_PASS;

const RPC_URL = `http://${RPC_HOST}:${RPC_PORT}`;

/**
 * Parse command string into method and params
 * Examples:
 *   "gettxoutsetinfo" -> { method: "gettxoutsetinfo", params: [] }
 *   "getblockchaininfo" -> { method: "getblockchaininfo", params: [] }
 */
function parseCommand(cmd) {
  const parts = cmd.trim().split(/\s+/);
  const method = parts[0];
  const params = parts.slice(1).map(p => {
    // Try to parse as number, otherwise keep as string
    const num = Number(p);
    return isNaN(num) ? p : num;
  });
  return { method, params };
}

/**
 * Execute a JSON-RPC call to Meowcoin Core
 * @param {string} cmd - RPC command (e.g., "gettxoutsetinfo")
 * @returns {Promise<any>} Parsed JSON result
 * @throws {Error} If RPC call fails
 */
export async function rpc(cmd) {
  if (!RPC_USER || !RPC_PASS) {
    throw new Error("RPC_USER and RPC_PASS must be set in environment variables");
  }

  const { method, params } = parseCommand(cmd);
  
  const auth = Buffer.from(`${RPC_USER}:${RPC_PASS}`).toString("base64");

  try {
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${auth}`
      },
      body: JSON.stringify({
        jsonrpc: "1.0",
        id: Date.now(),
        method: method,
        params: params
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Check for JSON-RPC error
    if (data.error) {
      throw new Error(`RPC error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    return data.result;
  } catch (err) {
    console.error(`RPC Error [${cmd}]:`, err.message);
    throw new Error(`RPC command failed: ${cmd} - ${err.message}`);
  }
}

