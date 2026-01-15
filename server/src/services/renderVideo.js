const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const Project = require('../models/Project');
const { initRenderDirs, rendersDir } = require('../storage');

function toFixed3(n) {
  return Number(n).toFixed(3);
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function parseBool(value) {
  if (value === true) return true;
  if (value === false) return false;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true') return true;
    if (v === 'false') return false;
  }
  return false;
}

const CURVES_PRESETS = new Set([
  'none',
  'color_negative',
  'cross_process',
  'darker',
  'increase_contrast',
  'lighter',
  'linear_contrast',
  'medium_contrast',
  'negative',
  'strong_contrast',
  'vintage',
]);

function buildEffectsChain(effects) {
  const e = effects && typeof effects === 'object' ? effects : {};

  const brightness = clampNumber(e.brightness, -1, 1, 0);
  const contrast = clampNumber(e.contrast, 0, 4, 1);
  const saturation = clampNumber(e.saturation, 0, 4, 1);
  const hue = clampNumber(e.hue, -180, 180, 0);
  const vignette = parseBool(e.vignette);
  const noise = clampNumber(e.noise, 0, 100, 0);
  const sharpen = clampNumber(e.sharpen, 0, 5, 0);

  const curvesRaw = typeof e.curves === 'string' ? e.curves.trim() : 'none';
  const curves = CURVES_PRESETS.has(curvesRaw) ? curvesRaw : 'none';

  const filters = [];

  const needsEq =
    Math.abs(brightness) > 1e-4 || Math.abs(contrast - 1) > 1e-4 || Math.abs(saturation - 1) > 1e-4;
  if (needsEq) {
    filters.push(
      `eq=brightness=${toFixed3(brightness)}:contrast=${toFixed3(contrast)}:saturation=${toFixed3(saturation)}`
    );
  }

  if (Math.abs(hue) > 1e-4) {
    filters.push(`hue=h=${toFixed3(hue)}`);
  }

  if (curves !== 'none') {
    filters.push(`curves=preset=${curves}`);
  }

  if (vignette) {
    filters.push('vignette');
  }

  if (noise >= 1) {
    filters.push(`noise=alls=${Math.round(noise)}:allf=t+u`);
  }

  if (sharpen > 1e-3) {
    filters.push(`unsharp=lx=5:ly=5:la=${toFixed3(sharpen)}`);
  }

  return filters.join(',');
}

function cleanCutTimes(cutTimes, audioDuration) {
  const src = Array.isArray(cutTimes) ? cutTimes : [];

  const times = src
    .map((t) => Number(t))
    .filter((t) => Number.isFinite(t))
    .filter((t) => t >= 0 && t <= audioDuration)
    .sort((a, b) => a - b);

  const deduped = [];
  for (const t of times) {
    const prev = deduped[deduped.length - 1];
    if (prev === undefined || Math.abs(t - prev) > 1e-4) deduped.push(t);
  }

  if (deduped.length === 0 || deduped[0] !== 0) deduped.unshift(0);

  const last = deduped[deduped.length - 1];
  if (last === undefined || Math.abs(last - audioDuration) > 1e-3) deduped.push(audioDuration);

  const cleaned = [];
  for (const t of deduped) {
    const prev = cleaned[cleaned.length - 1];
    if (prev === undefined || t - prev >= 0.05) cleaned.push(t);
  }

  if (cleaned.length < 2) throw new Error('cutTimes are invalid');

  const a = cleaned[cleaned.length - 2];
  const b = cleaned[cleaned.length - 1];
  if (b - a < 0.05) cleaned[cleaned.length - 1] = a + 0.05;

  return cleaned;
}

function durationsFromCutTimes(cutTimes) {
  const out = [];
  for (let i = 0; i < cutTimes.length - 1; i++) out.push(cutTimes[i + 1] - cutTimes[i]);
  return out;
}

const XFADE_TRANSITIONS = [
  'fade',
  'wipeleft',
  'wiperight',
  'wipeup',
  'wipedown',
  'slideleft',
  'slideright',
  'slideup',
  'slidedown',
  'circlecrop',
  'rectcrop',
  'distance',
  'fadeblack',
  'fadewhite',
  'radial',
  'smoothleft',
  'smoothright',
  'smoothup',
  'smoothdown',
  'circleopen',
  'circleclose',
  'vertopen',
  'vertclose',
  'horzopen',
  'horzclose',
  'dissolve',
  'pixelize',
  'diagtl',
  'diagtr',
  'diagbl',
  'diagbr',
  'hlslice',
  'hrslice',
  'vuslice',
  'vdslice',
  'hblur',
  'fadegrays',
  'wipetl',
  'wipetr',
  'wipebl',
  'wipebr',
  'squeezeh',
  'squeezev',
  'zoomin',
  'fadefast',
  'fadeslow',
  'hlwind',
  'hrwind',
  'vuwind',
  'vdwind',
  'coverleft',
  'coverright',
  'coverup',
  'coverdown',
  'revealleft',
  'revealright',
  'revealup',
  'revealdown',
];

