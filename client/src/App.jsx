import React, { useEffect, useMemo, useState } from 'react';
import MusicTempo from 'music-tempo';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
console.log('Using API_BASE:', API_BASE);

async function apiJson(path, options) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options?.headers || {}),
    },
    ...options,
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const msg = typeof data === 'string' ? data : data?.error || 'Request failed';
    throw new Error(msg);
  }

  return data;
}

function mergeToMono(audioBuffer) {
  if (audioBuffer.numberOfChannels === 1) return audioBuffer.getChannelData(0);

  const c0 = audioBuffer.getChannelData(0);
  const c1 = audioBuffer.getChannelData(1);
  const out = new Float32Array(c0.length);
  for (let i = 0; i < c0.length; i++) out[i] = (c0[i] + c1[i]) / 2;
  return out;
}

async function analyzeAudioFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const ctx = new (window.AudioContext || window.webkitAudioContext)();

  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const mono = mergeToMono(audioBuffer);
    const mt = new MusicTempo(mono);

    return {
      duration: audioBuffer.duration,
      tempo: mt.tempo,
      beats: Array.isArray(mt.beats) ? mt.beats : [],
    };
  } finally {
    try {
      await ctx.close();
    } catch {
    }
  }
}

function buildCutTimes({ beats, duration, beatsPerImage, fallbackSegments, targetSegments }) {
  const dur = Number(duration);
  if (!Number.isFinite(dur) || dur <= 0) return [0, 1];

  const bpi = Math.max(1, Math.floor(Number(beatsPerImage) || 1));
  const target = Number.isFinite(Number(targetSegments))
    ? Math.max(1, Math.min(300, Math.floor(Number(targetSegments))))
    : null;

  const srcBeats = Array.isArray(beats) ? beats : [];
  const validBeats = srcBeats
    .map((t) => Number(t))
    .filter((t) => Number.isFinite(t))
    .filter((t) => t > 0.01 && t < dur - 0.01);

  if (validBeats.length) {
    if (target && target > 1) {
      const out = [0];
      const needed = target - 1;

      if (validBeats.length >= needed) {
        for (let i = 1; i < target; i++) {
          const idx = Math.floor((i * validBeats.length) / target);
          out.push(validBeats[Math.max(0, Math.min(validBeats.length - 1, idx))]);
        }
      } else {
        for (let i = 1; i < target; i++) out.push((i * dur) / target);
      }

      out.push(dur);
      return Array.from(new Set(out.map((t) => Number(t.toFixed(4))))).sort((a, b) => a - b);
    }

    if (validBeats.length > bpi + 2) {
      const out = [0];

      for (let i = bpi; i < validBeats.length; i += bpi) out.push(validBeats[i]);

      out.push(dur);
      return Array.from(new Set(out.map((t) => Number(t.toFixed(4))))).sort((a, b) => a - b);
    }
  }

  const segs = Math.max(1, Math.min(300, Math.floor(fallbackSegments || 30)));
  const out = [];
  for (let i = 0; i <= segs; i++) out.push((i * dur) / segs);
  return out;
}

