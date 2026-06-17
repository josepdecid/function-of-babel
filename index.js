import "./styles.css";

const GRID_WIDTH = 106;
const GRID_HEIGHT = 17;
const EDITOR_CELL_SIZE = 9;
const CHART_CELL_SIZE = 12;
const CHART_BUFFER_ROWS = 100;
const CHART_VISIBLE_ROWS = 32;
const CHART_PADDING_ROWS = 8;
const CHART_NATURAL_WIDTH = GRID_WIDTH * CHART_CELL_SIZE;
const CANONICAL_K =
  "960939379918958884971672962127852754715004339660129306651505519271702802395266424689642842174350718121267153782770623355993237280874144307891325963941337723487857735749823926629715517173716995165232890538221612403238855866184013235585136048828693337902491454229288667081096184496091705183454067827731551705405381627380967602565625016981482083418783163849115590225610003652351370343874461848378737238198224849863465033159410054974700593138339226497249461751545728366702369745461014655997933798537483143786841806593422227898388722980000748404719";

const state = {
  grid: Array.from({ length: GRID_HEIGHT }, () =>
    Array(GRID_WIDTH).fill(false),
  ),
  currentK: 0n,
  centerY: 0n,
  chartPending: false,
  chartMetrics: null,
  chartDrag: null,
  painting: false,
  paintValue: true,
  visibleStartY: null,
  visibleEndY: null,
};

const editorCanvas = document.getElementById("editor-canvas");
const editorContext = editorCanvas.getContext("2d");
const chartCanvas = document.getElementById("chart-canvas");
const chartContext = chartCanvas.getContext("2d");
const chartViewport = document.getElementById("chart-viewport");
const kInput = document.getElementById("k-input");
const visibleYStartValue = document.getElementById("visible-y-start-value");
const visibleYEndValue = document.getElementById("visible-y-end-value");

function normalizeModulo(value, modulus) {
  const remainder = value % modulus;
  return remainder >= 0n ? remainder : remainder + modulus;
}

function getFunctionBit(x, y) {
  if (x < 0 || x >= GRID_WIDTH) {
    return false;
  }

  const row = normalizeModulo(y, 17n);
  const band = (y - row) / 17n;
  if (band < 0n) {
    return false;
  }

  const shift = BigInt(GRID_HEIGHT * x) + row;
  return ((band >> shift) & 1n) === 1n;
}

function decodeGridFromK(kValue) {
  for (let row = 0; row < GRID_HEIGHT; row += 1) {
    for (let column = 0; column < GRID_WIDTH; column += 1) {
      state.grid[row][column] = getFunctionBit(column, kValue + BigInt(row));
    }
  }
}

function encodeGridToK() {
  let quotient = 0n;
  for (let row = 0; row < GRID_HEIGHT; row += 1) {
    for (let column = 0; column < GRID_WIDTH; column += 1) {
      if (!state.grid[row][column]) {
        continue;
      }
      const shift = BigInt(GRID_HEIGHT * column + row);
      quotient |= 1n << shift;
    }
  }
  return quotient * 17n;
}

function buildReadableDefaultK() {
  const quotient = BigInt(CANONICAL_K) / 17n;
  let mirrored = 0n;

  for (let row = 0; row < GRID_HEIGHT; row += 1) {
    for (let column = 0; column < GRID_WIDTH; column += 1) {
      const sourceShift = BigInt(GRID_HEIGHT * (GRID_WIDTH - 1 - column) + row);
      if (((quotient >> sourceShift) & 1n) === 0n) {
        continue;
      }

      const targetShift = BigInt(GRID_HEIGHT * column + row);
      mirrored |= 1n << targetShift;
    }
  }

  return mirrored * 17n;
}

function drawEditor() {
  const width = GRID_WIDTH * EDITOR_CELL_SIZE;
  const height = GRID_HEIGHT * EDITOR_CELL_SIZE;
  editorCanvas.width = width;
  editorCanvas.height = height;

  editorContext.fillStyle = "#07101d";
  editorContext.fillRect(0, 0, width, height);

  for (let row = 0; row < GRID_HEIGHT; row += 1) {
    for (let column = 0; column < GRID_WIDTH; column += 1) {
      editorContext.fillStyle = state.grid[row][column]
        ? "#f4f7ff"
        : "rgba(244, 247, 255, 0.12)";
      editorContext.fillRect(
        column * EDITOR_CELL_SIZE,
        row * EDITOR_CELL_SIZE,
        EDITOR_CELL_SIZE,
        EDITOR_CELL_SIZE,
      );
    }
  }
}

