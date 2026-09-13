import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { autopilotConfig } from './config.js';

/**
 * Creates a unique, ISO-timestamped run identifier.
 * Format: run-YYYY-MM-DDTHHMMSS-mmmZ-xxxxxx
 * e.g., run-2026-09-13T023000-123Z-a1b2c3
 * 
 * @param {string} [prefix='run']
 * @returns {string}
 */
export function createRunId(prefix = 'run') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rand = crypto.randomBytes(3).toString('hex');
  return `${prefix}-${timestamp}-${rand}`;
}

/**
 * Resolves the isolated staging directory for a given run ID.
 * Ensures the target stays confined strictly within draftsDir.
 * 
 * @param {string} runId
 * @param {string} [customDraftsDir]
 * @returns {string}
 */
export function getRunDraftsDir(runId, customDraftsDir = null) {
  const baseDraftsDir = path.resolve(customDraftsDir || autopilotConfig.paths.draftsDir);
  if (!runId || typeof runId !== 'string') {
    return baseDraftsDir;
  }

  // Sanitize runId to prevent path traversal
  const cleanRunId = runId.replace(/[\/\\]/g, '-').replace(/\.\./g, '').trim();
  const runDir = path.resolve(baseDraftsDir, cleanRunId);

  // Boundary check
  const normalizedBase = path.normalize(baseDraftsDir) + path.sep;
  const normalizedRunDir = path.normalize(runDir);
  if (!normalizedRunDir.startsWith(normalizedBase) && normalizedRunDir !== path.normalize(baseDraftsDir)) {
    throw new Error(`Security violation: run directory "${runDir}" escapes drafts directory "${baseDraftsDir}"`);
  }

  return runDir;
}

/**
 * Writes or updates the run manifest file atomically.
 * Automatically saves to the central manifest location (.current-run.json)
 * and additionally inside the run's draft directory if it exists.
 * 
 * @param {object} manifestData
 * @param {string} [customManifestPath]
 * @returns {object} The saved manifest data
 */
export function writeRunManifest(manifestData, customManifestPath = null) {
  if (!manifestData || typeof manifestData !== 'object') {
    throw new Error('Manifest data must be a valid object');
  }

  const manifestPath = path.resolve(customManifestPath || autopilotConfig.paths.currentRunManifest);
  const manifestDir = path.dirname(manifestPath);

  if (!fs.existsSync(manifestDir)) {
    fs.mkdirSync(manifestDir, { recursive: true });
  }

  const serialized = JSON.stringify(manifestData, null, 2);

  // Atomic write via temp file
  const tempPath = `${manifestPath}.${Date.now()}.${crypto.randomBytes(3).toString('hex')}.tmp`;
  fs.writeFileSync(tempPath, serialized, 'utf-8');
  fs.renameSync(tempPath, manifestPath);

  // Also write into the run-specific directory if it exists
  if (manifestData.runId) {
    try {
      const runDir = getRunDraftsDir(manifestData.runId);
      if (fs.existsSync(runDir)) {
        const runSpecificManifest = path.join(runDir, 'manifest.json');
        fs.writeFileSync(runSpecificManifest, serialized, 'utf-8');
      }
    } catch (_) {
      // Non-critical mirror write failure ignored
    }
  }

  return manifestData;
}

/**
 * Reads and parses a run manifest.
 * 
 * @param {string} [customManifestPath]
 * @returns {object|null} Parsed manifest object or null if missing/invalid
 */
export function readRunManifest(customManifestPath = null) {
  const manifestPath = path.resolve(customManifestPath || autopilotConfig.paths.currentRunManifest);
  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(manifestPath, 'utf-8');
    if (!content.trim()) return null;
    return JSON.parse(content);
  } catch (err) {
    console.error(`[Manifest] Error reading manifest at "${manifestPath}": ${err.message}`);
    return null;
  }
}

/**
 * Updates an existing manifest or initializes one with the given patch.
 * 
 * @param {object} updates
 * @param {string} [customManifestPath]
 * @returns {object}
 */
export function updateRunManifest(updates, customManifestPath = null) {
  const existing = readRunManifest(customManifestPath) || {};
  const merged = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  return writeRunManifest(merged, customManifestPath);
}

/**
 * Cleans / resets the current run manifest when a new run begins.
 * 
 * @param {string} [customManifestPath]
 */
export function clearCurrentRunManifest(customManifestPath = null) {
  const manifestPath = path.resolve(customManifestPath || autopilotConfig.paths.currentRunManifest);
  if (fs.existsSync(manifestPath)) {
    try {
      fs.unlinkSync(manifestPath);
    } catch (_) {}
  }
}

export default {
  createRunId,
  getRunDraftsDir,
  writeRunManifest,
  readRunManifest,
  updateRunManifest,
  clearCurrentRunManifest,
};
