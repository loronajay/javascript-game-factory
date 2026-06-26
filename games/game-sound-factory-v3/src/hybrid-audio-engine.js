const TWO_PI = Math.PI * 2;

const MATERIAL_RESONATORS = {
  metal: [
    { frequency: 1320, q: 18, gain: 0.38, decay: 0.19 },
    { frequency: 2460, q: 24, gain: 0.26, decay: 0.25 },
    { frequency: 4180, q: 30, gain: 0.16, decay: 0.31 },
  ],
  armor: [
    { frequency: 620, q: 12, gain: 0.38, decay: 0.2 },
    { frequency: 1180, q: 17, gain: 0.28, decay: 0.27 },
    { frequency: 2260, q: 22, gain: 0.17, decay: 0.34 },
  ],
  wood: [
    { frequency: 240, q: 5, gain: 0.42, decay: 0.1 },
    { frequency: 540, q: 7, gain: 0.25, decay: 0.13 },
    { frequency: 980, q: 8, gain: 0.12, decay: 0.16 },
  ],
  body: [
    { frequency: 145, q: 3.2, gain: 0.42, decay: 0.11 },
    { frequency: 310, q: 4.5, gain: 0.22, decay: 0.09 },
    { frequency: 680, q: 5.5, gain: 0.1, decay: 0.07 },
  ],
  stone: [
    { frequency: 180, q: 7, gain: 0.36, decay: 0.13 },
    { frequency: 430, q: 11, gain: 0.24, decay: 0.18 },
    { frequency: 1120, q: 15, gain: 0.14, decay: 0.22 },
  ],
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createDistortionCurve(amount = 0) {
  const samples = 4096;
  const curve = new Float32Array(samples);
  const drive = clamp(amount, 0, 1) * 90;
  for (let index = 0; index < samples; index += 1) {
    const x = (index * 2) / samples - 1;
    curve[index] = drive === 0
      ? x
      : ((3 + drive) * x * 20 * Math.PI / 180) / (Math.PI + drive * Math.abs(x));
  }
  return curve;
}

function scheduleCurve(param, start, duration, points, exponential = false) {
  if (!Array.isArray(points) || points.length === 0) return;
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  const firstValue = exponential ? Math.max(0.0001, sorted[0][1]) : sorted[0][1];
  param.cancelScheduledValues(start);
  param.setValueAtTime(firstValue, start + sorted[0][0] * duration);

  for (let index = 1; index < sorted.length; index += 1) {
    const [position, rawValue] = sorted[index];
    const time = start + clamp(position, 0, 1) * duration;
    const value = exponential ? Math.max(0.0001, rawValue) : rawValue;
    if (exponential) {
      param.exponentialRampToValueAtTime(value, time);
    } else {
      param.linearRampToValueAtTime(value, time);
    }
  }
}

function adsrToPoints(envelope = {}, duration = 0.2) {
  const attack = Math.max(0.001, envelope.attack ?? 0.004);
  const decay = Math.max(0.001, envelope.decay ?? 0.05);
  const sustain = clamp(envelope.sustain ?? 0.5, 0, 1);
  const release = Math.max(0.004, envelope.release ?? 0.08);
  const safeDuration = Math.max(duration, attack + decay + release + 0.002);
  return [
    [0, 0],
    [attack / safeDuration, 1],
    [(attack + decay) / safeDuration, sustain],
    [Math.max((attack + decay) / safeDuration, 1 - release / safeDuration), sustain],
    [1, 0],
  ];
}

function scheduleEnvelope(param, start, duration, envelope, peak = 1) {
  const points = Array.isArray(envelope)
    ? envelope
    : adsrToPoints(envelope ?? {}, duration);
  scheduleCurve(
    param,
    start,
    duration,
    points.map(([position, value]) => [position, Math.max(0.0001, value * peak)]),
    true,
  );
}

function createNoiseBuffer(context, duration, color, random) {
  const frames = Math.max(1, Math.ceil(context.sampleRate * duration));
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const data = buffer.getChannelData(0);

  let brown = 0;
  let pink0 = 0;
  let pink1 = 0;
  let pink2 = 0;
  let pink3 = 0;
  let pink4 = 0;
  let pink5 = 0;
  let pink6 = 0;

  for (let index = 0; index < frames; index += 1) {
    const white = random() * 2 - 1;

    if (color === "brown") {
      brown = (brown + white * 0.02) / 1.02;
      data[index] = brown * 3.5;
    } else if (color === "pink") {
      pink0 = 0.99886 * pink0 + white * 0.0555179;
      pink1 = 0.99332 * pink1 + white * 0.0750759;
      pink2 = 0.969 * pink2 + white * 0.153852;
      pink3 = 0.8665 * pink3 + white * 0.3104856;
      pink4 = 0.55 * pink4 + white * 0.5329522;
      pink5 = -0.7616 * pink5 - white * 0.016898;
      data[index] = (pink0 + pink1 + pink2 + pink3 + pink4 + pink5 + pink6 + white * 0.5362) * 0.11;
      pink6 = white * 0.115926;
    } else {
      data[index] = white;
    }
  }

  return buffer;
}

function reverseAudioBuffer(context, sourceBuffer) {
  const reversed = context.createBuffer(
    sourceBuffer.numberOfChannels,
    sourceBuffer.length,
    sourceBuffer.sampleRate,
  );
  for (let channel = 0; channel < sourceBuffer.numberOfChannels; channel += 1) {
    const source = sourceBuffer.getChannelData(channel);
    const target = reversed.getChannelData(channel);
    for (let index = 0; index < source.length; index += 1) {
      target[index] = source[source.length - 1 - index];
    }
  }
  return reversed;
}

function legacyLayers(patch) {
  const voices = (patch.voices ?? []).map((voice) => ({
    type: "oscillator",
    role: "tone",
    waveform: voice.type ?? "sine",
    frequency: voice.frequency ?? 440,
    endFrequency: voice.endFrequency,
    gain: voice.gain ?? 0.3,
    duration: voice.duration ?? patch.duration ?? 0.2,
    offset: voice.offset ?? 0,
    envelope: voice.envelope,
    filter: voice.filter,
    harmonics: voice.harmonics,
    detune: voice.detune,
  }));
  const noise = (patch.noise ?? []).map((voice) => ({
    type: "noise",
    role: "texture",
    color: voice.color ?? "white",
    gain: voice.gain ?? 0.25,
    duration: voice.duration ?? patch.duration ?? 0.2,
    offset: voice.offset ?? 0,
    envelope: voice.envelope,
    filter: voice.filter,
    playbackRate: voice.playbackRate,
  }));
  return [...voices, ...noise];
}

function connectFilters(context, input, config, start, duration) {
  if (!config) return input;
  let current = input;

  const configs = Array.isArray(config) ? config : [config];
  for (const item of configs) {
    const filter = context.createBiquadFilter();
    filter.type = item.type ?? "lowpass";
    filter.Q.value = item.q ?? 0.7;

    if (Array.isArray(item.frequencyCurve)) {
      scheduleCurve(filter.frequency, start, duration, item.frequencyCurve, true);
    } else {
      const from = item.frequency ?? 18000;
      const to = item.endFrequency ?? from;
      scheduleCurve(filter.frequency, start, duration, [[0, from], [1, to]], true);
    }

    current.connect(filter);
    current = filter;
  }

  return current;
}

function connectLayerEffects(context, input, output, effects = {}, start = 0, duration = 1) {
  let current = connectFilters(context, input, effects.filter, start, duration);

  if ((effects.saturation ?? effects.distortion ?? 0) > 0) {
    const shaper = context.createWaveShaper();
    shaper.curve = createDistortionCurve(effects.saturation ?? effects.distortion);
    shaper.oversample = "4x";
    current.connect(shaper);
    current = shaper;
  }

  if (typeof context.createStereoPanner === "function") {
    const panner = context.createStereoPanner();
    panner.pan.value = clamp(effects.pan ?? 0, -1, 1);
    current.connect(panner);
    current = panner;
  }

  current.connect(output);
}

function createPatchBus(context, destination, patch, start) {
  const input = context.createGain();
  let current = input;
  const effects = patch.effects ?? {};

  current = connectFilters(
    context,
    current,
    effects.filter,
    start,
    patch.duration ?? 1,
  );

  if (effects.highpass) {
    const highpass = context.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = effects.highpass;
    highpass.Q.value = effects.highpassQ ?? 0.7;
    current.connect(highpass);
    current = highpass;
  }

  if (effects.lowpass) {
    const lowpass = context.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = effects.lowpass;
    lowpass.Q.value = effects.lowpassQ ?? 0.7;
    current.connect(lowpass);
    current = lowpass;
  }

  if ((effects.saturation ?? effects.distortion ?? 0) > 0) {
    const shaper = context.createWaveShaper();
    shaper.curve = createDistortionCurve(effects.saturation ?? effects.distortion);
    shaper.oversample = "4x";
    current.connect(shaper);
    current = shaper;
  }

  if (effects.compressor !== false) {
    const compressor = context.createDynamicsCompressor();
    const config = typeof effects.compressor === "object" ? effects.compressor : {};
    compressor.threshold.value = config.threshold ?? -18;
    compressor.knee.value = config.knee ?? 18;
    compressor.ratio.value = config.ratio ?? 5;
    compressor.attack.value = config.attack ?? 0.003;
    compressor.release.value = config.release ?? 0.16;
    current.connect(compressor);
    current = compressor;
  }

  if ((effects.delay?.time ?? 0) > 0 && (effects.delay?.mix ?? 0) > 0) {
    const dry = context.createGain();
    const wet = context.createGain();
    const delay = context.createDelay(2);
    const feedback = context.createGain();
    const sum = context.createGain();

    dry.gain.value = 1 - clamp(effects.delay.mix, 0, 1);
    wet.gain.value = clamp(effects.delay.mix, 0, 1);
    delay.delayTime.value = clamp(effects.delay.time, 0, 2);
    feedback.gain.value = clamp(effects.delay.feedback ?? 0, 0, 0.9);

    current.connect(dry);
    dry.connect(sum);
    current.connect(delay);
    delay.connect(wet);
    wet.connect(sum);
    delay.connect(feedback);
    feedback.connect(delay);
    current = sum;
  }

  const output = context.createGain();
  output.gain.value = clamp(patch.gain ?? 0.8, 0, 2);
  current.connect(output);
  output.connect(destination);

  return input;
}

export class HybridAudioEngine {
  constructor({ sampleSources = {} } = {}) {
    this.context = null;
    this.masterInput = null;
    this.masterGain = null;
    this.masterVolume = 0.78;
    this.sampleSources = { ...sampleSources };
    this.sampleBuffers = new Map();
    this.reverseBuffers = new Map();
    this.activeNodes = new Set();
  }

  async initialize() {
    if (!this.context) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) throw new Error("This browser does not support the Web Audio API.");

      this.context = new Context();
      this.masterInput = this.context.createGain();

      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -12;
      compressor.knee.value = 12;
      compressor.ratio.value = 7;
      compressor.attack.value = 0.002;
      compressor.release.value = 0.14;

      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = this.masterVolume;

      this.masterInput.connect(compressor);
      compressor.connect(this.masterGain);
      this.masterGain.connect(this.context.destination);
    }

    if (this.context.state === "suspended") {
      await this.context.resume();
    }

    return this.context;
  }

  setMasterVolume(value) {
    this.masterVolume = clamp(Number(value), 0, 1);
    if (this.masterGain && this.context) {
      this.masterGain.gain.setTargetAtTime(this.masterVolume, this.context.currentTime, 0.01);
    }
  }

  setSampleSources(sampleSources) {
    this.sampleSources = { ...this.sampleSources, ...sampleSources };
  }

  async preloadSamples(ids = Object.keys(this.sampleSources)) {
    await this.initialize();
    await Promise.all(ids.map((id) => this.loadSample(id)));
  }

  async loadSample(id) {
    if (this.sampleBuffers.has(id)) return this.sampleBuffers.get(id);
    const source = this.sampleSources[id];
    if (!source) throw new Error(`No sample source is registered for "${id}".`);

    const response = await fetch(source);
    if (!response.ok) throw new Error(`Could not load sample "${id}".`);
    const bytes = await response.arrayBuffer();
    const decoded = await this.context.decodeAudioData(bytes.slice(0));
    this.sampleBuffers.set(id, decoded);
    return decoded;
  }

  stopAll() {
    for (const node of this.activeNodes) {
      try { node.stop(); } catch {}
    }
    this.activeNodes.clear();
  }

  async play(patch, options = {}) {
    await this.initialize();
    const assets = this.#collectAssets(patch);
    await Promise.all(assets.map((id) => this.loadSample(id)));
    return this.#schedulePatch(this.context, this.masterInput, patch, {
      ...options,
      startTime: options.startTime ?? this.context.currentTime + 0.008,
      trackActive: true,
    });
  }

  async renderWav(patch, options = {}) {
    await this.initialize();
    const assets = this.#collectAssets(patch);
    await Promise.all(assets.map((id) => this.loadSample(id)));

    const duration = this.getPatchDuration(patch, options);
    const sampleRate = 48000;
    const frames = Math.ceil(duration * sampleRate);
    const offline = new OfflineAudioContext(2, frames, sampleRate);
    const master = offline.createGain();
    master.gain.value = clamp(options.masterVolume ?? 0.88, 0, 1);
    master.connect(offline.destination);

    this.#schedulePatch(offline, master, patch, {
      ...options,
      startTime: 0.02,
      trackActive: false,
    });

    const rendered = await offline.startRendering();
    return this.#audioBufferToWav(rendered);
  }

  getPatchDuration(patch, options = {}) {
    const durationScale = clamp(options.durationScale ?? 1, 0.25, 3);
    const base = patch.duration ?? Math.max(
      0.2,
      ...(patch.layers ?? legacyLayers(patch)).map((layer) => (layer.offset ?? 0) + (layer.duration ?? 0.2)),
    );
    const delayTail = (patch.effects?.delay?.time ?? 0) * (1 + (patch.effects?.delay?.feedback ?? 0) * 5);
    return (base + delayTail + 0.18) * durationScale;
  }

  #collectAssets(patch) {
    return [...new Set(
      (patch.layers ?? [])
        .filter((layer) => layer.type === "sample" && layer.asset)
        .map((layer) => layer.asset),
    )];
  }

  #getSampleBuffer(context, asset, reverse = false) {
    const buffer = this.sampleBuffers.get(asset);
    if (!buffer) throw new Error(`Sample "${asset}" is not loaded.`);
    if (!reverse) return buffer;

    const key = `${asset}:${context.sampleRate}`;
    if (!this.reverseBuffers.has(key)) {
      this.reverseBuffers.set(key, reverseAudioBuffer(context, buffer));
    }
    return this.reverseBuffers.get(key);
  }

  #schedulePatch(context, destination, patch, options) {
    const start = options.startTime;
    const seed = (options.seed ?? hashString(`${patch.id ?? patch.name}:${Date.now()}`)) >>> 0;
    const random = mulberry32(seed);
    const bipolar = () => random() * 2 - 1;
    const variation = clamp(options.variation ?? 0.05, 0, 0.5);
    const pitchScale = clamp(options.pitchScale ?? 1, 0.35, 2.5);
    const durationScale = clamp(options.durationScale ?? 1, 0.25, 3);
    const intensity = clamp(options.intensity ?? 1, 0, 2);
    const roleGains = {
      air: 1,
      contact: 1,
      body: 1,
      resonance: 1,
      texture: 1,
      tone: 1,
      reference: 1,
      ...(options.roleGains ?? {}),
    };

    const patchBus = createPatchBus(context, destination, patch, start);
    const layers = patch.layers ?? legacyLayers(patch);
    const nodes = [];

    const track = (node) => {
      nodes.push(node);
      if (options.trackActive && context === this.context) {
        this.activeNodes.add(node);
        node.addEventListener("ended", () => this.activeNodes.delete(node), { once: true });
      }
    };

    for (const layer of layers) {
      if (layer.enabled === false) continue;

      const roleGain = roleGains[layer.role ?? "texture"] ?? 1;
      const gainVariation = layer.gainVariation ?? variation * 0.35;
      const pitchVariation = layer.pitchVariation ?? variation * 0.18;
      const timeVariation = layer.timeVariation ?? variation * 0.01;
      const layerGainValue = Math.max(
        0,
        (layer.gain ?? 1) * roleGain * intensity * (1 + bipolar() * gainVariation),
      );
      const layerPitch = Math.max(
        0.05,
        pitchScale * (layer.pitchScale ?? 1) * (1 + bipolar() * pitchVariation),
      );
      const layerStart = start + Math.max(
        0,
        ((layer.offset ?? 0) + bipolar() * timeVariation) * durationScale,
      );

      if (layer.type === "sample") {
        const buffer = this.#getSampleBuffer(context, layer.asset, layer.reverse);
        const trimStart = clamp(layer.trimStart ?? 0, 0, Math.max(0, buffer.duration - 0.001));
        const trimEnd = clamp(layer.trimEnd ?? 0, 0, Math.max(0, buffer.duration - trimStart - 0.001));
        const available = Math.max(0.001, buffer.duration - trimStart - trimEnd);
        const playbackRate = Math.max(
          0.05,
          (layer.playbackRate ?? 1) * layerPitch / durationScale,
        );
        const naturalDuration = available / playbackRate;
        const duration = Math.min(
          naturalDuration,
          layer.duration ? layer.duration * durationScale : naturalDuration,
        );

        const source = context.createBufferSource();
        const gain = context.createGain();
        source.buffer = buffer;
        source.playbackRate.value = playbackRate;
        source.detune.value = layer.detune ?? 0;

        scheduleEnvelope(
          gain.gain,
          layerStart,
          duration,
          layer.envelope ?? [[0, 0.0001], [0.012, 1], [0.88, 1], [1, 0.0001]],
          layerGainValue,
        );

        let current = source;
        current = connectFilters(context, current, layer.filter, layerStart, duration);
        current.connect(gain);
        connectLayerEffects(context, gain, patchBus, layer.effects, layerStart, duration);

        source.start(layerStart, trimStart, available);
        source.stop(layerStart + duration + 0.01);
        track(source);
        continue;
      }

      if (layer.type === "noise") {
        const duration = Math.max(0.012, (layer.duration ?? 0.2) * durationScale);
        const source = context.createBufferSource();
        const gain = context.createGain();
        source.buffer = createNoiseBuffer(context, duration + 0.02, layer.color ?? "white", random);
        source.playbackRate.value = Math.max(0.1, (layer.playbackRate ?? 1) * layerPitch);

        scheduleEnvelope(
          gain.gain,
          layerStart,
          duration,
          layer.envelope ?? [[0, 0.0001], [0.08, 1], [0.55, 0.4], [1, 0.0001]],
          layerGainValue,
        );

        let current = source;
        current = connectFilters(context, current, layer.filter, layerStart, duration);
        current.connect(gain);
        connectLayerEffects(context, gain, patchBus, layer.effects, layerStart, duration);

        source.start(layerStart);
        source.stop(layerStart + duration + 0.01);
        track(source);
        continue;
      }

      if (layer.type === "oscillator") {
        const duration = Math.max(0.012, (layer.duration ?? 0.2) * durationScale);
        const oscillator = context.createOscillator();
        const gain = context.createGain();

        oscillator.type = layer.waveform ?? "sine";
        if (layer.waveform === "custom" && Array.isArray(layer.harmonics)) {
          const real = new Float32Array(layer.harmonics.length + 1);
          const imag = new Float32Array(layer.harmonics.length + 1);
          layer.harmonics.forEach((value, index) => { imag[index + 1] = value; });
          oscillator.setPeriodicWave(context.createPeriodicWave(real, imag));
        }

        const from = (layer.frequency ?? 440) * layerPitch;
        const to = (layer.endFrequency ?? layer.frequency ?? 440) * layerPitch;
        scheduleCurve(
          oscillator.frequency,
          layerStart,
          duration,
          layer.frequencyCurve
            ? layer.frequencyCurve.map(([position, value]) => [position, value * layerPitch])
            : [[0, from], [1, to]],
          true,
        );
        oscillator.detune.value = layer.detune ?? 0;

        scheduleEnvelope(
          gain.gain,
          layerStart,
          duration,
          layer.envelope,
          layerGainValue,
        );

        let current = oscillator;
        current = connectFilters(context, current, layer.filter, layerStart, duration);
        current.connect(gain);
        connectLayerEffects(context, gain, patchBus, layer.effects, layerStart, duration);

        oscillator.start(layerStart);
        oscillator.stop(layerStart + duration + 0.01);
        track(oscillator);
        continue;
      }

      if (layer.type === "impactBody") {
        const modes = layer.modes ?? [
          { frequency: layer.frequency ?? 82, endFrequency: layer.endFrequency ?? 45, gain: 1, decay: layer.duration ?? 0.28, waveform: "sine" },
          { frequency: (layer.frequency ?? 82) * 1.9, endFrequency: (layer.endFrequency ?? 45) * 1.45, gain: 0.28, decay: (layer.duration ?? 0.28) * 0.58, waveform: "triangle" },
        ];

        for (const mode of modes) {
          const duration = Math.max(0.02, (mode.decay ?? layer.duration ?? 0.28) * durationScale);
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = mode.waveform ?? "sine";

          scheduleCurve(
            oscillator.frequency,
            layerStart,
            duration,
            [
              [0, (mode.frequency ?? 80) * layerPitch],
              [1, (mode.endFrequency ?? mode.frequency ?? 50) * layerPitch],
            ],
            true,
          );

          scheduleEnvelope(
            gain.gain,
            layerStart,
            duration,
            mode.envelope ?? [[0, 0.0001], [0.008, 1], [0.12, 0.62], [1, 0.0001]],
            layerGainValue * (mode.gain ?? 1),
          );

          oscillator.connect(gain);
          connectLayerEffects(context, gain, patchBus, layer.effects, layerStart, duration);
          oscillator.start(layerStart);
          oscillator.stop(layerStart + duration + 0.01);
          track(oscillator);
        }
        continue;
      }

      if (layer.type === "resonatorBank") {
        const modes = layer.modes ?? MATERIAL_RESONATORS[layer.material ?? "metal"] ?? MATERIAL_RESONATORS.metal;
        const excitationDuration = Math.max(0.006, (layer.excitationDuration ?? 0.025) * durationScale);
        const maxDecay = Math.max(...modes.map((mode) => mode.decay ?? 0.2)) * durationScale;
        const source = context.createBufferSource();
        source.buffer = createNoiseBuffer(context, excitationDuration + 0.004, layer.color ?? "white", random);

        const excitationGain = context.createGain();
        scheduleEnvelope(
          excitationGain.gain,
          layerStart,
          excitationDuration,
          [[0, 0.0001], [0.05, 1], [0.35, 0.42], [1, 0.0001]],
          layer.excitationGain ?? 1,
        );
        source.connect(excitationGain);

        for (const mode of modes) {
          const filter = context.createBiquadFilter();
          const gain = context.createGain();
          const duration = Math.max(0.025, (mode.decay ?? 0.2) * durationScale);

          filter.type = "bandpass";
          filter.frequency.value = (mode.frequency ?? 1000) * layerPitch;
          filter.Q.value = mode.q ?? 14;

          scheduleEnvelope(
            gain.gain,
            layerStart,
            duration,
            [[0, 0.0001], [0.015, 1], [1, 0.0001]],
            layerGainValue * (mode.gain ?? 0.2),
          );

          excitationGain.connect(filter);
          filter.connect(gain);
          connectLayerEffects(context, gain, patchBus, layer.effects, layerStart, duration);
        }

        source.start(layerStart);
        source.stop(layerStart + excitationDuration + 0.01);
        track(source);
      }
    }

    return { seed, nodes };
  }

  #audioBufferToWav(buffer) {
    const channels = buffer.numberOfChannels;
    const frames = buffer.length;
    const bytesPerSample = 2;
    const blockAlign = channels * bytesPerSample;
    const dataSize = frames * blockAlign;
    const arrayBuffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(arrayBuffer);

    const writeString = (offset, value) => {
      for (let index = 0; index < value.length; index += 1) {
        view.setUint8(offset + index, value.charCodeAt(index));
      }
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true);
    writeString(36, "data");
    view.setUint32(40, dataSize, true);

    const channelData = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
    let offset = 44;
    for (let frame = 0; frame < frames; frame += 1) {
      for (let channel = 0; channel < channels; channel += 1) {
        const sample = clamp(channelData[channel][frame], -1, 1);
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }

    return new Blob([arrayBuffer], { type: "audio/wav" });
  }
}