function getChartTopYForK(kValue) {
  return kValue - BigInt(CHART_PADDING_ROWS);
}

function isInKRange(y) {
  const k = state.currentK;
  return y >= k && y <= k + BigInt(GRID_HEIGHT - 1);
}

function getChartCellColor(enabled, y) {
  if (!enabled) {
    return "rgba(244, 247, 255, 0.08)";
  }
  if (isInKRange(y)) {
    return "#f4f7ff";
  }
  return "rgba(244, 247, 255, 0.42)";
}

function getChartDisplayMetrics() {
  const canvasRect = chartCanvas.getBoundingClientRect();
  const renderRows = state.chartMetrics?.renderRows ?? 1;

  return {
    rect: canvasRect,
    rowHeight: canvasRect.height / renderRows,
  };
}

function resizeChart() {
  const visibleRows = CHART_VISIBLE_ROWS;
  const renderRows = visibleRows + CHART_BUFFER_ROWS * 2;

  state.chartMetrics = {
    width: CHART_NATURAL_WIDTH,
    visibleRows,
    renderRows,
    renderTopY: null,
    renderK: null,
  };

  scheduleChartRender();
  updateVisibleYLabels();
}

function fillChartBackground() {
  chartContext.fillStyle = "#07101d";
  chartContext.fillRect(0, 0, chartCanvas.width, chartCanvas.height);
}

function formatBigInt(value) {
  return value.toString();
}

const MIDDLE_ELLIPSIS = "...";
let textMeasureContext = null;

function getTextMeasureContext() {
  if (!textMeasureContext) {
    const canvas = document.createElement("canvas");
    textMeasureContext = canvas.getContext("2d");
  }
  return textMeasureContext;
}

function measureTextWidth(text, font) {
  const context = getTextMeasureContext();
  context.font = font;
  return context.measureText(text).width;
}

function formatMiddleEllipsis(text, maxWidth, font) {
  if (maxWidth <= 0 || measureTextWidth(text, font) <= maxWidth) {
    return text;
  }

  let startLen = Math.ceil(text.length / 2);
  let endLen = Math.floor(text.length / 2);

  while (startLen > 0 || endLen > 0) {
    const candidate = `${text.slice(0, startLen)}${MIDDLE_ELLIPSIS}${text.slice(text.length - endLen)}`;
    if (measureTextWidth(candidate, font) <= maxWidth) {
      return candidate;
    }

    if (startLen >= endLen && startLen > 0) {
      startLen -= 1;
    } else if (endLen > 0) {
      endLen -= 1;
    } else {
      startLen -= 1;
    }
  }

  return MIDDLE_ELLIPSIS;
}

function setVisibleYLabel(element, fullText) {
  const font = getComputedStyle(element).font;
  const maxWidth = element.clientWidth;
  element.textContent = formatMiddleEllipsis(fullText, maxWidth, font);
  element.title = fullText;
}

function updateVisibleYLabels() {
  if (state.visibleStartY === null || state.visibleEndY === null) {
    return;
  }

  setVisibleYLabel(visibleYStartValue, formatBigInt(state.visibleStartY));
  setVisibleYLabel(visibleYEndValue, formatBigInt(state.visibleEndY));
}

