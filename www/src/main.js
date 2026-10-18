import './style.css';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const drawingRoot = $('drawingLayerRoot');
const overlay = $('selectionOverlay');
const stageWrap = $('stageWrap');
const layersList = $('layersList');
const colorInput = $('colorInput');
const widthInput = $('widthInput');
const widthValue = $('widthValue');
const fillInput = $('fillInput');
const statusMessage = $('statusMessage');
const toolStatus = $('toolStatus');
const coordsLabel = $('coordsLabel');
const zoomLabel = $('zoomLabel');
const openInput = $('openInput');
const PAGE = { x: 350, y: 200, width: 900, height: 600 };
const toolsNames = { pen: 'Pincel activo', eraser: 'Borrador activo', select: 'Selección activa', nodes: 'Edición de nodos activa', rect: 'Rectángulo activo', ellipse: 'Elipse activa', hand: 'Mover espacio de trabajo' };

let nextId = 1;
let tool = 'pen';
let color = '#202124';
let strokeWidth = 5;
let fillShapes = false;
let selectedObjectId = null;
let activeLayerId = 1;
let layers = [{ id: 1, name: 'Capa 1', visible: true, locked: false, objects: [] }];
let view = { x: 0, y: 0, w: 1600, h: 1000 };
let gesture = null;
let undoStack = [];
let redoStack = [];
let suppressClick = false;

