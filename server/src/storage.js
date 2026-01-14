const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '..', 'data');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function projectDir(projectId) {
  return path.join(DATA_DIR, 'projects', String(projectId));
}

function projectAudioDir(projectId) {
  return path.join(projectDir(projectId), 'audio');
}

function projectImagesDir(projectId) {
  return path.join(projectDir(projectId), 'images');
}

function rendersDir() {
  return path.join(DATA_DIR, 'renders');
}

function initProjectDirs(projectId) {
  ensureDir(projectAudioDir(projectId));
  ensureDir(projectImagesDir(projectId));
}

function initRenderDirs() {
  ensureDir(rendersDir());
}

module.exports = {
  DATA_DIR,
  ensureDir,
  projectDir,
  projectAudioDir,
  projectImagesDir,
  rendersDir,
  initProjectDirs,
  initRenderDirs,
};
