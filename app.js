/**
 * @typedef {{file: File, image: HTMLImageElement}} InputImage
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
 * Draws the image at full size with the detected row changes marked,
 * and returns the guessed scale factor.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLImageElement} image
 * @returns {number | undefined}
 */
function drawOriginal(canvas, image) {
  const width = (canvas.width = image.width);
  const height = (canvas.height = image.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0);
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

const fileInput = /** @type {HTMLInputElement} */ (
  document.getElementById("file-input")
);
const scaleFactorEl = /** @type {HTMLElement} */ (
  document.getElementById("scale-factor")
);
const originalCanvas = /** @type {HTMLCanvasElement} */ (
  document.getElementById("original-canvas")
);
const scaledCanvas = /** @type {HTMLCanvasElement} */ (
  document.getElementById("scaled-canvas")
);

let scaleFactor = 1;

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const {image} = await loadImage(file);
  scaleFactor = drawOriginal(originalCanvas, image) || scaleFactor;
  scaleFactorEl.textContent = String(scaleFactor);
  drawScaled(scaledCanvas, image, scaleFactor);
});
