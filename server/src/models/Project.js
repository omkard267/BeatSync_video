const mongoose = require('mongoose');
const { nanoid } = require('nanoid');

const StoredFileSchema = new mongoose.Schema(
  {
    originalName: { type: String, required: true },
    filename: { type: String, required: true },
    path: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { _id: false }
);

const ProjectSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => nanoid(10) },
    title: { type: String, default: 'Untitled' },
    audio: { type: StoredFileSchema, default: null },
    images: { type: [StoredFileSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Project', ProjectSchema);
