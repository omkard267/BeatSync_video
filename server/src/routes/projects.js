const express = require('express');
const mime = require('mime-types');
const multer = require('multer');
const path = require('path');
const { nanoid } = require('nanoid');

const Project = require('../models/Project');
const {
  ensureDir,
  initProjectDirs,
  projectAudioDir,
  projectImagesDir,
} = require('../storage');

const router = express.Router();

function buildStoredFile(file) {
  return {
    originalName: file.originalname,
    filename: file.filename,
    path: file.path,
    mimeType: file.mimetype,
    size: file.size,
  };
}

function buildStorage(getDestinationDir) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = getDestinationDir(req);
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const extFromMime = mime.extension(file.mimetype);
      const ext = extFromMime ? `.${extFromMime}` : path.extname(file.originalname);
      cb(null, `${nanoid(12)}${ext}`);
    },
  });
}

const audioUpload = multer({
  storage: buildStorage((req) => projectAudioDir(req.params.id)),
});

const imagesUpload = multer({
  storage: buildStorage((req) => projectImagesDir(req.params.id)),
});

router.post('/', async (req, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title : 'Untitled';
  const project = await Project.create({ title });
  initProjectDirs(project._id);
  res.json(project);
});

router.get('/:id', async (req, res) => {
  const project = await Project.findById(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

router.post('/:id/audio', audioUpload.single('audio'), async (req, res) => {
  const project = await Project.findById(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });

  project.audio = buildStoredFile(req.file);
  await project.save();

  res.json(project);
});

router.post('/:id/images', imagesUpload.array('images', 300), async (req, res) => {
  const project = await Project.findById(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const files = Array.isArray(req.files) ? req.files : [];
  if (files.length === 0) return res.status(400).json({ error: 'No images uploaded' });

  project.images.push(...files.map(buildStoredFile));
  await project.save();

  res.json(project);
});

module.exports = router;
