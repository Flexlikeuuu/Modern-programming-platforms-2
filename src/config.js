const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DB_FILE = path.join(DATA_DIR, 'game.db');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

const GRID_WIDTH = 100;
const GRID_HEIGHT = 100;
const COOLDOWN_SECONDS = 5;
const COOLDOWN_MS = COOLDOWN_SECONDS * 1000;

const mimeTypes = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

module.exports = {
  PORT,
  ROOT_DIR,
  DATA_DIR,
  DB_FILE,
  PUBLIC_DIR,
  GRID_WIDTH,
  GRID_HEIGHT,
  COOLDOWN_SECONDS,
  COOLDOWN_MS,
  mimeTypes
};

