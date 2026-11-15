// Colours follow the CIC brand guidelines (section 7 constants).
// A slowly turning globe made of Python characters: "talent is everywhere".
// Pure canvas 2D, no libraries. It pauses when off screen or in a hidden tab,
// and draws a single still frame when the viewer prefers reduced motion.
const GLYPHS = ['p', 'r', 'i', 'n', 't', 'f', 'o', '(', ')', ':', '=', '+', '<', '>', '{', '}', '#', '0', '1', '[', ']', '.', '"', '*'];
const N = 1150;

export function codeGlobe(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduce';

  // Fibonacci sphere: evenly spread points.
  const golden = Math.PI * (3 - Math.sqrt(5));
  const pts = Array.from({ length: N }, (_, i) => {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = i * golden;
    return {
      x: Math.cos(th) * r, y, z: Math.sin(th) * r,
      g: GLYPHS[(i * 7 + (i % 5)) % GLYPHS.length],
      bright: i % 17 === 0,
      phase: (i * 2.399) % (Math.PI * 2),
    };
  });

  let w = 0, h = 0, dpr = 1, running = false, visible = true, raf = 0;
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = rect.width; h = rect.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!running) draw(performance.now());
  }

  function draw(t) {
    ctx.clearRect(0, 0, w, h);
    const wide = w > 900;
    const cx = wide ? w * 0.7 : w * 0.5;
    const cy = wide ? h * 0.47 : h * 0.36;
    const R = wide ? Math.min(h * 0.4, w * 0.27) : Math.min(w * 0.46, h * 0.3);
    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;
    const ry = t * 0.00011 + mouse.x * 0.5;
    const rx = -0.32 + mouse.y * 0.25;
    const cyR = Math.cos(ry), syR = Math.sin(ry), cxR = Math.cos(rx), sxR = Math.sin(rx);

    // Orbit rings
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.38);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0, 168, 80, 0.30)'; // CIC_PRIMARY_GREEN, accent only
    ctx.beginPath(); ctx.ellipse(0, 0, R * 1.42, R * 0.36, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(200, 200, 200, 0.14)'; // CIC_LIGHT_GRAY
    ctx.beginPath(); ctx.ellipse(0, 0, R * 1.7, R * 0.5, 0.2, 0, Math.PI * 2); ctx.stroke();
    // a "student" travelling on the ring
    const a = t * 0.0004;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(Math.cos(a) * R * 1.42, Math.sin(a) * R * 0.36, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    const proj = pts.map((p) => {
      const x1 = p.x * cyR + p.z * syR;
      const z1 = -p.x * syR + p.z * cyR;
      const y1 = p.y * cxR - z1 * sxR;
      const z2 = p.y * sxR + z1 * cxR;
      const depth = (z2 + 1) / 2; // 0 back .. 1 front
      return { sx: cx + x1 * R, sy: cy + y1 * R, depth, p };
    }).sort((m, n) => m.depth - n.depth);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let bucket = -1;
    for (const q of proj) {
      const b = Math.round(q.depth * 4);
      if (b !== bucket) { bucket = b; ctx.font = `${8 + b * 2.4}px ui-monospace, SFMono-Regular, Menlo, monospace`; }
      const tw = reduce ? 1 : 0.7 + 0.3 * Math.sin(t * 0.0018 + q.p.phase);
      ctx.globalAlpha = (0.06 + q.depth * 0.9) * tw;
      // Brand palette only: white highlights, CIC green front, CIC dark green back.
      ctx.fillStyle = q.p.bright ? '#FFFFFF' : q.depth > 0.5 ? '#00A850' : '#007A3D';
      ctx.fillText(q.p.g, q.sx, q.sy);
    }
    ctx.globalAlpha = 1;
  }

  function loop(t) {
    if (!running) return;
    draw(t);
    raf = requestAnimationFrame(loop);
  }
  function start() {
    if (reduce || running || !visible || document.hidden) return;
    running = true;
    raf = requestAnimationFrame(loop);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); }).observe(canvas);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  if (!reduce) {
    window.addEventListener('pointermove', (e) => {
      mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });
  }
  resize();
  start();
}
