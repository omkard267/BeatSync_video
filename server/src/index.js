const cors = require('cors');
const express = require('express');
const mongoose = require('mongoose');
const morgan = require('morgan');

const projectsRouter = require('./routes/projects');
const rendersRouter = require('./routes/renders');
const renderQueue = require('./renderQueue');

require('dotenv').config();

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/video_editor';

async function start() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(MONGO_URI);
  console.log('Mongo connected');

  const app = express();

  app.use(cors());
  app.options('*', cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(morgan('dev'));

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.use('/api/projects', projectsRouter);
  app.use('/api/renders', rendersRouter);

  renderQueue.start();

  app.listen(PORT, () => {
    console.log(`Server listening on ${PORT}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
