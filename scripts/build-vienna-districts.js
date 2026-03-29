#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const path = require('path');

const SOURCE_URL =
  'https://data.wien.gv.at/daten/geo?service=WFS&request=GetFeature&version=1.1.0&typeName=ogdwien:BEZIRKSGRENZEOGD&srsName=EPSG:4326&outputFormat=json';
const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'data', 'vienna-districts.js');
const SIMPLIFY_TOLERANCE = 0.00005;

function downloadJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Unexpected status ${response.statusCode}`));
        response.resume();
        return;
      }

      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

function roundPoint([lng, lat]) {
  return [Number(lng.toFixed(5)), Number(lat.toFixed(5))];
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

function formatOutput(data) {
  return [
    '// Vienna district boundaries for WiKarte',
    '// Source: Stadt Wien Open Data - Bezirksgrenzen Wien',
    '// License: CC BY 4.0',
    '// Attribution: Datenquelle: Stadt Wien - data.wien.gv.at',
    `// Simplified locally with tolerance ${SIMPLIFY_TOLERANCE}`,
    `window.WIKARTE_VIENNA_DISTRICTS = ${JSON.stringify(data)};`,
    ''
  ].join('\n');
}

async function main() {
  const source = await downloadJson(SOURCE_URL);
  const simplified = {
    type: 'FeatureCollection',
    features: source.features.map((feature) => ({
      type: 'Feature',
      properties: {
        districtNumber: String(feature.properties.BEZ),
        districtName: feature.properties.NAMEK
      },
      geometry: simplifyGeometry(feature.geometry)
    }))
  };

  fs.writeFileSync(OUTPUT_PATH, formatOutput(simplified), 'utf8');
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
