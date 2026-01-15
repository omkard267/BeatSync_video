const mongoose = require('mongoose');
const crypto = require('crypto');

function nanoid(size = 21) {
  return crypto.randomBytes(size).toString('base64url').slice(0, size);
}

const RenderSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => nanoid(12) },
    projectId: { type: String, required: true, ref: 'Project' },
    status: {
      type: String,
      enum: ['queued', 'running', 'done', 'failed'],
      default: 'queued',
    },
    progress: { type: Number, default: 0 },
    outputPath: { type: String, default: null },
    error: { type: String, default: null },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Render', RenderSchema);
