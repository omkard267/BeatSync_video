const express = require('express');
const fs = require('fs');

const Project = require('../models/Project');
const Render = require('../models/Render');
const renderQueue = require('../renderQueue');

const router = express.Router();

router.post('/', async (req, res) => {
  const projectId = req.body?.projectId;
  const config = req.body?.config ?? {};

  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json({ error: 'projectId is required' });
  }

  const project = await Project.findById(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const render = await Render.create({ projectId, config, status: 'queued', progress: 0 });
  renderQueue.enqueue(render._id);

  res.json(render);
});

router.get('/:id', async (req, res) => {
  const render = await Render.findById(req.params.id);
  if (!render) return res.status(404).json({ error: 'Render not found' });
  res.json(render);
});

router.get('/:id/download', async (req, res) => {
  const render = await Render.findById(req.params.id);
  if (!render) return res.status(404).json({ error: 'Render not found' });
  if (render.status !== 'done' || !render.outputPath) {
    return res.status(400).json({ error: 'Render not ready' });
  }
  if (!fs.existsSync(render.outputPath)) {
    return res.status(404).json({ error: 'Output file missing' });
  }

  res.download(render.outputPath);
});

module.exports = router;
