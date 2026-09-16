import { ANIMATIONS } from './animation.js';

const gallery = document.querySelector('#gallery');

for (const [name, animation] of Object.entries(ANIMATIONS)) {
  const section = document.createElement('section');
  const title = document.createElement('h2');
  const row = document.createElement('div');
  title.textContent = name;
  row.className = 'row';
  section.append(title, row);
  gallery.append(section);

  animation.frames.forEach((frame, index) => {
    const figure = document.createElement('figure');
    const canvas = document.createElement('canvas');
    const caption = document.createElement('figcaption');
    canvas.width = 240;
    canvas.height = 230;
    caption.textContent = `${index} · ${frame.w}×${frame.h}`;
    figure.append(canvas, caption);
    row.append(figure);

    const image = new Image();
    image.onload = () => {
      const ctx = canvas.getContext('2d');
      const scale = Math.min(0.42, 205 / frame.h, 220 / frame.w);
      const rootX = 120;
      const baseline = 220;
      ctx.strokeStyle = '#ff4fa3';
      ctx.beginPath(); ctx.moveTo(0, baseline); ctx.lineTo(240, baseline); ctx.stroke();
      ctx.strokeStyle = '#4de8ff';
      ctx.beginPath(); ctx.moveTo(rootX, 18); ctx.lineTo(rootX, 230); ctx.stroke();
      ctx.drawImage(image, rootX - frame.pivotX * scale, baseline - frame.pivotY * scale, frame.w * scale, frame.h * scale);
    };
    image.src = frame.src;
  });
}
