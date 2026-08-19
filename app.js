/**
 * @typedef {{file: File, image: HTMLImageElement}} InputImage
 */

/**
 * Manual sampling grid
 * @typedef {{offsetX: number, offsetY: number, stepX: number, stepY: number}} Grid
 */

/**
 * @param {File} file
 * @returns {Promise<InputImage>}
 */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.addEventListener("load", () => {
      URL.revokeObjectURL(url);
      resolve({ file, image });
    });
    image.addEventListener("error", (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    });
    image.src = url;
  });
}

/**
 * @param {ImageData} imageData
 * @returns {[number, number][]}
 */
function computeChangeRows(imageData) {
  const rowLen = imageData.width * 4;
  /** @type {[number, number][]} */
  const changeRows = [];
  let lastChangeY = 0;
  for (let y = 1; y < imageData.height; y++) {
    const lastOffset = (y - 1) * rowLen;
    const thisOffset = y * rowLen;
    const nextOffset = (y + 1) * rowLen;
    const lastRow = imageData.data.subarray(lastOffset, thisOffset - 1);
    const row = imageData.data.subarray(thisOffset, nextOffset - 1);
    if (!row.every((v, i) => v === lastRow[i])) {
      changeRows.push([lastChangeY, y]);
      lastChangeY = y;
    }
  }
  return changeRows;
}

/**
 * @template T
 * @param {readonly T[]} arr
 * @returns {[Map<T, number>, number]}
 */
function getCounts(arr) {
  /** @type {Map<T, number>} */
  const counts = new Map();
  let highestCount = 0;
  for (let i = 0; i < arr.length; i++) {
    const key = arr[i];
    const count = (counts.get(key) || 0) + 1;
    counts.set(key, count);
    highestCount = count > highestCount ? count : highestCount;
  }
  return [counts, highestCount];
}

/**
 * @template T
 * @param {readonly T[]} arr
 * @returns {[T | undefined, number]}
 */
function mostCommon(arr) {
  const [counts, highestCount] = getCounts(arr);
  for (const [key, count] of counts) {
    if (count === highestCount) return [key, count];
  }
  return [undefined, 0];
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/**
 * Resizes `canvas` to the image and draws it on white.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLImageElement} image
 * @returns {CanvasRenderingContext2D | null}
 */
function drawOriginal(canvas, image) {
  const width = (canvas.width = image.width);
  const height = (canvas.height = image.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0);
  return ctx;
}

function detectScaleFactor(ctx, width, height) {
  const changeRows = computeChangeRows(ctx.getImageData(0, 0, width, height));
  changeRows.forEach(([y0, y1], i) => {
    ctx.fillStyle = "red";
    ctx.fillRect(width / 2 + (i % 2) * 5, y0, 2, y1 - y0);
  });
  const runs = changeRows.map(([a, b]) => b - a);
  const [mostCommonHeight] = mostCommon(runs);
  return mostCommonHeight;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLImageElement} image
 * @param {number} scaleFactor
 * @returns {void}
 */
function drawScaled(canvas, image, scaleFactor) {
  const width = (canvas.width = image.width / scaleFactor);
  const height = (canvas.height = image.height / scaleFactor);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0, width, height);
}

/**
 * How many samples of `step` fit in `extent` starting at `offset`.
 *
 * @param {number} offset
 * @param {number} step
 * @param {number} extent
 * @returns {number}
 */
function countSamples(offset, step, extent) {
  return Math.max(1, Math.floor((extent - 1 - offset) / step) + 1);
}

/**
 * Point-samples the source image on `grid`, nearest neighbour.
 *
 * @param {ImageData} source
 * @param {Grid} grid
 * @returns {ImageData}
 */
function sampleGrid(source, grid) {
  const { width, height, data } = source;
  const cols = countSamples(grid.offsetX, grid.stepX, width);
  const rows = countSamples(grid.offsetY, grid.stepY, height);
  const out = new ImageData(cols, rows);
  /** @type {number[]} */
  const sourceXs = [];
  for (let i = 0; i < cols; i++) {
    sourceXs.push(clamp(Math.floor(grid.offsetX + i * grid.stepX), 0, width - 1));
  }
  for (let j = 0; j < rows; j++) {
    const sy = clamp(Math.floor(grid.offsetY + j * grid.stepY), 0, height - 1);
    for (let i = 0; i < cols; i++) {
      const si = (sy * width + sourceXs[i]) * 4;
      const di = (j * cols + i) * 4;
      out.data[di] = data[si];
      out.data[di + 1] = data[si + 1];
      out.data[di + 2] = data[si + 2];
      out.data[di + 3] = data[si + 3];
    }
  }
  return out;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Grid} grid
 * @param {number} width
 * @param {number} height
 * @returns {void}
 */