function drawChart() {
  if (!state.chartMetrics) {
    return;
  }

  const visibleRows = state.chartMetrics.visibleRows;
  const renderRows = visibleRows + CHART_BUFFER_ROWS * 2;
  const topFunctionY = state.centerY - BigInt(CHART_BUFFER_ROWS);

  if (
    state.chartMetrics.renderTopY === topFunctionY.toString() &&
    state.chartMetrics.renderK === state.currentK.toString()
  ) {
    updateVisibleRange(visibleRows, topFunctionY);
    return;
  }

  chartCanvas.width = state.chartMetrics.width;
  chartCanvas.height = renderRows * CHART_CELL_SIZE;
  chartCanvas.style.top = `${(-CHART_BUFFER_ROWS / renderRows) * 100}%`;
  fillChartBackground();
  chartCanvas.dataset.anchorY = topFunctionY.toString();
  state.chartMetrics.renderTopY = topFunctionY.toString();
  state.chartMetrics.renderK = state.currentK.toString();

  for (let renderedRow = 0; renderedRow < renderRows; renderedRow += 1) {
    const y = topFunctionY + BigInt(renderedRow);
    const pixelTop = renderedRow * CHART_CELL_SIZE;

    for (let x = 0; x < GRID_WIDTH; x += 1) {
      const enabled = getFunctionBit(x, y);
      chartContext.fillStyle = getChartCellColor(enabled, y);
      chartContext.fillRect(
        x * CHART_CELL_SIZE,
        pixelTop,
        CHART_CELL_SIZE - 1,
        CHART_CELL_SIZE - 1,
      );
    }
  }

  updateVisibleRange(visibleRows, topFunctionY);
}

function updateVisibleRange(visibleRows, topFunctionY) {
  state.visibleStartY = topFunctionY + BigInt(CHART_BUFFER_ROWS);
  state.visibleEndY =
    state.visibleStartY + BigInt(Math.max(visibleRows - 1, 0));
  updateVisibleYLabels();
}

function scheduleChartRender() {
  if (state.chartPending) {
    return;
  }
  state.chartPending = true;
  requestAnimationFrame(() => {
    state.chartPending = false;
    drawChart();
  });
}

function syncKText() {
  kInput.value = state.currentK.toString();
  resizeKInput();
}

function resizeKInput() {
  kInput.style.height = "auto";
  kInput.style.height = `${kInput.scrollHeight}px`;
}

function sanitizeKInput() {
  const { selectionStart, selectionEnd, value } = kInput;
  const sanitized = value.replace(/\D/g, "");
  if (sanitized === value) {
    return;
  }

  const removedBeforeStart = value
    .slice(0, selectionStart)
    .replace(/\d/g, "").length;
  const removedBeforeEnd = value
    .slice(0, selectionEnd)
    .replace(/\d/g, "").length;

  kInput.value = sanitized;
  kInput.setSelectionRange(
    selectionStart - removedBeforeStart,
    selectionEnd - removedBeforeEnd,
  );
}

function loadGridFromCurrentK({ recenter = false } = {}) {
  decodeGridFromK(state.currentK);
  drawEditor();
  if (recenter) {
    state.centerY = getChartTopYForK(state.currentK);
    centerChartOnCurrentY();
  }
  scheduleChartRender();
}

function updateCurrentK(newK, { recenter = false } = {}) {
  state.currentK = newK;
  syncKText();
  loadGridFromCurrentK({ recenter });
}

function syncCurrentKFromGrid() {
  state.currentK = encodeGridToK();
  syncKText();
  scheduleChartRender();
}

function loadKFromText({ recenter = false } = {}) {
  if (!kInput.value) {
    return;
  }

  const parsed = BigInt(kInput.value);
  state.currentK = parsed;
  loadGridFromCurrentK({ recenter });
}

function applyCellFromPoint(clientX, clientY) {
  const rect = editorCanvas.getBoundingClientRect();
  const scaleX = editorCanvas.width / rect.width;
  const scaleY = editorCanvas.height / rect.height;
  const x = Math.floor(((clientX - rect.left) * scaleX) / EDITOR_CELL_SIZE);
  const y = Math.floor(((clientY - rect.top) * scaleY) / EDITOR_CELL_SIZE);

  if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) {
    return;
  }

  if (state.grid[y][x] === state.paintValue) {
    return;
  }

  state.grid[y][x] = state.paintValue;
  drawEditor();
  syncCurrentKFromGrid();
}

function centerChartOnYFromTextarea() {
  if (!kInput.value) {
    return;
  }

  state.centerY = getChartTopYForK(BigInt(kInput.value));
  centerChartOnCurrentY();
  scheduleChartRender();
}

function centerChartOnCurrentY() {
  scheduleChartRender();
}

function shiftChartCenterByRows(rowDelta) {
  if (!rowDelta) {
    return;
  }
  state.centerY += BigInt(rowDelta);
  scheduleChartRender();
}

