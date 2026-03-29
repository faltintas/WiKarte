#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const path = require('path');

const METADATA_URL = 'https://www.geoboundaries.org/api/current/gbOpen/AUT/ADM0/';
const OUTPUT_PATH = path.join(__dirname, '..', 'austria-border.js');
const SIMPLIFY_TOLERANCE = 0;

function fetchText(url, depth = 0) {
  if (depth > 5) return Promise.reject(new Error('Too many redirects'));

  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      const { statusCode, headers } = response;
      if (statusCode >= 300 && statusCode < 400 && headers.location) {
        const nextUrl = new URL(headers.location, url).toString();
        response.resume();
        resolve(fetchText(nextUrl, depth + 1));
        return;
      }

      if (statusCode !== 200) {
        reject(new Error(`Unexpected status ${statusCode}`));
        response.resume();
        return;
      }

      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

function roundPoint([lng, lat]) {
  return [Number(lng.toFixed(6)), Number(lat.toFixed(6))];
}

function getSqSegmentDistance(point, start, end) {
  let x = start[0];
  let y = start[1];
  let dx = end[0] - x;
  let dy = end[1] - y;

  if (dx !== 0 || dy !== 0) {
    const t = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = end[0];
      y = end[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  dx = point[0] - x;
  dy = point[1] - y;
  return dx * dx + dy * dy;
}

function simplifyDouglasPeucker(points, tolerance) {
  if (points.length <= 2) return points.slice();
  if (tolerance <= 0) return points.slice();

  const sqTolerance = tolerance * tolerance;
  const kept = new Uint8Array(points.length);
  const stack = [[0, points.length - 1]];
  kept[0] = 1;
  kept[points.length - 1] = 1;

  while (stack.length) {
    const [first, last] = stack.pop();
    let maxSqDistance = sqTolerance;
    let index = -1;

    for (let i = first + 1; i < last; i += 1) {
      const sqDistance = getSqSegmentDistance(points[i], points[first], points[last]);
      if (sqDistance > maxSqDistance) {
        index = i;
        maxSqDistance = sqDistance;
      }
    }

    if (index !== -1) {
      kept[index] = 1;
      if (index - first > 1) stack.push([first, index]);
      if (last - index > 1) stack.push([index, last]);
    }
  }

  const simplified = [];
  for (let i = 0; i < points.length; i += 1) {
    if (kept[i]) simplified.push(points[i]);
  }
  return simplified;
}

function dedupeSequentialPoints(points) {
  return points.filter((point, index) => {
    if (index === 0) return true;
    const prev = points[index - 1];
    return point[0] !== prev[0] || point[1] !== prev[1];
  });
}

function simplifyRing(ring) {
  if (!Array.isArray(ring) || ring.length < 4) return ring;

  const rounded = dedupeSequentialPoints(ring.map(roundPoint));
  const isClosed =
    rounded[0][0] === rounded[rounded.length - 1][0] &&
    rounded[0][1] === rounded[rounded.length - 1][1];
  const openRing = isClosed ? rounded.slice(0, -1) : rounded.slice();

  let simplified = simplifyDouglasPeucker(openRing, SIMPLIFY_TOLERANCE);
  if (simplified.length < 3) simplified = openRing.slice(0, 3);

  const closedRing = [...simplified, simplified[0]];
  if (closedRing.length < 4) return [...rounded.slice(0, 3), rounded[0]];
  return closedRing;
}

function simplifyGeometry(geometry) {
  if (!geometry?.type || !geometry?.coordinates) return geometry;

  if (geometry.type === 'Polygon') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map(simplifyRing)
    };
  }

  if (geometry.type === 'MultiPolygon') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((polygon) => polygon.map(simplifyRing))
    };
  }

  return geometry;
}

function formatOutput(feature) {
  return [
    '// Austria national border for WiKarte',
    '// Source: geoBoundaries ADM0 for Austria',
    '// License: CC BY-SA 2.0',
    '// Reference: https://www.geoboundaries.org/',
    `// Simplified locally with tolerance ${SIMPLIFY_TOLERANCE} (using geoBoundaries simplified geometry)`,
    `window.WIKARTE_AUSTRIA_BORDER = ${JSON.stringify(feature)};`,
    ''
  ].join('\n');
}

async function main() {
  const metadata = JSON.parse(await fetchText(METADATA_URL));
  if (!metadata?.simplifiedGeometryGeoJSON) {
    throw new Error('geoBoundaries metadata did not include a simplified GeoJSON download URL');
  }

  const source = JSON.parse(await fetchText(metadata.simplifiedGeometryGeoJSON));
  const austria = source.features?.[0];
  if (!austria?.geometry) throw new Error('Austria feature not found');

  const simplified = {
    type: 'Feature',
    properties: {
      name: 'Austria',
      iso3: 'AUT',
      source: metadata.boundarySource || 'geoBoundaries ADM0',
      license: metadata.boundaryLicense || 'CC BY-SA 2.0'
    },
    geometry: simplifyGeometry(austria.geometry)
  };

  fs.writeFileSync(OUTPUT_PATH, formatOutput(simplified), 'utf8');
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
