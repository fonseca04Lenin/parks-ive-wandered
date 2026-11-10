// "Wanderer's Road" — an original adventure theme, synthesized live with the Web Audio API.
// No audio files: the browser plays the notes itself, so there is nothing to download or license.
//
//   D major · 100 BPM · 16 bars (~38 s) that loop forever
//   A section (bars 1-8): flute-like lead over harp arpeggios, a marching bass and soft strings
//   B section (bars 9-16): the tune climbs higher and the drums come in
(() => {
  const BPM = 100, STEP = 60 / BPM / 4, BARS = 16, STEPS = BARS * 16, VOL = 0.5;
  const hz = m => 440 * 2 ** ((m - 69) / 12);
  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const midi = n => { const [, l, acc, o] = /^([A-G])([#b]?)(\d)$/.exec(n); return 12 * (+o + 1) + SEMI[l] + (acc === "#" ? 1 : acc === "b" ? -1 : 0); };

  // ---------- the tune ----------
  // chord tones for the harp, a root for the bass and a four-note voicing for the strings
  const CH = {
    D:  { root: 38, tones: [62, 66, 69], pad: [50, 57, 62, 66] },
    A:  { root: 45, tones: [64, 69, 73], pad: [45, 52, 57, 61] },
    Bm: { root: 47, tones: [62, 66, 71], pad: [47, 54, 59, 62] },
    G:  { root: 43, tones: [62, 67, 71], pad: [43, 50, 59, 62] },
  };
  const PROG = ["D", "A", "Bm", "G", "D", "A", "G", "A",   "Bm", "G", "D", "A", "Bm", "G", "A", "A"];
  // melody: [note, length in sixteenths] — every bar adds up to 16
  const MELODY = [
    [["D5", 4], ["F#5", 2], ["A5", 2], ["B5", 4], ["A5", 4]],
    [["C#6", 4], ["B5", 2], ["A5", 2], ["E5", 8]],
    [["D6", 4], ["C#6", 2], ["B5", 2], ["F#5", 4], ["B5", 4]],
    [["B5", 4], ["A5", 2], ["G5", 2], ["D5", 8]],
    [["D5", 4], ["F#5", 2], ["A5", 2], ["D6", 6], ["C#6", 2]],
    [["E6", 4], ["D6", 2], ["C#6", 2], ["A5", 4], ["C#6", 4]],
    [["B5", 4], ["D6", 4], ["B5", 4], ["G5", 4]],
    [["A5", 8], ["A4", 2], ["B4", 2], ["C#5", 2], ["E5", 2]],
    // B section
    [["F#5", 4], ["B5", 4], ["D6", 8]],
    [["D6", 4], ["E6", 4], ["D6", 8]],
    [["F#6", 6], ["E6", 2], ["D6", 4], ["A5", 4]],
    [["C#6", 4], ["E6", 4], ["C#6", 4], ["A5", 4]],
    [["D6", 4], ["F#6", 4], ["E6", 2], ["D6", 2], ["B5", 4]],
    [["G5", 4], ["B5", 4], ["D6", 4], ["G6", 4]],
    [["A5", 4], ["C#6", 4], ["E6", 4], ["A6", 4]],
    [["C#6", 6], ["B5", 2], ["A5", 8]],
  ];

  // everything that happens on each sixteenth-note step of the 16 bars
  const TL = Array.from({ length: STEPS }, () => []);
  const add = (step, ev) => TL[step % STEPS].push(ev);
  PROG.forEach((name, bar) => {
    const c = CH[name], s0 = bar * 16, hot = bar >= 8, fill = bar === 7 || bar === 15;
    add(s0, { k: "pad", m: c.pad, d: 16 * STEP });
    [[0, c.root, 3], [6, c.root, 2], [8, c.root + 7, 3], [14, c.root, 2]].forEach(([o, m, l]) => add(s0 + o, { k: "bass", m, d: l * STEP }));
    const arp = [c.tones[0], c.tones[1], c.tones[2], c.tones[0] + 12];
    [0, 1, 2, 3, 2, 1, 2, 1].forEach((ix, i) => add(s0 + i * 2, { k: "pluck", m: arp[ix], v: (i % 4 === 0 ? 1 : .65) * (hot ? 1 : .8) }));
    [0, 8].forEach(o => add(s0 + o, { k: "kick", v: 1 }));
    if (hot) add(s0 + 6, { k: "kick", v: .6 });
    [2, 6, 10, 14].forEach(o => add(s0 + o, { k: "hat", v: hot ? 1 : .6 }));
    if (hot) [4, 12].forEach(o => add(s0 + o, { k: "snare", v: .8 }));
    if (fill) [12, 13, 14, 15].forEach((o, i) => add(s0 + o, { k: "snare", v: .45 + i * .2 }));
  });
  MELODY.forEach((bar, b) => {
    let s = b * 16;
    for (const [n, l] of bar) { add(s, { k: "lead", m: midi(n), d: l * STEP * .96, v: l >= 6 ? 1 : .85 }); s += l; }
  });

  // ---------- the instruments ----------
  function lead(g, t, e) {                       // flute / ocarina: triangle + a whisper of octave, with a gentle vibrato
    const { ctx } = g, f = hz(e.m), end = t + e.d;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), m1 = ctx.createGain(), m2 = ctx.createGain();
    const env = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
    o1.type = "triangle"; o2.type = "sine"; o1.frequency.value = f; o2.frequency.value = f * 2;
    m1.gain.value = .75; m2.gain.value = .12;
    lfo.frequency.value = 5.4; depth.gain.setValueAtTime(0, t); depth.gain.linearRampToValueAtTime(f * .006, t + .25);
    lfo.connect(depth); depth.connect(o1.frequency); depth.connect(o2.frequency);
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(.2 * e.v, t + .03);
    env.gain.setTargetAtTime(.15 * e.v, t + .06, .1); env.gain.setTargetAtTime(0, end, .07);
    o1.connect(m1); o2.connect(m2); m1.connect(env); m2.connect(env); env.connect(g.lead);
    for (const o of [o1, o2, lfo]) { o.start(t); o.stop(end + .5); }
  }
  function pluck(g, t, e) {                      // harp
    const { ctx } = g, o = ctx.createOscillator(), f = ctx.createBiquadFilter(), a = ctx.createGain();
    o.type = "triangle"; o.frequency.value = hz(e.m);
    f.type = "lowpass"; f.frequency.setValueAtTime(3400, t); f.frequency.exponentialRampToValueAtTime(900, t + .3);
    a.gain.setValueAtTime(.0001, t); a.gain.exponentialRampToValueAtTime(.17 * e.v, t + .008); a.gain.exponentialRampToValueAtTime(.0001, t + .45);
    o.connect(f); f.connect(a); a.connect(g.inst); o.start(t); o.stop(t + .5);
  }
  function pad(g, t, e) {                        // strings: detuned saws, slow swell
    const { ctx } = g, f = ctx.createBiquadFilter(), a = ctx.createGain(), end = t + e.d;
    f.type = "lowpass"; f.frequency.value = 850; f.Q.value = .3;
    a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(.05, t + .7); a.gain.setValueAtTime(.05, end - .3); a.gain.linearRampToValueAtTime(0, end + .6);
    f.connect(a); a.connect(g.inst);
    for (const m of e.m) for (const d of [-7, 7]) {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = "sawtooth"; o.frequency.value = hz(m); o.detune.value = d; og.gain.value = .12;
      o.connect(og); og.connect(f); o.start(t); o.stop(end + .7);
    }
  }
  function bass(g, t, e) {                       // plucky square bass with a sine underneath
    const { ctx } = g, f = ctx.createBiquadFilter(), a = ctx.createGain(), o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), s = ctx.createGain();
    o1.type = "square"; o2.type = "sine"; o1.frequency.value = hz(e.m); o2.frequency.value = hz(e.m); s.gain.value = .9;
    f.type = "lowpass"; f.frequency.value = 480;
    a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(.2, t + .01); a.gain.exponentialRampToValueAtTime(.09, t + .25); a.gain.setTargetAtTime(0, t + e.d, .05);
    o1.connect(f); f.connect(a); o2.connect(s); s.connect(a); a.connect(g.inst);
    o1.start(t); o2.start(t); o1.stop(t + e.d + .4); o2.stop(t + e.d + .4);
  }
  function kick(g, t, e) {
    const { ctx } = g, o = ctx.createOscillator(), a = ctx.createGain();
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + .14);
    a.gain.setValueAtTime(.5 * e.v, t); a.gain.exponentialRampToValueAtTime(.001, t + .22);
    o.connect(a); a.connect(g.drums); o.start(t); o.stop(t + .25);
  }
  function snare(g, t, e) {
    const { ctx } = g, n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), a = ctx.createGain(), o = ctx.createOscillator(), b = ctx.createGain();
    n.buffer = g.noise; f.type = "bandpass"; f.frequency.value = 1900; f.Q.value = .7;
    a.gain.setValueAtTime(.22 * e.v, t); a.gain.exponentialRampToValueAtTime(.001, t + .16);
    n.connect(f); f.connect(a); a.connect(g.drums); n.start(t, Math.random() * .5); n.stop(t + .2);
    o.type = "triangle"; o.frequency.setValueAtTime(210, t); o.frequency.exponentialRampToValueAtTime(130, t + .08);
    b.gain.setValueAtTime(.15 * e.v, t); b.gain.exponentialRampToValueAtTime(.001, t + .1);
    o.connect(b); b.connect(g.drums); o.start(t); o.stop(t + .12);
  }
  function hat(g, t, e) {
    const { ctx } = g, n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), a = ctx.createGain();
    n.buffer = g.noise; f.type = "highpass"; f.frequency.value = 7000;
    a.gain.setValueAtTime(.06 * e.v, t); a.gain.exponentialRampToValueAtTime(.001, t + .05);
    n.connect(f); f.connect(a); a.connect(g.drums); n.start(t, Math.random() * .5); n.stop(t + .08);
  }
  const VOICE = { lead, pluck, pad, bass, kick, snare, hat };
  const play = (g, evs, t) => { for (const e of evs) VOICE[e.k](g, t, e); };

  // ---------- the room: reverb, echo, compressor ----------
  function impulse(ctx, secs = 2.4, decay = 3.2) {
    const n = Math.floor(ctx.sampleRate * secs), buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** decay; }
    return buf;
  }
  function buildGraph(ctx) {
    const g = { ctx };
    g.master = ctx.createGain(); g.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 3.5; comp.attack.value = .01; comp.release.value = .3;
    g.master.connect(comp); comp.connect(ctx.destination);
    const verb = ctx.createConvolver(), vg = ctx.createGain();
    verb.buffer = impulse(ctx); vg.gain.value = .32; verb.connect(vg); vg.connect(g.master);
    const bus = wet => { const b = ctx.createGain(), w = ctx.createGain(); w.gain.value = wet; b.connect(g.master); b.connect(w); w.connect(verb); return b; };
    g.inst = bus(.5); g.lead = bus(.8); g.drums = bus(.06);
    const dl = ctx.createDelay(1.5), fb = ctx.createGain(), ew = ctx.createGain();      // dotted-eighth echo on the lead
    dl.delayTime.value = STEP * 3; fb.gain.value = .3; ew.gain.value = .2;
    g.lead.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(ew); ew.connect(g.master);
    const n = Math.floor(ctx.sampleRate), nb = ctx.createBuffer(1, n, ctx.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < n; i++) nd[i] = Math.random() * 2 - 1;
    g.noise = nb;
    return g;
  }

  // ---------- playing it live ----------
  let ctx = null, g = null, timer = null, cur = 0, next = 0, on = false, resumeOnShow = false;
  const emit = () => api.onchange && api.onchange(on);
  function tick() { while (next < ctx.currentTime + .25) { play(g, TL[cur], next); next += STEP; cur = (cur + 1) % STEPS; } }
  async function start() {
    if (on) return;
    try {
      if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); g = buildGraph(ctx); }
      await ctx.resume();
    } catch (err) { console.warn("music unavailable", err); return; }
    on = true;
    const now = ctx.currentTime;
    next = Math.max(next, now + .08);
    g.master.gain.cancelScheduledValues(now); g.master.gain.setValueAtTime(g.master.gain.value, now);
    g.master.gain.linearRampToValueAtTime(VOL, now + 2.5);                    // fade in
    timer = setInterval(tick, 40); tick(); emit();
  }
  function stop() {
    if (!on) return;
    on = false; clearInterval(timer);
    const now = ctx.currentTime;
    g.master.gain.cancelScheduledValues(now); g.master.gain.setValueAtTime(g.master.gain.value, now);
    g.master.gain.linearRampToValueAtTime(0, now + .7);                       // fade out, then freeze the clock
    setTimeout(() => { if (!on) ctx.suspend(); }, 800);
    emit();
  }
  // a hidden tab throttles timers, which would stutter the music — pause it and pick up again on return
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { if (on) { resumeOnShow = true; stop(); } }
    else if (resumeOnShow) { resumeOnShow = false; start(); }
  });

  // render the whole loop offline (used to check the mix; also handy for exporting a preview)
  async function render(loops = 1) {
    const secs = STEPS * STEP * loops + 3, oc = new OfflineAudioContext(2, Math.ceil(44100 * secs), 44100), og = buildGraph(oc);
    og.master.gain.value = VOL;
    for (let s = 0; s < STEPS * loops; s++) play(og, TL[s % STEPS], .05 + s * STEP);
    return oc.startRendering();
  }

  const api = {
    start, stop, render, onchange: null, bars: BARS, seconds: STEPS * STEP,
    toggle: () => (on ? stop() : start()),
    get playing() { return on; },
    get state() { return ctx ? ctx.state : "none"; },
    get time() { return ctx ? ctx.currentTime : 0; },
  };
  window.AdventureMusic = api;
})();
