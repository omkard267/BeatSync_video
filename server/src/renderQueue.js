const Render = require('./models/Render');
const { renderVideo } = require('./services/renderVideo');

let isRunning = false;
let scheduled = false;

async function processLoop() {
  if (isRunning) return;
  isRunning = true;

  try {
    while (true) {
      const render = await Render.findOneAndUpdate(
        { status: 'queued' },
        { status: 'running', progress: 0, error: null },
        { sort: { createdAt: 1 }, new: true }
      );

      if (!render) break;

      try {
        const outputPath = await renderVideo(render);
        render.status = 'done';
        render.progress = 100;
        render.outputPath = outputPath;
        render.error = null;
      } catch (err) {
        render.status = 'failed';
        render.progress = 0;
        render.outputPath = null;
        render.error = err?.stack ? String(err.stack) : String(err);
      }

      await render.save();
    }
  } finally {
    isRunning = false;
  }
}

function kick() {
  if (scheduled) return;
  scheduled = true;

  setImmediate(() => {
    scheduled = false;
    processLoop().catch((err) => console.error(err));
  });
}

function enqueue() {
  kick();
}

function start() {
  kick();
}

module.exports = { enqueue, start };
