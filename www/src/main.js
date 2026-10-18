import './style.css';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const $ = (id) => document.getElementById(id);
const fileInput = $('fileInput');
const chooseBtn = $('chooseBtn');
const convertBtn = $('convertBtn');
const fileList = $('fileList');
const quality = $('quality');
const notice = $('notice');
const progressWrap = $('progressWrap');
const statusText = $('status');
const percentText = $('percent');
const progressBar = $('progressBar');
const resultsSection = $('resultsSection');
const resultsNode = $('results');
const resultCount = $('resultCount');

let selectedFiles = [];
let convertedFiles = [];
let ffmpeg;
let ffmpegReady = false;
let busy = false;

const formatSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

function safeName(name) {
  return name.replace(/\\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'audio';
}

function setNotice(message, type = '') {
  notice.textContent = message;
  notice.className = 'notice' + (type ? ' ' + type : '');
}

function renderFiles() {
  fileList.replaceChildren();
  if (!selectedFiles.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Aún no has seleccionado ningún audio.';
    fileList.append(empty);
    convertBtn.disabled = true;
    return;
  }
  selectedFiles.forEach((file, index) => {
    const row = document.createElement('div');
    row.className = 'file-row';
    const badge = document.createElement('span');
    badge.className = 'file-badge';
    badge.textContent = 'MP3';
    const info = document.createElement('div');
    info.className = 'file-info';
    const name = document.createElement('strong');
    name.textContent = file.name;
    const size = document.createElement('span');
    size.textContent = formatSize(file.size);
    info.append(name, size);
    const remove = document.createElement('button');
    remove.className = 'remove';
    remove.type = 'button';
    remove.setAttribute('aria-label', 'Quitar ' + file.name);
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      selectedFiles.splice(index, 1);
      renderFiles();
    });
    row.append(badge, info, remove);
    fileList.append(row);
  });
  convertBtn.disabled = busy;
}

chooseBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const incoming = Array.from(fileInput.files || []).filter((f) =>
    f.name.toLowerCase().endsWith('.mp3') || f.type === 'audio/mpeg'
  );
  const existing = new Set(selectedFiles.map((f) => f.name + ':' + f.size + ':' + f.lastModified));
  for (const file of incoming) {
    const key = file.name + ':' + file.size + ':' + file.lastModified;
    if (!existing.has(key)) selectedFiles.push(file);
  }
  fileInput.value = '';
  convertedFiles = [];
  resultsSection.hidden = true;
  renderFiles();
  setNotice(incoming.length ? 'Selecciona Convertir a OGG cuando estés listo.' : 'Elige archivos MP3 válidos.', incoming.length ? '' : 'error');
});

async function getFFmpeg() {
  if (ffmpegReady) return ffmpeg;
  if (!ffmpeg) {
    ffmpeg = new FFmpeg();
    ffmpeg.on('progress', ({ progress }) => {
      const value = Math.max(0, Math.min(100, Math.round(progress * 100)));
      percentText.textContent = value + '%';
      progressBar.style.width = value + '%';
    });
    ffmpeg.on('log', ({ message }) => {
      if (message.includes('Error') || message.includes('error')) console.warn('[FFmpeg]', message);
    });
  }
  statusText.textContent = 'Iniciando motor local…';
  await ffmpeg.load({
    coreURL: new URL('ffmpeg/ffmpeg-core.js', document.baseURI).href,
    wasmURL: new URL('ffmpeg/ffmpeg-core.wasm', document.baseURI).href
  });
  ffmpegReady = true;
  return ffmpeg;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function saveAndShare(item, button) {
  button.disabled = true;
  button.textContent = 'Preparando…';
  try {
    const base64 = bytesToBase64(item.data);
    const saved = await Filesystem.writeFile({
      path: 'AudioOGG/' + item.name,
      data: base64,
      directory: Directory.Documents,
      recursive: true
    });
    await Share.share({
      title: item.name,
      text: 'Audio convertido a OGG',
      url: saved.uri,
      dialogTitle: 'Guardar o compartir archivo OGG'
    });
    setNotice('Archivo guardado en Documentos/AudioOGG. Puedes compartirlo o guardarlo en otra ubicación.', 'success');
  } catch (error) {
    console.error(error);
    setNotice('No se pudo guardar o compartir. Comprueba el espacio disponible e inténtalo otra vez.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Guardar / compartir';
  }
}

function renderResults() {
  resultsNode.replaceChildren();
  resultCount.textContent = convertedFiles.length + (convertedFiles.length === 1 ? ' archivo' : ' archivos');
  convertedFiles.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'result-row';
    const icon = document.createElement('span');
    icon.className = 'ogg-badge';
    icon.textContent = 'OGG';
    const info = document.createElement('div');
    info.className = 'file-info';
    const name = document.createElement('strong');
    name.textContent = item.name;
    const size = document.createElement('span');
    size.textContent = formatSize(item.data.length);
    info.append(name, size);
    const save = document.createElement('button');
    save.className = 'save-btn';
    save.type = 'button';
    save.textContent = 'Guardar / compartir';
    save.addEventListener('click', () => saveAndShare(item, save));
    row.append(icon, info, save);
    resultsNode.append(row);
  });
  resultsSection.hidden = convertedFiles.length === 0;
}

convertBtn.addEventListener('click', async () => {
  if (busy || !selectedFiles.length) return;
  busy = true;
  convertedFiles = [];
  resultsSection.hidden = true;
  progressWrap.hidden = false;
  convertBtn.disabled = true;
  chooseBtn.disabled = true;
  quality.disabled = true;
  progressBar.style.width = '0%';
  percentText.textContent = '0%';
  setNotice('Procesando en este teléfono. No cierres la aplicación.');
  try {
    const engine = await getFFmpeg();
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      statusText.textContent = 'Convirtiendo ' + (i + 1) + ' de ' + selectedFiles.length + ': ' + file.name;
      const inputName = 'source-' + i + '.mp3';
      const outputName = 'converted-' + i + '.ogg';
      await engine.writeFile(inputName, await fetchFile(file));
      const result = await engine.exec([
        '-hide_banner', '-i', inputName, '-vn',
        '-c:a', 'libvorbis', '-q:a', String(quality.value),
        '-map_metadata', '-1', '-y', outputName
      ]);
      if (result !== 0) throw new Error('FFmpeg no pudo convertir ' + file.name);
      const data = await engine.readFile(outputName);
      if (!(data instanceof Uint8Array) || data.length < 4) throw new Error('El archivo OGG resultó vacío.');
      convertedFiles.push({ name: safeName(file.name) + '.ogg', data });
      await engine.deleteFile(inputName).catch(() => {});
      await engine.deleteFile(outputName).catch(() => {});
      percentText.textContent = Math.round(((i + 1) / selectedFiles.length) * 100) + '%';
      progressBar.style.width = percentText.textContent;
    }
    statusText.textContent = '¡Conversión terminada!';
    renderResults();
    setNotice('Listo. Los archivos OGG se generaron en el dispositivo.', 'success');
  } catch (error) {
    console.error(error);
    statusText.textContent = 'No se pudo completar la conversión.';
    setNotice('Error al convertir. Comprueba que el archivo sea un MP3 válido y vuelve a intentarlo. ' + (error?.message || ''), 'error');
  } finally {
    busy = false;
    convertBtn.disabled = selectedFiles.length === 0;
    chooseBtn.disabled = false;
    quality.disabled = false;
  }
});
