import * as THREE from 'three';

/** Texturas desenhadas em canvas — nada de baixar imagem. */

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas 2d indisponivel');
  return [c, ctx];
}

function finish(canvas: HTMLCanvasElement, repeat: number): THREE.Texture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Grade industrial com sujeira — usada no chao. */
export function floorTexture(): THREE.Texture {
  const [canvas, ctx] = makeCanvas(256);
  ctx.fillStyle = '#23262b';
  ctx.fillRect(0, 0, 256, 256);

  // Sujeira em escala de cinza. Manchas coloridas viram um chao "oleoso"
  // que briga com a iluminacao — cinza le' melhor.
  for (let i = 0; i < 220; i++) {
    const r = 4 + Math.random() * 36;
    const v = Math.random() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * 0.03})`;
    ctx.beginPath();
    ctx.arc(Math.random() * 256, Math.random() * 256, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // linhas de placa
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(128, 0); ctx.lineTo(128, 256);
  ctx.moveTo(0, 128); ctx.lineTo(256, 128);
  ctx.stroke();

  // parafusos nos cantos
  ctx.fillStyle = 'rgba(255,255,255,0.09)';
  for (const [x, y] of [[12, 12], [244, 12], [12, 244], [244, 244]] as const) {
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
  }

  return finish(canvas, 20);
}

/** Concreto com faixa de perigo — paredes externas. */
export function wallTexture(): THREE.Texture {
  const [canvas, ctx] = makeCanvas(256);
  ctx.fillStyle = '#2c3037';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.16})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, Math.random() * 5, Math.random() * 5);
  }

  // juntas horizontais
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 2;
  for (let y = 0; y <= 256; y += 64) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let y = 2; y <= 256; y += 64) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
  }

  return finish(canvas, 6);
}

/** Metal pintado — obstaculos e plataformas. */
export function crateTexture(tint: string): THREE.Texture {
  const [canvas, ctx] = makeCanvas(128);
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, 128, 128);

  for (let i = 0; i < 400; i++) {
    const v = Math.random() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * 0.08})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, Math.random() * 8, Math.random() * 8);
  }

  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 5;
  ctx.strokeRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 2;
  ctx.strokeRect(6, 6, 116, 116);

  return finish(canvas, 1);
}