function hashToUint32(s) {
  const str = String(s ?? '');
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed) {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

function transitionSequence(spec, count, seed) {
  if (!Number.isFinite(Number(count)) || count <= 0) return [];

  if (Array.isArray(spec)) {
    const cleaned = spec
      .map((t) => String(t))
      .map((t) => t.trim())
      .filter(Boolean)
      .filter((t) => XFADE_TRANSITIONS.includes(t));

    if (cleaned.length > 0) {
      const out = cleaned.slice(0, count);
      while (out.length < count) out.push(cleaned[out.length % cleaned.length]);
      return out;
    }

    spec = 'fade';
  }

  const name = typeof spec === 'string' ? spec.trim() : '';
  if (!name) return Array.from({ length: count }, () => 'fade');

  if (name === 'random' || name === 'random_fancy') {
    const pool =
      name === 'random_fancy' ? XFADE_TRANSITIONS.filter((t) => t !== 'fade') : XFADE_TRANSITIONS;
    const rng = makeRng(hashToUint32(seed));

    const out = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(rng() * pool.length);
      out.push(pool[Math.max(0, Math.min(pool.length - 1, idx))]);
    }
    return out;
  }

  if (XFADE_TRANSITIONS.includes(name)) return Array.from({ length: count }, () => name);
  return Array.from({ length: count }, () => 'fade');
}

function computeTransitionDurations(displayDurations, maxDur) {
  const out = [];
  for (let i = 0; i < displayDurations.length - 1; i++) {
    const d0 = displayDurations[i];
    const d1 = displayDurations[i + 1];
    const d = Math.min(maxDur, d0 * 0.5, d1 * 0.5);
    out.push(Math.max(0.05, d));
  }
  return out;
}

function concatQuotedPath(p) {
  const s = String(p);
  return `'${s.replace(/'/g, "\\'")}'`;
}

function buildConcatListFileContents(items) {
  const lines = ['ffconcat version 1.0'];

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    lines.push(`file ${concatQuotedPath(it.path)}`);

    const d = Number(it.len);
    lines.push(`duration ${Number.isFinite(d) ? toFixed3(d) : '1.000'}`);
  }

  if (items.length > 0) {
    const last = items[items.length - 1];
    lines.push(`file ${concatQuotedPath(last.path)}`);
  }

  return `${lines.join('\n')}\n`;
}

function spawnFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const bin = process.env.FFMPEG_PATH || 'ffmpeg';
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 20000) stderr = stderr.slice(-20000);
    });

    proc.on('error', (err) => {
      if (err?.code === 'ENOENT') {
        return reject(
          new Error(
            `Cannot find FFmpeg executable (${bin}). Install FFmpeg and ensure it is available on PATH, or set FFMPEG_PATH to the full path of the ffmpeg binary.`
          )
        );
      }
      reject(err);
    });
    proc.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg failed (code ${code})\n${stderr}`));
    });
  });
}

async function renderVideo(renderDoc) {
  initRenderDirs();

  const project = await Project.findById(renderDoc.projectId);
  if (!project) throw new Error('Project not found');
  if (!project.audio) throw new Error('Project has no audio');
  if (!Array.isArray(project.images) || project.images.length === 0) {
    throw new Error('Project has no images');
  }

  const config = renderDoc.config ?? {};

  const audioDuration = Number(config.audioDuration);
  if (!Number.isFinite(audioDuration) || audioDuration <= 0) {
    throw new Error('audioDuration is required');
  }

  const width = Number.isFinite(Number(config.width)) ? Number(config.width) : 1920;
  const height = Number.isFinite(Number(config.height)) ? Number(config.height) : 1080;
  const fps = Number.isFinite(Number(config.fps)) ? Number(config.fps) : 30;

  const transitionSpec = config.transition;
  const transitionMaxDuration = Number.isFinite(Number(config.transitionMaxDuration))
    ? Number(config.transitionMaxDuration)
    : 0.35;

  const effectsChain = buildEffectsChain(config.effects);

  const cutTimes = cleanCutTimes(config.cutTimes, audioDuration);
  const displayDurations = durationsFromCutTimes(cutTimes);
  const segments = displayDurations.length;

  if (segments > 300) {
    throw new Error('Too many segments. Increase beatsPerImage or reduce cutTimes.');
  }

  const transitions = computeTransitionDurations(displayDurations, transitionMaxDuration);
  const transitionNames = segments > 1 ? transitionSequence(transitionSpec, segments - 1, renderDoc._id) : [];

  const imageInputs = [];
  for (let i = 0; i < segments; i++) {
    const img = project.images[i % project.images.length];
    const extra = i < segments - 1 ? transitions[i] : 0;
    imageInputs.push({ path: img.path, len: displayDurations[i] + extra });
  }

  const outputPath = path.join(rendersDir(), `${renderDoc._id}.mp4`);
  if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

  const totalMem = Number(os.totalmem());
  const isSmallMemInstance = Number.isFinite(totalMem) ? totalMem < 1024 * 1024 * 1024 : false;

  const useLowMemConcat = parseBool(process.env.LOW_MEM_RENDER) || isSmallMemInstance || segments > 30;
  if (useLowMemConcat) {
    const concatItems = [];
    for (let i = 0; i < segments; i++) {
      const img = project.images[i % project.images.length];
      concatItems.push({ path: img.path, len: displayDurations[i] });
    }

    const listPath = path.join(rendersDir(), `${renderDoc._id}.ffconcat`);
    fs.writeFileSync(listPath, buildConcatListFileContents(concatItems));

    const filter = [
      `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
      `fps=${fps}`,
      effectsChain,
      'format=yuv420p',
      'setsar=1',
    ]
      .filter(Boolean)
      .join(',');

    const args = ['-y'];
    args.push('-f', 'concat', '-safe', '0', '-i', listPath);
    args.push('-i', project.audio.path);
    args.push('-vf', filter);
    args.push('-map', '0:v:0');
    args.push('-map', '1:a:0');
    args.push('-c:v', 'libx264');
    args.push('-preset', 'veryfast');
    args.push('-crf', '18');
    args.push('-c:a', 'aac');
    args.push('-b:a', '192k');
    args.push('-pix_fmt', 'yuv420p');
    args.push('-movflags', '+faststart');
    args.push('-shortest');
    args.push(outputPath);

    await spawnFfmpeg(args);
    return outputPath;
  }

  const args = ['-y'];

  for (const inp of imageInputs) {
    args.push('-loop', '1', '-t', toFixed3(inp.len), '-i', inp.path);
  }

  args.push('-i', project.audio.path);

  const parts = [];

  for (let i = 0; i < segments; i++) {
    parts.push(
      `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=${fps},format=rgba,setsar=1,setpts=PTS-STARTPTS[v${i}]`
    );
  }

  if (segments === 1) {
    const tail = effectsChain ? `${effectsChain},format=yuv420p[vout]` : 'format=yuv420p[vout]';
    parts.push(`[v0]${tail}`);
  } else {
    parts.push(
      `[v0][v1]xfade=transition=${transitionNames[0]}:duration=${toFixed3(
        transitions[0]
      )}:offset=${toFixed3(cutTimes[1])},format=rgba[x1]`
    );

    for (let i = 1; i < segments - 1; i++) {
      parts.push(
        `[x${i}][v${i + 1}]xfade=transition=${transitionNames[i]}:duration=${toFixed3(
          transitions[i]
        )}:offset=${toFixed3(cutTimes[i + 1])},format=rgba[x${i + 1}]`
      );
    }

    const tail = effectsChain ? `${effectsChain},format=yuv420p[vout]` : 'format=yuv420p[vout]';
    parts.push(`[x${segments - 1}]${tail}`);
  }

  const filterComplex = parts
    .map((p) => String(p).trim())
    .filter(Boolean)
    .join(';');

  args.push('-filter_complex', filterComplex);
  args.push('-map', '[vout]');
  args.push('-map', `${segments}:a:0`);
  args.push('-c:v', 'libx264');
  args.push('-preset', 'veryfast');
  args.push('-crf', '18');
  args.push('-c:a', 'aac');
  args.push('-b:a', '192k');
  args.push('-pix_fmt', 'yuv420p');
  args.push('-movflags', '+faststart');
  args.push('-shortest');
  args.push(outputPath);

  await spawnFfmpeg(args);
  return outputPath;
}

module.exports = { renderVideo };