const clone = (v) => JSON.parse(JSON.stringify(v));
const activeLayer = () => layers.find((l) => l.id === activeLayerId) || layers[0];
const findObject = (id) => {
  for (const layer of layers) {
    const object = layer.objects.find((o) => o.id === Number(id));
    if (object) return { object, layer };
  }
  return null;
};
const pointString = (points) => points.map((p) => p.x.toFixed(2) + ' ' + p.y.toFixed(2)).join(' L ');
const pathData = (obj) => obj.points?.length ? 'M ' + pointString(obj.points) : '';
const esc = (s) => String(s).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function checkpoint() {
  undoStack.push(JSON.stringify({ layers, activeLayerId, nextId, selectedObjectId }));
  if (undoStack.length > 60) undoStack.shift();
  redoStack = [];
}
function persist() {
  try { localStorage.setItem('vector-studio-project', JSON.stringify({ layers, activeLayerId, nextId })); } catch {}
}
function setStatus(message) { statusMessage.textContent = message; }
function setTool(name) {
  tool = name;
  document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
  toolStatus.textContent = toolsNames[tool] || tool;
  stage.style.cursor = tool === 'hand' ? 'grab' : tool === 'select' || tool === 'nodes' ? 'default' : tool === 'eraser' ? 'not-allowed' : 'crosshair';
}
function setViewBox() {
  stage.setAttribute('viewBox', [view.x, view.y, view.w, view.h].join(' '));
  zoomLabel.textContent = Math.round(1600 / view.w * 100) + '%';
}
function svgPoint(event) {
  const p = stage.createSVGPoint();
  p.x = event.clientX; p.y = event.clientY;
  const matrix = stage.getScreenCTM();
  return matrix ? p.matrixTransform(matrix.inverse()) : { x: 0, y: 0 };
}
function makeSvg(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}
function objectMarkup(obj) {
  const common = { 'data-object-id': obj.id, 'stroke': obj.stroke || '#202124', 'stroke-width': obj.strokeWidth || 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' };
  if (obj.type === 'path') return makeSvg('path', { ...common, d: pathData(obj), fill: 'none' });
  if (obj.type === 'rect') return makeSvg('rect', { ...common, x: obj.x, y: obj.y, width: obj.width, height: obj.height, rx: obj.rx || 0, fill: obj.fill || 'none' });
  if (obj.type === 'ellipse') return makeSvg('ellipse', { ...common, cx: obj.cx, cy: obj.cy, rx: obj.rx, ry: obj.ry, fill: obj.fill || 'none' });
  return null;
}
function objectBounds(obj) {
  if (obj.type === 'path') {
    const pts = obj.points || [];
    if (!pts.length) return { x: 0, y: 0, w: 0, h: 0 };
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
  }
  if (obj.type === 'rect') return { x: obj.x, y: obj.y, w: Math.abs(obj.width), h: Math.abs(obj.height) };
  if (obj.type === 'ellipse') return { x: obj.cx - obj.rx, y: obj.cy - obj.ry, w: obj.rx * 2, h: obj.ry * 2 };
  return { x: 0, y: 0, w: 0, h: 0 };
}
function renderLayers() {
  layersList.replaceChildren();
  [...layers].reverse().forEach((layer) => {
    const row = document.createElement('div');
    row.className = 'layer-row' + (layer.id === activeLayerId ? ' chosen' : '');
    row.innerHTML = '<button class="eye" data-action="visibility" data-layer="' + layer.id + '" title="Mostrar u ocultar">' + (layer.visible ? '◉' : '○') + '</button><button class="layer-name" data-action="activate" data-layer="' + layer.id + '">' + esc(layer.name) + '</button><span class="layer-count">' + layer.objects.length + '</span>';
    layersList.append(row);
  });
}
function render() {
  drawingRoot.replaceChildren();
  for (const layer of layers) {
    const group = makeSvg('g', { 'data-layer-id': layer.id, opacity: layer.visible ? 1 : 0, 'pointer-events': layer.visible && !layer.locked ? 'auto' : 'none' });
    layer.objects.forEach((obj) => {
      const el = objectMarkup(obj);
      if (el) {
        if (obj.id === selectedObjectId) el.setAttribute('class', 'selected-object');
        group.append(el);
      }
    });
    drawingRoot.append(group);
  }
  overlay.replaceChildren();
  const found = findObject(selectedObjectId);
  if (found && found.layer.visible) {
    const obj = found.object;
    const b = objectBounds(obj);
    if (tool === 'select') {
      overlay.append(makeSvg('rect', { x: b.x - 5, y: b.y - 5, width: b.w + 10, height: b.h + 10, fill: 'none', stroke: '#6ea8ff', 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }));
    }
    if (tool === 'nodes' && obj.type === 'path') {
      obj.points.forEach((p, index) => {
        const handle = makeSvg('circle', { cx: p.x, cy: p.y, r: 7, fill: '#fff', stroke: '#387be8', 'stroke-width': 2, 'data-node-index': index, 'data-node-object': obj.id, 'pointer-events': 'all' });
        overlay.append(handle);
      });
    }
  }
  renderLayers();
}
function moveObject(obj, dx, dy) {
  if (obj.type === 'path') obj.points.forEach(p => { p.x += dx; p.y += dy; });
  else if (obj.type === 'rect') { obj.x += dx; obj.y += dy; }
  else if (obj.type === 'ellipse') { obj.cx += dx; obj.cy += dy; }
}
function addObject(obj) {
  const layer = activeLayer();
  if (!layer || layer.locked) { setStatus('Esta capa está bloqueada.'); return; }
  obj.id = nextId++;
  obj.stroke = color;
  obj.strokeWidth = strokeWidth;
  layer.objects.push(obj);
  selectedObjectId = obj.id;
  render(); persist();
}
function deleteObject(id) {
  const found = findObject(id);
  if (!found || found.layer.locked) return;
  found.layer.objects = found.layer.objects.filter(o => o.id !== found.object.id);
  selectedObjectId = null;
  render(); persist();
}
function clearSelection() { selectedObjectId = null; render(); }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

stage.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  const p = svgPoint(event);
  coordsLabel.textContent = 'X: ' + Math.round(p.x) + ' · Y: ' + Math.round(p.y);
  const node = event.target.closest?.('[data-node-index]');
  const target = event.target.closest?.('[data-object-id]');
  const objectId = target ? Number(target.getAttribute('data-object-id')) : null;
  if (node && tool === 'nodes') {
    const found = findObject(node.getAttribute('data-node-object'));
    if (!found || found.layer.locked) return;
    checkpoint();
    gesture = { type: 'node', objectId: found.object.id, index: Number(node.getAttribute('data-node-index')) };
    stage.setPointerCapture(event.pointerId);
    event.preventDefault(); return;
  }
  if (tool === 'hand' || event.button === 1) {
    gesture = { type: 'pan', startX: event.clientX, startY: event.clientY, view: { ...view } };
    stage.setPointerCapture(event.pointerId); stage.style.cursor = 'grabbing'; event.preventDefault(); return;
  }
  if (tool === 'eraser') {
    if (objectId) { checkpoint(); deleteObject(objectId); setStatus('Objeto vectorial eliminado.'); }
    else setStatus('Toca un trazo o una forma para borrarlo.');
    event.preventDefault(); return;
  }
  if (tool === 'select' || tool === 'nodes') {
    if (objectId) {
      const found = findObject(objectId);
      selectedObjectId = objectId;
      if (tool === 'select' && found && !found.layer.locked) {
        checkpoint();
        gesture = { type: 'move', objectId, last: p };
        stage.setPointerCapture(event.pointerId);
      }
      render();
    } else clearSelection();
    event.preventDefault(); return;
  }
  const layer = activeLayer();
  if (!layer || layer.locked) { setStatus('Selecciona una capa desbloqueada.'); return; }
  checkpoint();
  if (tool === 'pen') {
    gesture = { type: 'draw', object: { id: nextId++, type: 'path', points: [p], stroke: color, strokeWidth, fill: 'none' } };
  } else if (tool === 'rect' || tool === 'ellipse') {
    gesture = { type: 'shape', shapeType: tool, start: p, current: p };
  }
  if (gesture) { stage.setPointerCapture(event.pointerId); event.preventDefault(); }
});
stage.addEventListener('pointermove', (event) => {
  const p = svgPoint(event);
  coordsLabel.textContent = 'X: ' + Math.round(p.x) + ' · Y: ' + Math.round(p.y);
  if (!gesture) return;
  if (gesture.type === 'pan') {
    const rect = stage.getBoundingClientRect();
    const scaleX = view.w / Math.max(1, rect.width), scaleY = view.h / Math.max(1, rect.height);
    view.x = gesture.view.x - (event.clientX - gesture.startX) * scaleX;
    view.y = gesture.view.y - (event.clientY - gesture.startY) * scaleY;
    setViewBox(); return;
  }
  if (gesture.type === 'draw') {
    const pts = gesture.object.points;
    if (distance(pts[pts.length - 1], p) > 1.2) pts.push(p);
    overlay.replaceChildren();
    const preview = makeSvg('path', { d: pathData(gesture.object), fill: 'none', stroke: color, 'stroke-width': strokeWidth, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    overlay.append(preview); return;
  }
  if (gesture.type === 'shape') {
    gesture.current = p;
    overlay.replaceChildren();
    const a = gesture.start, b = p;
    const preview = gesture.shapeType === 'rect'
      ? makeSvg('rect', { x: Math.min(a.x,b.x), y: Math.min(a.y,b.y), width: Math.abs(b.x-a.x), height: Math.abs(b.y-a.y), fill: fillShapes ? color : 'none', stroke: color, 'stroke-width': strokeWidth })
      : makeSvg('ellipse', { cx: (a.x+b.x)/2, cy: (a.y+b.y)/2, rx: Math.abs(b.x-a.x)/2, ry: Math.abs(b.y-a.y)/2, fill: fillShapes ? color : 'none', stroke: color, 'stroke-width': strokeWidth });
    overlay.append(preview); return;
  }
  if (gesture.type === 'move') {
    const found = findObject(gesture.objectId);
    if (found) { moveObject(found.object, p.x - gesture.last.x, p.y - gesture.last.y); gesture.last = p; render(); }
    return;
  }
  if (gesture.type === 'node') {
    const found = findObject(gesture.objectId);
    if (found?.object.type === 'path') { found.object.points[gesture.index] = p; render(); }
  }
});
function finishGesture() {
  if (!gesture) return;
  if (gesture.type === 'draw') {
    const obj = gesture.object;
    if (obj.points.length === 1) obj.points.push({ x: obj.points[0].x + 0.1, y: obj.points[0].y + 0.1 });
    activeLayer().objects.push(obj); selectedObjectId = obj.id; setStatus('Trazo vectorial creado.');
  } else if (gesture.type === 'shape') {
    const a = gesture.start, b = gesture.current || a;
    if (distance(a, b) > 2) {
      const fill = fillShapes ? color : 'none';
      if (gesture.shapeType === 'rect') addObject({ type: 'rect', x: Math.min(a.x,b.x), y: Math.min(a.y,b.y), width: Math.abs(b.x-a.x), height: Math.abs(b.y-a.y), fill });
      else addObject({ type: 'ellipse', cx: (a.x+b.x)/2, cy: (a.y+b.y)/2, rx: Math.abs(b.x-a.x)/2, ry: Math.abs(b.y-a.y)/2, fill });
    }
  } else if (gesture.type === 'move' || gesture.type === 'node') {
    setStatus(gesture.type === 'move' ? 'Objeto movido.' : 'Nodo editado.');
  }
  gesture = null;
  render(); persist();
}
stage.addEventListener('pointerup', finishGesture);
stage.addEventListener('pointercancel', finishGesture);
stage.addEventListener('lostpointercapture', () => { if (gesture?.type === 'pan') { gesture = null; stage.style.cursor = ''; } });
stage.addEventListener('pointerleave', (event) => { if (event.buttons === 0 && gesture && gesture.type !== 'pan') finishGesture(); });

document.querySelectorAll('.tool').forEach((button) => button.addEventListener('click', () => setTool(button.dataset.tool)));
colorInput.addEventListener('input', () => { color = colorInput.value; });
widthInput.addEventListener('input', () => { strokeWidth = Number(widthInput.value); widthValue.textContent = strokeWidth; });
fillInput.addEventListener('change', () => { fillShapes = fillInput.checked; });
$('zoomInBtn').addEventListener('click', () => { const cx = view.x + view.w / 2, cy = view.y + view.h / 2; view.w *= .8; view.h *= .8; view.x = cx - view.w/2; view.y = cy - view.h/2; setViewBox(); });
$('zoomOutBtn').addEventListener('click', () => { const cx = view.x + view.w / 2, cy = view.y + view.h / 2; view.w = Math.min(6400, view.w*1.25); view.h = Math.min(4000, view.h*1.25); view.x = cx - view.w/2; view.y = cy - view.h/2; setViewBox(); });
$('fitBtn').addEventListener('click', () => { view = { x: 0, y: 0, w: 1600, h: 1000 }; setViewBox(); });
stage.addEventListener('wheel', (event) => { event.preventDefault(); const p = svgPoint(event); const factor = event.deltaY < 0 ? .9 : 1.1; view.x = p.x - (p.x-view.x)*factor; view.y = p.y - (p.y-view.y)*factor; view.w *= factor; view.h *= factor; setViewBox(); }, { passive: false });

$('addLayerBtn').addEventListener('click', () => {
  checkpoint(); const id = Math.max(0, ...layers.map(l => l.id)) + 1;
  layers.push({ id, name: 'Capa ' + id, visible: true, locked: false, objects: [] });
  activeLayerId = id; render(); persist(); setStatus('Nueva capa creada.');
});
layersList.addEventListener('click', (event) => {
  const btn = event.target.closest('button[data-action]'); if (!btn) return;
  const layer = layers.find(l => l.id === Number(btn.dataset.layer)); if (!layer) return;
  if (btn.dataset.action === 'activate') { activeLayerId = layer.id; renderLayers(); setStatus('Activa: ' + layer.name); }
  if (btn.dataset.action === 'visibility') { checkpoint(); layer.visible = !layer.visible; render(); persist(); }
});
$('renameLayerBtn').addEventListener('click', () => {
  const layer = activeLayer(); if (!layer) return;
  const name = prompt('Nombre de la capa:', layer.name);
  if (name?.trim()) { checkpoint(); layer.name = name.trim().slice(0, 40); render(); persist(); }
});
$('deleteLayerBtn').addEventListener('click', () => {
  if (layers.length <= 1) { setStatus('Debe quedar al menos una capa.'); return; }
  const layer = activeLayer(); if (!layer) return;
  if (!confirm('¿Eliminar la capa "' + layer.name + '" y todos sus objetos?')) return;
  checkpoint(); layers = layers.filter(l => l.id !== layer.id); activeLayerId = layers[layers.length - 1].id; selectedObjectId = null; render(); persist();
});
$('upLayerBtn').addEventListener('click', () => reorderLayer(1));
$('downLayerBtn').addEventListener('click', () => reorderLayer(-1));
function reorderLayer(dir) {
  const i = layers.findIndex(l => l.id === activeLayerId), j = i + dir;
  if (i < 0 || j < 0 || j >= layers.length) return;
  checkpoint(); [layers[i], layers[j]] = [layers[j], layers[i]]; render(); persist();
}
function restoreSnapshot(raw) {
  const s = JSON.parse(raw); layers = s.layers; activeLayerId = s.activeLayerId; nextId = s.nextId || 1; selectedObjectId = s.selectedObjectId ?? null; render(); persist();
}
function saveSvgString(includeMetadata = true) {
  const layerMarkup = layers.map(layer => '<g id="layer-' + layer.id + '" data-layer-name="' + esc(layer.name) + '" style="display:' + (layer.visible ? 'inline' : 'none') + '">' + layer.objects.map(obj => {
    const attrs = 'stroke="' + esc(obj.stroke || '#202124') + '" stroke-width="' + (obj.strokeWidth || 5) + '" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"';
    if (obj.type === 'path') return '<path d="' + esc(pathData(obj)) + '" fill="none" ' + attrs + '/>';
    if (obj.type === 'rect') return '<rect x="' + obj.x + '" y="' + obj.y + '" width="' + obj.width + '" height="' + obj.height + '" fill="' + esc(obj.fill || 'none') + '" ' + attrs + '/>';
    if (obj.type === 'ellipse') return '<ellipse cx="' + obj.cx + '" cy="' + obj.cy + '" rx="' + obj.rx + '" ry="' + obj.ry + '" fill="' + esc(obj.fill || 'none') + '" ' + attrs + '/>';
    return '';
  }).join('') + '</g>').join('');
  const metadata = includeMetadata ? '<metadata id="vector-studio-project">' + esc(JSON.stringify({ format: 'vector-studio-svg-v1', layers, activeLayerId, nextId })) + '</metadata>' : '';
  return '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">' + metadata + '<rect x="350" y="200" width="900" height="600" fill="#fff" stroke="#ddd"/>' + layerMarkup + '</svg>';
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function saveTextFile(filename, data, mime) {
  try {
    const saved = await Filesystem.writeFile({ path: 'VectorStudio/' + filename, data, directory: Directory.Documents, recursive: true, encoding: Encoding.UTF8 });
    try { await Share.share({ title: filename, text: 'Archivo creado con Vector Studio', url: saved.uri, dialogTitle: 'Guardar o compartir' }); } catch {}
    setStatus('Guardado en Documentos/VectorStudio: ' + filename);
  } catch {
    downloadBlob(new Blob([data], { type: mime }), filename);
    setStatus('Archivo preparado para descargar: ' + filename);
  }
}
$('saveBtn').addEventListener('click', () => saveTextFile('proyecto-vectorial.svg', saveSvgString(true), 'image/svg+xml;charset=utf-8'));
$('exportSvgBtn').addEventListener('click', () => saveTextFile('dibujo-vectorial.svg', saveSvgString(false), 'image/svg+xml;charset=utf-8'));
$('exportPngBtn').addEventListener('click', async () => {
  try {
    const svgText = saveSvgString(false).replace('width="1600" height="1000" viewBox="0 0 1600 1000"', 'width="900" height="600" viewBox="350 200 900 600"');
    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 1800; canvas.height = 1200;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(img,0,0,canvas.width,canvas.height);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL('image/png'); const base64 = dataUrl.split(',')[1];
      try {
        const saved = await Filesystem.writeFile({ path: 'VectorStudio/dibujo.png', data: base64, directory: Directory.Documents, recursive: true });
        try { await Share.share({ title: 'dibujo.png', url: saved.uri, dialogTitle: 'Guardar o compartir PNG' }); } catch {}
        setStatus('PNG guardado en Documentos/VectorStudio.');
      } catch { downloadBlob(await (await fetch(dataUrl)).blob(), 'dibujo.png'); setStatus('PNG exportado.'); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); setStatus('No se pudo generar el PNG.'); };
    img.src = url;
  } catch { setStatus('Error al exportar PNG.'); }
});
$('openBtn').addEventListener('click', () => openInput.click());
openInput.addEventListener('change', async () => {
  const file = openInput.files?.[0]; openInput.value = ''; if (!file) return;
  try {
    const text = await file.text(); const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    if (doc.querySelector('parsererror')) throw new Error('SVG inválido');
    const meta = doc.getElementById('vector-studio-project');
    checkpoint();
    if (meta) {
      const data = JSON.parse(meta.textContent);
      if (data.format !== 'vector-studio-svg-v1' || !Array.isArray(data.layers)) throw new Error('Proyecto no compatible');
      layers = data.layers; activeLayerId = data.activeLayerId || layers[0]?.id || 1; nextId = data.nextId || 1;
    } else {
      const layer = { id: 1, name: file.name.replace(/\.svg$/i, '') || 'SVG importado', visible: true, locked: false, objects: [] };
      for (const el of doc.querySelectorAll('path,rect,circle,ellipse')) {
        if (el.id === 'page' || el.closest('defs')) continue;
        const stroke = el.getAttribute('stroke') || '#202124', sw = Number(el.getAttribute('stroke-width')) || 5, fill = el.getAttribute('fill') || 'none';
        const id = nextId++;
        if (el.tagName.toLowerCase() === 'path') {
          const d = el.getAttribute('d') || '';
          const matches = [...d.matchAll(/(-?\d+(?:\.\d+)?)[ ,]+(-?\d+(?:\.\d+)?)/g)];
          const points = matches.map(m => ({ x: Number(m[1]), y: Number(m[2]) }));
          if (points.length) layer.objects.push({ id, type: 'path', points, stroke, strokeWidth: sw, fill: 'none' });
        } else if (el.tagName.toLowerCase() === 'rect') {
          layer.objects.push({ id, type: 'rect', x: Number(el.getAttribute('x')) || 0, y: Number(el.getAttribute('y')) || 0, width: Number(el.getAttribute('width')) || 0, height: Number(el.getAttribute('height')) || 0, stroke, strokeWidth: sw, fill });
        } else {
          const cx = Number(el.getAttribute('cx')) || 0, cy = Number(el.getAttribute('cy')) || 0;
          const rx = Number(el.getAttribute('rx') || el.getAttribute('r')) || 0, ry = Number(el.getAttribute('ry') || el.getAttribute('r')) || 0;
          layer.objects.push({ id, type: 'ellipse', cx, cy, rx, ry, stroke, strokeWidth: sw, fill });
        }
      }
      layers = [layer]; activeLayerId = 1;
    }
    selectedObjectId = null; render(); persist(); setStatus('Proyecto SVG abierto: ' + file.name);
  } catch (error) { setStatus('No se pudo abrir ese SVG: ' + (error.message || 'formato no compatible')); }
});
$('newBtn').addEventListener('click', () => {
  if (!confirm('¿Crear un proyecto nuevo? Guarda antes si quieres conservar el dibujo actual.')) return;
  checkpoint(); layers = [{ id: 1, name: 'Capa 1', visible: true, locked: false, objects: [] }]; activeLayerId = 1; nextId = 1; selectedObjectId = null; undoStack = []; redoStack = []; view = { x: 0, y: 0, w: 1600, h: 1000 }; setViewBox(); render(); persist(); setStatus('Proyecto nuevo.');
});
document.addEventListener('keydown', (event) => {
  if (event.target.matches('input,textarea,select')) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify({ layers, activeLayerId, nextId, selectedObjectId }));
    restoreSnapshot(undoStack.pop()); setStatus('Deshacer.');
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault();
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify({ layers, activeLayerId, nextId, selectedObjectId }));
    restoreSnapshot(redoStack.pop()); setStatus('Rehacer.');
  } else if (event.key === 'Escape') clearSelection();
  else if (event.key === 'Delete' && selectedObjectId) { checkpoint(); deleteObject(selectedObjectId); }
});
try {
  const saved = localStorage.getItem('vector-studio-project');
  if (saved) {
    const data = JSON.parse(saved);
    if (Array.isArray(data.layers) && data.layers.length) { layers = data.layers; activeLayerId = data.activeLayerId || layers[0].id; nextId = data.nextId || 1; }
  }
} catch {}
setViewBox(); render(); setTool('pen');
