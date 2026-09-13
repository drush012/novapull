// Maps a stream's pixel dimensions to the quality name people actually use.
//
// Raw heights are a poor label: sites ship non-standard sizes (7200x4050 is an
// 8K-class master, 3600x2026 a 4K one), and a portrait clip's height says
// nothing about its quality. So the short side is matched to the nearest
// standard tier, allowing a 10% shortfall before dropping to the tier below.
'use strict';

const TIERS = [
  [4320, '8K'],
  [2880, '5K'],
  [2160, '4K'],
  [1440, '2K'],
  [1080, '1080P'],
  [720, '720P'],
  [480, '480P'],
  [360, '360P'],
  [240, '240P'],
  [144, '144P']
];
const TOLERANCE = 0.9;

function shortSide(width, height) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (w > 0 && h > 0) return Math.min(w, h);
  return h || w || 0;
}

/** "8K" / "4K" / "1080P" … for the given dimensions, or '' when unknown. */
function qualityTier(width, height) {
  const side = shortSide(width, height);
  if (!side) return '';
  for (const [threshold, label] of TIERS) {
    if (side >= threshold * TOLERANCE) return label;
  }
  return `${side}P`;
}

/**
 * The name shown in the quality dropdown: "8K60 HDR", "4K60", "1080P".
 *
 * Everything that distinguishes one entry from another lives in the name, so
 * the list needs no trailing size or bitrate column to be readable — and the
 * caller can then drop duplicates by name alone.
 */
function qualityName({ width, height, fps, hdr } = {}) {
  const tier = qualityTier(width, height);
  if (!tier) return '';
  const rate = Math.round(Number(fps) || 0);
  // Only a above-standard frame rate is worth naming; 24/25/30 are the norm.
  return `${tier}${rate > 31 ? rate : ''}${hdr ? ' HDR' : ''}`;
}

module.exports = { qualityTier, qualityName, shortSide, TIERS };