function drawGridOverlay(ctx, grid, width, height) {
  const cols = countSamples(grid.offsetX, grid.stepX, width);
  const rows = countSamples(grid.offsetY, grid.stepY, height);
  ctx.fillStyle = grid.stepX <= 1 || grid.stepY <= 1 ? "rgba(255, 0, 0, 0.5)" : "red";
  for (let j = 0; j < rows; j++) {
    const sy = clamp(Math.floor(grid.offsetY + j * grid.stepY), 0, height - 1);
    for (let i = 0; i < cols; i++) {
      const sx = clamp(Math.floor(grid.offsetX + i * grid.stepX), 0, width - 1);
      ctx.fillRect(sx, sy, 1, 1);
    }
  }
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatNumber(value) {
  return String(Math.round(value * 100) / 100);
}

const fileInput = /** @type {HTMLInputElement} */ (
  document.getElementById("file-input")
);
const advancedToggle = /** @type {HTMLInputElement} */ (
  document.getElementById("advanced-toggle")
);
const advancedPanel = /** @type {HTMLElement} */ (
  document.getElementById("advanced")
);
const linkXY = /** @type {HTMLInputElement} */ (
  document.getElementById("link-xy")
);
const offsetXInput = /** @type {HTMLInputElement} */ (
  document.getElementById("offset-x")
);
const offsetYInput = /** @type {HTMLInputElement} */ (
  document.getElementById("offset-y")
);
const stepXInput = /** @type {HTMLInputElement} */ (
  document.getElementById("step-x")
);
const stepYInput = /** @type {HTMLInputElement} */ (
  document.getElementById("step-y")
);
const statusEl = /** @type {HTMLElement} */ (document.getElementById("status"));
const originalCanvas = /** @type {HTMLCanvasElement} */ (
  document.getElementById("original-canvas")
);
const scaledCanvas = /** @type {HTMLCanvasElement} */ (
  document.getElementById("scaled-canvas")
);

const sourceCanvas = document.createElement("canvas");

/** @type {HTMLImageElement | null} */
let sourceImage = null;
/** @type {ImageData | null} */
let sourceData = null;
let scaleFactor = 1;

/**
 * @param {HTMLImageElement} image
 * @returns {ImageData | null}
 */
function readSourceData(image) {
  sourceCanvas.width = image.width;
  sourceCanvas.height = image.height;
  const ctx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, image.width, image.height);
}

/**
 * @returns {Grid}
 */
function readGrid() {
  const width = sourceImage ? sourceImage.width : 1;
  const height = sourceImage ? sourceImage.height : 1;
  return {
    offsetX: clamp(Number(offsetXInput.value) || 0, 0, width - 1),
    offsetY: clamp(Number(offsetYInput.value) || 0, 0, height - 1),
    stepX: Math.max(1, Number(stepXInput.value) || 1),
    stepY: Math.max(1, Number(stepYInput.value) || 1),
  };
}

function render() {
  advancedPanel.hidden = !advancedToggle.checked;
  if (!(sourceImage && sourceData)) {
    statusEl.textContent = "Pick an image to get started.";
    return;
  }
  const ctx = drawOriginal(originalCanvas, sourceImage);
  if (!ctx) return;
  if (!advancedToggle.checked) {
    scaleFactor =
      detectScaleFactor(ctx, sourceImage.width, sourceImage.height) ||
      scaleFactor;
    drawScaled(scaledCanvas, sourceImage, scaleFactor);
    statusEl.textContent = `Scale factor guess: ${formatNumber(scaleFactor)}×`;
    return;
  }
  const grid = readGrid();
  drawGridOverlay(ctx, grid, sourceImage.width, sourceImage.height);
  const out = sampleGrid(sourceData, grid);
  scaledCanvas.width = out.width;
  scaledCanvas.height = out.height;
  scaledCanvas.getContext("2d")?.putImageData(out, 0, 0);
  statusEl.textContent =
    `Sampling from (${formatNumber(grid.offsetX)}, ${formatNumber(grid.offsetY)})` +
    ` every ${formatNumber(grid.stepX)} x ${formatNumber(grid.stepY)} px` +
    ` -> ${out.width} x ${out.height}`;
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const { image } = await loadImage(file);
  sourceImage = image;
  sourceData = readSourceData(image);
  // Start with sensible guess
  const ctx = drawOriginal(originalCanvas, image);
  scaleFactor = (ctx && detectScaleFactor(ctx, image.width, image.height)) || scaleFactor;
  stepXInput.value = stepYInput.value = String(scaleFactor);
  offsetXInput.value = offsetYInput.value = "0";
  render();
});

advancedToggle.addEventListener("change", render);

for (const input of [offsetXInput, offsetYInput, stepXInput, stepYInput]) {
  input.addEventListener("input", () => {
    if (linkXY.checked) {
      if (input === stepXInput) stepYInput.value = stepXInput.value;
      else if (input === stepYInput) stepXInput.value = stepYInput.value;
    }
    render();
  });
}

render();
