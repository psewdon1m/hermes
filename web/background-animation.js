const BASE_PARTICLES = 46;
const LINK_DISTANCE = 180;
const SPEED = 0.01;

function createParticle(width, height, scale = 1) {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * SPEED * scale,
    vy: (Math.random() - 0.5) * SPEED * scale,
    radius: Math.random() * 2.2 + 0.4,
  };
}

export function startBackgroundAnimation(canvas) {
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return () => {};

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let width = 0;
  let height = 0;
  let particles = [];
  let animationFrame = null;

  function resize() {
    width = Math.max(window.innerWidth, 1);
    height = Math.max(window.innerHeight, 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const target = Math.round(BASE_PARTICLES * Math.max(width, 640) / 1280);
    particles = Array.from({ length: target }, () => createParticle(width, height, dpr));
  }

  function step() {
    animationFrame = window.requestAnimationFrame(step);

    ctx.clearRect(0, 0, width, height);

    for (const particle of particles) {
      particle.x += particle.vx * width;
      particle.y += particle.vy * height;

      if (particle.x < -20 || particle.x > width + 20) {
        particle.x = Math.random() * width;
      }
      if (particle.y < -20 || particle.y > height + 20) {
        particle.y = Math.random() * height;
      }
    }

    ctx.lineWidth = 0.6;
    ctx.strokeStyle = 'rgba(125, 146, 255, 0.16)';
    ctx.fillStyle = 'rgba(177, 188, 255, 0.32)';

    for (let i = 0; i < particles.length; i += 1) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j += 1) {
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < LINK_DISTANCE) {
          const alpha = 1 - dist / LINK_DISTANCE;
          ctx.globalAlpha = alpha * 0.6;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    ctx.globalAlpha = 1;
    for (const particle of particles) {
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  resize();
  step();

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  return () => {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
    window.removeEventListener('resize', resize);
    window.removeEventListener('orientationchange', resize);
  };
}