function formatSeconds(s) {
  const n = Number(s);
  if (!Number.isFinite(n)) return '-';
  const m = Math.floor(n / 60);
  const r = Math.floor(n % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

function classNames(...xs) {
  return xs.filter(Boolean).join(' ');
}

function transitionNote(t) {
  const name = String(t || '').trim();
  if (!name) return '';

  if (name === 'random_fancy') return 'Different transition on every cut (no fade)';
  if (name === 'random') return 'Different transition on every cut';
  if (name === 'fade') return 'Smooth crossfade';
  if (name === 'fadeblack') return 'Fade through black';
  if (name === 'fadewhite') return 'Fade through white';
  if (name === 'fadegrays') return 'Fade through grayscale';
  if (name === 'fadefast') return 'Fast fade';
  if (name === 'fadeslow') return 'Slow fade';
  if (name === 'dissolve') return 'Film-like dissolve';
  if (name === 'pixelize') return 'Pixelated mosaic blocks';
  if (name === 'zoomin') return 'Zoom into the next image';
  if (name === 'hblur') return 'Blur swipe';
  if (name === 'radial') return 'Radial sweep';
  if (name === 'distance') return 'Depth warp';

  if (name === 'circleopen') return 'Iris open';
  if (name === 'circleclose') return 'Iris close';
  if (name.startsWith('circle')) return 'Circle-based transition';
  if (name === 'rectcrop') return 'Rectangular crop';
  if (name === 'circlecrop') return 'Circular crop';
  if (name.endsWith('crop')) return 'Crop transition';

  if (name.startsWith('slide')) return 'Slide transition';
  if (name.startsWith('smooth')) return 'Smooth slide';
  if (name.startsWith('diag')) return 'Diagonal wipe';
  if (name === 'wipetl' || name === 'wipetr' || name === 'wipebl' || name === 'wipebr') return 'Corner wipe';
  if (name.startsWith('wipe')) return 'Wipe transition';

  if (name.endsWith('slice')) return 'Slice effect';
  if (name.endsWith('wind')) return 'Wind streaks';
  if (name.startsWith('squeeze')) return 'Squeeze';
  if (name.startsWith('cover')) return 'Cover the next image';
  if (name.startsWith('reveal')) return 'Reveal the next image';
  if (name.startsWith('vert')) return 'Vertical open/close';
  if (name.startsWith('horz')) return 'Horizontal open/close';

  return 'Transition';
}

const EFFECT_PRESETS = {
  none: {
    brightness: 0,
    contrast: 1,
    saturation: 1,
    hue: 0,
    vignette: false,
    noise: 0,
    sharpen: 0,
    curves: 'none',
  },
  cinematic: {
    brightness: 0.02,
    contrast: 1.15,
    saturation: 1.1,
    hue: 0,
    vignette: true,
    noise: 0,
    sharpen: 0.4,
    curves: 'medium_contrast',
  },
  vintage: {
    brightness: 0.02,
    contrast: 1.05,
    saturation: 0.95,
    hue: 0,
    vignette: true,
    noise: 3,
    sharpen: 0.2,
    curves: 'vintage',
  },
  bw: {
    brightness: 0,
    contrast: 1.15,
    saturation: 0,
    hue: 0,
    vignette: false,
    noise: 0,
    sharpen: 0,
    curves: 'none',
  },
  punchy: {
    brightness: 0,
    contrast: 1.3,
    saturation: 1.4,
    hue: 0,
    vignette: false,
    noise: 0,
    sharpen: 0.6,
    curves: 'strong_contrast',
  },
  dreamy: {
    brightness: 0.04,
    contrast: 0.9,
    saturation: 1.05,
    hue: 0,
    vignette: false,
    noise: 0,
    sharpen: 0,
    curves: 'lighter',
  },
};

function effectPresetValues(name) {
  const key = typeof name === 'string' ? name.trim() : '';
  return EFFECT_PRESETS[key] || EFFECT_PRESETS.none;
}

const EFFECT_PRESET_NOTES = {
  none: 'No color changes (original look).',
  cinematic: 'Higher contrast + subtle sharpen. Great for a clean "pro" look.',
  vintage: 'Film-like look with vignette + grain.',
  bw: 'Black & white (saturation = 0).',
  punchy: 'Strong contrast + high saturation (sports / dance).',
  dreamy: 'Soft + brighter look (romantic / chill).',
  custom: 'Custom settings (you tweaked the sliders).',
};

function effectPresetNote(name) {
  const key = typeof name === 'string' ? name.trim() : '';
  return EFFECT_PRESET_NOTES[key] || '';
}

const TRANSITION_QUICK_PICKS = [
  { label: 'Smooth', value: 'fade' },
  { label: 'Fast', value: 'fadefast' },
  { label: 'Film', value: 'dissolve' },
  { label: 'Zoom', value: 'zoomin' },
  { label: 'Surprise', value: 'random_fancy' },
];

export default function App() {
  const [title, setTitle] = useState('BeatSync Edit');
  const [audioFile, setAudioFile] = useState(null);
  const [imageFiles, setImageFiles] = useState([]);

  const [analysis, setAnalysis] = useState(null);
  const [beatsPerImage, setBeatsPerImage] = useState(4);
  const [fitBeatsToImages, setFitBeatsToImages] = useState(true);
  const [transition, setTransition] = useState('fade');
  const [format, setFormat] = useState('16:9');

  const [effectsPreset, setEffectsPreset] = useState('none');
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(1);
  const [saturation, setSaturation] = useState(1);
  const [hue, setHue] = useState(0);
  const [vignette, setVignette] = useState(false);
  const [noise, setNoise] = useState(0);
  const [sharpen, setSharpen] = useState(0);
  const [curves, setCurves] = useState('none');

  function applyEffectsPreset(next) {
    const v = effectPresetValues(next);
    setEffectsPreset(next);
    setBrightness(v.brightness);
    setContrast(v.contrast);
    setSaturation(v.saturation);
    setHue(v.hue);
    setVignette(Boolean(v.vignette));
    setNoise(v.noise);
    setSharpen(v.sharpen);
    setCurves(v.curves);
  }

  function markEffectsCustom() {
    setEffectsPreset((p) => (p === 'custom' ? p : 'custom'));
  }

  function setEffectNumber(setter) {
    return (e) => {
      setter(Number(e.target.value));
      markEffectsCustom();
    };
  }

  function setEffectBool(setter) {
    return (e) => {
      setter(Boolean(e.target.checked));
      markEffectsCustom();
    };
  }

  function setEffectString(setter) {
    return (e) => {
      setter(String(e.target.value));
      markEffectsCustom();
    };
  }

  const [project, setProject] = useState(null);
  const [render, setRender] = useState(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const dims = useMemo(() => {
    if (format === '9:16') return { width: 1080, height: 1920 };
    return { width: 1920, height: 1080 };
  }, [format]);

  const cutTimes = useMemo(() => {
    if (!analysis) return null;
    return buildCutTimes({
      beats: analysis.beats,
      duration: analysis.duration,
      beatsPerImage,
      fallbackSegments: imageFiles.length || 30,
      targetSegments: fitBeatsToImages && imageFiles.length ? imageFiles.length : null,
    });
  }, [analysis, beatsPerImage, fitBeatsToImages, imageFiles.length]);

  const segments = cutTimes ? Math.max(1, cutTimes.length - 1) : 0;

  async function ensureAnalysis() {
    if (analysis) return analysis;
    if (!audioFile) throw new Error('Please select an audio file');
    const a = await analyzeAudioFile(audioFile);
    setAnalysis(a);
    return a;
  }

  async function ensureProjectAndUploads() {
    if (project?._id) return project;

    const p = await apiJson('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ title }),
    });

    if (!audioFile) throw new Error('Please select an audio file');
    if (!imageFiles.length) throw new Error('Please select at least 1 image');

    const audioFd = new FormData();
    audioFd.append('audio', audioFile);
    await apiJson(`/api/projects/${p._id}/audio`, { method: 'POST', body: audioFd });

    const imagesFd = new FormData();
    for (const f of imageFiles) imagesFd.append('images', f);
    const updated = await apiJson(`/api/projects/${p._id}/images`, { method: 'POST', body: imagesFd });

    setProject(updated);
    return updated;
  }

  async function startRender() {
    setError('');
    setBusy(true);

    try {
      const a = await ensureAnalysis();
      const p = await ensureProjectAndUploads();

      const ct = buildCutTimes({
        beats: a.beats,
        duration: a.duration,
        beatsPerImage,
        fallbackSegments: imageFiles.length || 30,
        targetSegments: fitBeatsToImages && imageFiles.length ? imageFiles.length : null,
      });

      const cfg = {
        cutTimes: ct,
        audioDuration: a.duration,
        width: dims.width,
        height: dims.height,
        fps: 30,
        transition,
        transitionMaxDuration: 0.35,
        effects: {
          preset: effectsPreset,
          brightness,
          contrast,
          saturation,
          hue,
          vignette,
          noise,
          sharpen,
          curves,
        },
      };

      const r = await apiJson('/api/renders', {
        method: 'POST',
        body: JSON.stringify({ projectId: p._id, config: cfg }),
      });

      setRender(r);
    } catch (e) {
      setError(e?.message ? String(e.message) : String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!render?._id) return;
    if (render.status === 'done' || render.status === 'failed') return;

    const t = setInterval(async () => {
      try {
        const r = await apiJson(`/api/renders/${render._id}`);
        setRender(r);
      } catch {
      }
    }, 1200);

    return () => clearInterval(t);
  }, [render?._id, render?.status]);

  const downloadUrl = render?.status === 'done' ? `${API_BASE}/api/renders/${render._id}/download` : '';

  function resetAll() {
    setProject(null);
    setRender(null);
    setAnalysis(null);
    setError('');
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-col gap-2">
          <div className="text-sm text-slate-400">MERN + FFmpeg</div>
          <h1 className="text-3xl font-semibold tracking-tight">BeatSync Video Editor</h1>
          <div className="text-slate-300">
            Upload music + images. The app detects beats and renders a video with beat-synced transitions.
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="text-lg font-medium">Inputs</div>

            <div className="mt-4 grid gap-4">
              <label className="grid gap-2">
                <div className="text-sm text-slate-300">Project title</div>
                <input
                  className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>

              <label className="grid gap-2">
                <div className="text-sm text-slate-300">Audio</div>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setAudioFile(f);
                    setProject(null);
                    setAnalysis(null);
                    setRender(null);
                    setError('');
                  }}
                />
                <div className="text-xs text-slate-400">
                  {audioFile ? `Selected: ${audioFile.name}` : 'Select an MP3/WAV file'}
                </div>
              </label>

              <label className="grid gap-2">
                <div className="text-sm text-slate-300">Images</div>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    setImageFiles(files);
                    setProject(null);
                    setRender(null);
                    setError('');
                  }}
                />
                <div className="text-xs text-slate-400">
                  {imageFiles.length ? `${imageFiles.length} image(s) selected` : 'Select multiple images'}
                </div>
              </label>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="grid gap-2 sm:col-span-2">
                <div className="text-sm text-slate-300">Image sync</div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                  <div className="text-sm text-slate-200">Use all images (fit cuts)</div>
                  <input
                    type="checkbox"
                    checked={fitBeatsToImages}
                    onChange={(e) => setFitBeatsToImages(Boolean(e.target.checked))}
                    className="h-4 w-4 accent-indigo-500"
                  />
                </div>
                <div className="text-xs text-slate-400">
                  When enabled, the video will use each uploaded image once and choose beat-aligned cut points.
                </div>
              </label>

              <label className="grid gap-2">
                <div className="text-sm text-slate-300">Beats per image</div>
                <input
                  type="number"
                  min={1}
                  max={32}
                  value={beatsPerImage}
                  onChange={(e) => setBeatsPerImage(e.target.value)}
                  disabled={fitBeatsToImages}
                  className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="text-xs text-slate-400">
                  {fitBeatsToImages ? 'Disabled because Image sync is enabled.' : 'Higher = fewer cuts.'}
                </div>
              </label>

              <label className="grid gap-2">
                <div className="text-sm text-slate-300">Format</div>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="16:9">16:9 (YouTube)</option>
                  <option value="9:16">9:16 (Reels)</option>
                </select>
              </label>

              <label className="grid gap-2">
                <div className="text-sm text-slate-300">Transition</div>
                <select
                  value={transition}
                  onChange={(e) => setTransition(e.target.value)}
                  className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="random_fancy">Random (fancy)</option>
                  <option value="random">Random (any)</option>
                  <option value="fade">Fade</option>
                  <option value="fadeblack">Fade to black</option>
                  <option value="fadewhite">Fade to white</option>
                  <option value="fadegrays">Fade to gray</option>
                  <option value="fadefast">Fade (fast)</option>
                  <option value="fadeslow">Fade (slow)</option>
                  <option value="dissolve">Dissolve</option>
                  <option value="pixelize">Pixelize</option>
                  <option value="zoomin">Zoom in</option>
                  <option value="hblur">Horizontal blur</option>
                  <option value="radial">Radial</option>
                  <option value="distance">Distance</option>
                  <option value="circleopen">Circle open</option>
                  <option value="circleclose">Circle close</option>
                  <option value="circlecrop">Circle crop</option>
                  <option value="rectcrop">Rect crop</option>
                  <option value="vertopen">Vertical open</option>
                  <option value="vertclose">Vertical close</option>
                  <option value="horzopen">Horizontal open</option>
                  <option value="horzclose">Horizontal close</option>
                  <option value="slideleft">Slide left</option>
                  <option value="slideright">Slide right</option>
                  <option value="slideup">Slide up</option>
                  <option value="slidedown">Slide down</option>
                  <option value="smoothleft">Smooth left</option>
                  <option value="smoothright">Smooth right</option>
                  <option value="smoothup">Smooth up</option>
                  <option value="smoothdown">Smooth down</option>
                  <option value="wipeleft">Wipe left</option>
                  <option value="wiperight">Wipe right</option>
                  <option value="wipeup">Wipe up</option>
                  <option value="wipedown">Wipe down</option>
                  <option value="diagtl">Diagonal TL</option>
                  <option value="diagtr">Diagonal TR</option>
                  <option value="diagbl">Diagonal BL</option>
                  <option value="diagbr">Diagonal BR</option>
                  <option value="wipetl">Wipe TL</option>
                  <option value="wipetr">Wipe TR</option>
                  <option value="wipebl">Wipe BL</option>
                  <option value="wipebr">Wipe BR</option>
                  <option value="hlslice">Slice HL</option>
                  <option value="hrslice">Slice HR</option>
                  <option value="vuslice">Slice VU</option>
                  <option value="vdslice">Slice VD</option>
                  <option value="hlwind">Wind HL</option>
                  <option value="hrwind">Wind HR</option>
                  <option value="vuwind">Wind VU</option>
                  <option value="vdwind">Wind VD</option>
                  <option value="squeezeh">Squeeze H</option>
                  <option value="squeezev">Squeeze V</option>
                  <option value="coverleft">Cover left</option>
                  <option value="coverright">Cover right</option>
                  <option value="coverup">Cover up</option>
                  <option value="coverdown">Cover down</option>
                  <option value="revealleft">Reveal left</option>
                  <option value="revealright">Reveal right</option>
                  <option value="revealup">Reveal up</option>
                  <option value="revealdown">Reveal down</option>
                </select>
                <div className="text-xs text-slate-400">{transitionNote(transition)}</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {TRANSITION_QUICK_PICKS.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setTransition(t.value)}
                      className={classNames(
                        'rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-black/40',
                        transition === t.value ? 'border-indigo-400/40 bg-indigo-600/60 text-white' : ''
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="text-xs text-slate-500">
                  Tip: Fade is the smoothest. Random (fancy) picks a different transition on every cut.
                </div>
              </label>

              <div className="grid gap-2">
                <div className="text-sm text-slate-300">Output</div>
                <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-200">
                  {dims.width}×{dims.height} @ 30fps
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-sm text-slate-300">Effects</div>

              <div className="mt-1 text-xs text-slate-500">Applies to the whole video.</div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => applyEffectsPreset('cinematic')}
                  className={classNames(
                    'rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-black/40',
                    effectsPreset === 'cinematic' ? 'border-indigo-400/40 bg-indigo-600/60 text-white' : ''
                  )}
                >
                  Cinematic
                </button>
                <button
                  type="button"
                  onClick={() => applyEffectsPreset('vintage')}
                  className={classNames(
                    'rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-black/40',
                    effectsPreset === 'vintage' ? 'border-indigo-400/40 bg-indigo-600/60 text-white' : ''
                  )}
                >
                  Vintage
                </button>
                <button
                  type="button"
                  onClick={() => applyEffectsPreset('bw')}
                  className={classNames(
                    'rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-black/40',
                    effectsPreset === 'bw' ? 'border-indigo-400/40 bg-indigo-600/60 text-white' : ''
                  )}
                >
                  B&W
                </button>
                <button
                  type="button"
                  onClick={() => applyEffectsPreset('punchy')}
                  className={classNames(
                    'rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-black/40',
                    effectsPreset === 'punchy' ? 'border-indigo-400/40 bg-indigo-600/60 text-white' : ''
                  )}
                >
                  Punchy
                </button>
                <button
                  type="button"
                  onClick={() => applyEffectsPreset('dreamy')}
                  className={classNames(
                    'rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-black/40',
                    effectsPreset === 'dreamy' ? 'border-indigo-400/40 bg-indigo-600/60 text-white' : ''
                  )}
                >
                  Dreamy
                </button>
                <button
                  type="button"
                  onClick={() => applyEffectsPreset('none')}
                  className={classNames(
                    'rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-black/40',
                    effectsPreset === 'none' ? 'border-indigo-400/40 bg-indigo-600/60 text-white' : ''
                  )}
                >
                  Reset
                </button>
              </div>

              <div className="mt-2 text-xs text-slate-400">
                Tip: Start with a preset, then tweak sliders. Tweaks switch preset to{' '}
                <span className="text-slate-200">Custom</span>.
              </div>

              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="grid gap-2 sm:col-span-2">
                  <div className="text-sm text-slate-300">Preset</div>
                  <select
                    value={effectsPreset}
                    onChange={(e) => {
                      const next = String(e.target.value);
                      if (next === 'custom') {
                        setEffectsPreset('custom');
                        return;
                      }
                      applyEffectsPreset(next);
                    }}
                    className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="custom">Custom</option>
                    <option value="none">None</option>
                    <option value="cinematic">Cinematic</option>
                    <option value="vintage">Vintage</option>
                    <option value="bw">B&W</option>
                    <option value="punchy">Punchy</option>
                    <option value="dreamy">Dreamy</option>
                  </select>
                  <div className="text-xs text-slate-400">{effectPresetNote(effectsPreset)}</div>
                </label>

                <label className="grid gap-2 sm:col-span-2">
                  <div className="text-sm text-slate-300">Tone curve</div>
                  <select
                    value={curves}
                    onChange={setEffectString(setCurves)}
                    className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="none">None</option>
                    <option value="lighter">Lighter</option>
                    <option value="medium_contrast">Medium contrast</option>
                    <option value="strong_contrast">Strong contrast</option>
                    <option value="vintage">Vintage</option>
                    <option value="cross_process">Cross process</option>
                  </select>
                  <div className="text-xs text-slate-500">Tip: Curves can change the feel more than brightness/contrast.</div>
                </label>

                <label className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-slate-300">Brightness</div>
                    <div className="text-xs text-slate-400">{Number(brightness).toFixed(2)}</div>
                  </div>
                  <input
                    type="range"
                    min={-0.3}
                    max={0.3}
                    step={0.01}
                    value={brightness}
                    onChange={setEffectNumber(setBrightness)}
                    className="w-full accent-indigo-500"
                  />
                </label>

                <label className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-slate-300">Contrast</div>
                    <div className="text-xs text-slate-400">{Number(contrast).toFixed(2)}</div>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={2}
                    step={0.01}
                    value={contrast}
                    onChange={setEffectNumber(setContrast)}
                    className="w-full accent-indigo-500"
                  />
                </label>

                <label className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-slate-300">Saturation</div>
                    <div className="text-xs text-slate-400">{Number(saturation).toFixed(2)}</div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={2.5}
                    step={0.01}
                    value={saturation}
                    onChange={setEffectNumber(setSaturation)}
                    className="w-full accent-indigo-500"
                  />
                </label>

                <label className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-slate-300">Hue</div>
                    <div className="text-xs text-slate-400">{Math.round(Number(hue))}°</div>
                  </div>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    step={1}
                    value={hue}
                    onChange={setEffectNumber(setHue)}
                    className="w-full accent-indigo-500"
                  />
                </label>

                <label className="grid gap-2">
                  <div className="text-sm text-slate-300">Vignette</div>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                    <div className="text-sm text-slate-200">Enable</div>
                    <input
                      type="checkbox"
                      checked={vignette}
                      onChange={setEffectBool(setVignette)}
                      className="h-4 w-4 accent-indigo-500"
                    />
                  </div>
                </label>

                <label className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-slate-300">Grain</div>
                    <div className="text-xs text-slate-400">{Math.round(Number(noise))}</div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={30}
                    step={1}
                    value={noise}
                    onChange={setEffectNumber(setNoise)}
                    className="w-full accent-indigo-500"
                  />
                </label>

                <label className="grid gap-2 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-slate-300">Sharpen</div>
                    <div className="text-xs text-slate-400">{Number(sharpen).toFixed(2)}</div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={sharpen}
                    onChange={setEffectNumber(setSharpen)}
                    className="w-full accent-indigo-500"
                  />
                </label>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                disabled={busy}
                onClick={async () => {
                  setError('');
                  setBusy(true);
                  try {
                    await ensureAnalysis();
                  } catch (e) {
                    setError(e?.message ? String(e.message) : String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
                className={classNames(
                  'rounded-xl px-4 py-2 font-medium',
                  busy ? 'bg-slate-700 text-slate-300' : 'bg-slate-800 hover:bg-slate-700'
                )}
              >
                Analyze beats
              </button>

              <button
                disabled={busy}
                onClick={startRender}
                className={classNames(
                  'rounded-xl px-4 py-2 font-medium',
                  busy ? 'bg-indigo-900/60 text-indigo-100' : 'bg-indigo-600 hover:bg-indigo-500'
                )}
              >
                Render video
              </button>

              <button
                disabled={busy}
                onClick={resetAll}
                className={classNames(
                  'rounded-xl px-4 py-2 font-medium',
                  busy ? 'bg-slate-700 text-slate-300' : 'bg-slate-800 hover:bg-slate-700'
                )}
              >
                Reset
              </button>
            </div>

            {error ? (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="text-lg font-medium">Status</div>

            <div className="mt-4 grid gap-4">
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-sm text-slate-300">Audio analysis</div>
                <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                  <div className="text-slate-400">Duration</div>
                  <div>{analysis ? formatSeconds(analysis.duration) : '-'}</div>
                  <div className="text-slate-400">Tempo</div>
                  <div>{analysis ? `${Math.round(analysis.tempo)} BPM` : '-'}</div>
                  <div className="text-slate-400">Beats detected</div>
                  <div>{analysis ? analysis.beats.length : '-'}</div>
                  <div className="text-slate-400">Segments</div>
                  <div>{analysis ? segments : '-'}</div>
                </div>
                {analysis && segments > 300 ? (
                  <div className="mt-3 text-sm text-amber-200">
                    Too many segments. Increase beats per image or enable Image sync.
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-sm text-slate-300">Uploads</div>
                <div className="mt-2 grid gap-2 text-sm">
                  <div className="text-slate-200">
                    Project: {project?._id ? <span className="text-emerald-200">ready</span> : 'not created'}
                  </div>
                  <div className="text-slate-200">
                    Audio: {project?.audio ? <span className="text-emerald-200">uploaded</span> : 'pending'}
                  </div>
                  <div className="text-slate-200">
                    Images: {project?.images?.length ? <span className="text-emerald-200">uploaded</span> : 'pending'}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-sm text-slate-300">Render</div>
                <div className="mt-2 grid gap-2 text-sm">
                  <div className="text-slate-200">
                    Status: {render?.status ? <span className="text-slate-100">{render.status}</span> : '-'}
                  </div>
                  {render?.status === 'failed' ? (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-red-200">
                      {render?.error || 'Render failed'}
                    </div>
                  ) : null}

                  {downloadUrl ? (
                    <a
                      className="mt-2 inline-flex w-fit rounded-xl bg-emerald-600 px-4 py-2 font-medium hover:bg-emerald-500"
                      href={downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download MP4
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="text-xs text-slate-400">
                Backend: {API_BASE} (set <span className="text-slate-300">VITE_API_BASE_URL</span> to change)
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-sm text-slate-300">Notes</div>
          <div className="mt-2 grid gap-1 text-sm text-slate-400">
            <div>1) The server uses FFmpeg for rendering.</div>
            <div>2) Beat detection runs in your browser using the Web Audio API.</div>
            <div>3) For long songs, increase beats per image to keep segments under 300.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
