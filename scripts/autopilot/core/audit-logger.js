import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { autopilotConfig } from './config.js';

// Sensitive key patterns that must never be recorded into logs
const SENSITIVE_KEY_REGEX = /key|secret|token|password|auth|credential|api_key|private/i;

/**
 * Recursively sanitize an object or value to prevent leaking credentials or secrets.
 * @param {any} data
 * @returns {any}
 */
export function sanitizeData(data) {
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    // Redact Bearer tokens or long base64/hex-like keys if accidentally passed
    if (/bearer\s+[a-zA-Z0-9_\-\.]{20,}/i.test(data)) {
      return data.replace(/bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi, 'Bearer [REDACTED]');
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeData(item));
  }

  if (typeof data === 'object') {
    const cleaned = {};
    for (const [key, value] of Object.entries(data)) {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        cleaned[key] = '[REDACTED]';
      } else {
        cleaned[key] = sanitizeData(value);
      }
    }
    return cleaned;
  }

  return data;
}

/**
 * Reads existing audit log entries from data/autopilot-log.json
 * @returns {Array<object>}
 */
export function readLogs() {
  const logFile = autopilotConfig.paths.auditLogFile;
  if (!fs.existsSync(logFile)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(logFile, 'utf-8');
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error(`[AuditLogger] Warning: Could not read existing log file (${err.message}). Starting fresh.`);
    return [];
  }
}

/**
 * Appends a structured audit entry to data/autopilot-log.json
 * @param {{
 *   action: string,
 *   status: 'SUCCESS' | 'WARNING' | 'ERROR' | 'INFO',
 *   summary: string,
 *   details?: any,
 *   stats?: Record<string, any>
 * }} entry
 * @returns {object} The appended log record
 */
export function logEvent({ action, status = 'INFO', summary, details = null, stats = null }) {
  const logFile = autopilotConfig.paths.auditLogFile;
  const logDir = path.dirname(logFile);

  // Ensure data directory exists
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const logs = readLogs();

  const record = {
    id: `log-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    timestamp: new Date().toISOString(),
    action,
    status,
    summary,
    stats: sanitizeData(stats),
    details: sanitizeData(details),
  };

  logs.push(record);

  // Keep recent 200 events to prevent unbounded file growth
  const trimmed = logs.slice(-200);

  fs.writeFileSync(logFile, JSON.stringify(trimmed, null, 2), 'utf-8');
  return record;
}

export default {
  logEvent,
  readLogs,
  sanitizeData,
};