function shiftChartCenterByPixels(pixelDelta) {
  if (!pixelDelta) {
    return;
  }

  if (!state.chartDrag) {
    state.chartDrag = {
      pointerId: null,
      clientY: 0,
      remainder: 0,
    };
  }

  const totalDelta = state.chartDrag.remainder + pixelDelta;
  const rowHeight = getChartDisplayMetrics().rowHeight;
  const rowDelta = Math.trunc(totalDelta / rowHeight);

  if (rowDelta !== 0) {
    shiftChartCenterByRows(rowDelta);
    state.chartDrag.remainder = totalDelta - rowDelta * rowHeight;
    return;
  }

  state.chartDrag.remainder = totalDelta;
}

function bindChartDrag() {
  chartViewport.addEventListener("pointerdown", (event) => {
    state.chartDrag = {
      pointerId: event.pointerId,
      clientY: event.clientY,
      remainder: 0,
    };
    chartViewport.classList.add("is-dragging");
    chartViewport.setPointerCapture(event.pointerId);
  });

  chartViewport.addEventListener("pointermove", (event) => {
    if (!state.chartDrag || state.chartDrag.pointerId !== event.pointerId) {
      return;
    }

    const { rowHeight } = getChartDisplayMetrics();
    const totalDelta =
      state.chartDrag.remainder + (event.clientY - state.chartDrag.clientY);
    const rowDelta = Math.trunc(totalDelta / rowHeight);

    if (rowDelta !== 0) {
      shiftChartCenterByRows(rowDelta);
      state.chartDrag.clientY += rowDelta * rowHeight;
      state.chartDrag.remainder = totalDelta - rowDelta * rowHeight;
    } else {
      state.chartDrag.remainder = totalDelta;
    }
  });

  const endChartDrag = (event) => {
    if (!state.chartDrag || state.chartDrag.pointerId !== event.pointerId) {
      return;
    }
    state.chartDrag = null;
    chartViewport.classList.remove("is-dragging");
  };

  chartViewport.addEventListener("pointerup", endChartDrag);
  chartViewport.addEventListener("pointercancel", endChartDrag);

  chartViewport.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      shiftChartCenterByPixels(event.deltaY);
    },
    { passive: false },
  );
}

function invertGrid() {
  for (let row = 0; row < GRID_HEIGHT; row += 1) {
    for (let column = 0; column < GRID_WIDTH; column += 1) {
      state.grid[row][column] = !state.grid[row][column];
    }
  }
  drawEditor();
  syncCurrentKFromGrid();
}

function clearGrid() {
  for (let row = 0; row < GRID_HEIGHT; row += 1) {
    state.grid[row].fill(false);
  }
  drawEditor();
  syncCurrentKFromGrid();
}

function fillGrid() {
  for (let row = 0; row < GRID_HEIGHT; row += 1) {
    state.grid[row].fill(true);
  }
  drawEditor();
  syncCurrentKFromGrid();
}

function handleKInput() {
  sanitizeKInput();
  resizeKInput();
  loadKFromText({ recenter: true });
}

function bindEditorInput() {
  editorCanvas.addEventListener("pointerdown", (event) => {
    state.painting = true;
    state.paintValue = !event.shiftKey;
    editorCanvas.setPointerCapture(event.pointerId);
    applyCellFromPoint(event.clientX, event.clientY);
  });

  editorCanvas.addEventListener("pointermove", (event) => {
    if (!state.painting) {
      return;
    }
    applyCellFromPoint(event.clientX, event.clientY);
  });

  const stopPainting = () => {
    state.painting = false;
  };

  editorCanvas.addEventListener("pointerup", stopPainting);
  editorCanvas.addEventListener("pointercancel", stopPainting);
}

function bindControls() {
  document.getElementById("clear-grid").addEventListener("click", clearGrid);
  document.getElementById("fill-grid").addEventListener("click", fillGrid);
  document.getElementById("invert-grid").addEventListener("click", invertGrid);
  document
    .getElementById("center-on-k")
    .addEventListener("click", centerChartOnYFromTextarea);

  kInput.addEventListener("input", handleKInput);
  bindChartDrag();
  window.addEventListener("resize", resizeChart);
}

function initialize() {
  bindEditorInput();
  bindControls();
  updateCurrentK(buildReadableDefaultK(), { recenter: true });
  resizeChart();
  scheduleChartRender();
}

initialize();
