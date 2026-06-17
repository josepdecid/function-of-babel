import "./styles.css";

const GRID_WIDTH = 106;
const GRID_HEIGHT = 17;
const EDITOR_CELL_SIZE = 9;
const CHART_CELL_SIZE = 12;
const AXIS_WIDTH = 132;
const CHART_BUFFER_ROWS = 100;
const CHART_VISIBLE_ROWS = 24;
const CHART_PADDING_ROWS = 4;
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
};

const editorCanvas = document.getElementById("editor-canvas");
const editorContext = editorCanvas.getContext("2d");
const chartCanvas = document.getElementById("chart-canvas");
const chartContext = chartCanvas.getContext("2d");
const chartViewport = document.getElementById("chart-viewport");
const chartSpacer = document.getElementById("chart-spacer");
const chartTooltip = document.getElementById("chart-tooltip");
const kInput = document.getElementById("k-input");
const visibleRange = document.getElementById("visible-range");

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

function resizeChart() {
  const viewportWidth = chartViewport.clientWidth;
  const targetWidth = Math.max(
    viewportWidth,
    AXIS_WIDTH + GRID_WIDTH * CHART_CELL_SIZE,
  );
  const visibleRows = CHART_VISIBLE_ROWS;
  const renderRows = visibleRows + CHART_BUFFER_ROWS * 2;

  chartSpacer.style.minWidth = `${targetWidth}px`;

  state.chartMetrics = {
    width: targetWidth,
    visibleRows,
    renderRows,
    renderTopY: null,
    renderK: null,
  };

  scheduleChartRender();
}

function fillChartBackground() {
  chartContext.fillStyle = "#07101d";
  chartContext.fillRect(0, 0, chartCanvas.width, chartCanvas.height);
}

function formatBigInt(value) {
  return value.toString();
}

function formatAxisValue(value) {
  const sign = value < 0n ? "-" : "";
  const digits = (value < 0n ? -value : value).toString();
  if (digits.length <= 3) {
    return `${sign}${digits}`;
  }
  return `${sign}...${digits.slice(-3)}`;
}

function formatRangeValue(value) {
  const text = value.toString();
  if (text.length <= 36) {
    return text;
  }
  return `${text.slice(0, 16)}...${text.slice(-12)}`;
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
  chartCanvas.style.width = `${state.chartMetrics.width}px`;
  chartCanvas.style.height = `${renderRows * CHART_CELL_SIZE}px`;
  chartCanvas.style.top = `${-CHART_BUFFER_ROWS * CHART_CELL_SIZE}px`;
  fillChartBackground();
  chartCanvas.dataset.anchorY = topFunctionY.toString();
  state.chartMetrics.renderTopY = topFunctionY.toString();
  state.chartMetrics.renderK = state.currentK.toString();

  chartContext.fillStyle = "rgba(255, 255, 255, 0.08)";
  chartContext.fillRect(AXIS_WIDTH - 1, 0, 1, chartCanvas.height);

  for (let renderedRow = 0; renderedRow < renderRows; renderedRow += 1) {
    const y = topFunctionY + BigInt(renderedRow);
    const pixelTop = renderedRow * CHART_CELL_SIZE;
    const rowModulo = normalizeModulo(y, 4n);

    if (rowModulo === 0n) {
      chartContext.strokeStyle = "rgba(166, 198, 255, 0.12)";
      chartContext.beginPath();
      chartContext.moveTo(0, pixelTop + 0.5);
      chartContext.lineTo(chartCanvas.width, pixelTop + 0.5);
      chartContext.stroke();

      chartContext.fillStyle = "#a3b2d5";
      chartContext.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
      chartContext.textBaseline = "middle";
      chartContext.fillText(
        formatAxisValue(y),
        8,
        pixelTop + CHART_CELL_SIZE / 2,
      );
    }

    for (let x = 0; x < GRID_WIDTH; x += 1) {
      const enabled = getFunctionBit(x, y);
      chartContext.fillStyle = getChartCellColor(enabled, y);
      chartContext.fillRect(
        AXIS_WIDTH + x * CHART_CELL_SIZE,
        pixelTop,
        CHART_CELL_SIZE - 1,
        CHART_CELL_SIZE - 1,
      );
    }
  }

  updateVisibleRange(visibleRows, topFunctionY);
}

function updateVisibleRange(visibleRows, topFunctionY) {
  const startY = topFunctionY + BigInt(CHART_BUFFER_ROWS);
  const endY = startY + BigInt(Math.max(visibleRows - 1, 0));
  visibleRange.textContent = `Visible y: ${formatRangeValue(startY)} to ${formatRangeValue(endY)}`;
  visibleRange.title = `${formatBigInt(startY)} to ${formatBigInt(endY)}`;
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

function hideChartTooltip() {
  chartTooltip.hidden = true;
}

function showChartTooltip(text, clientX, clientY) {
  const panelRect = chartTooltip.offsetParent.getBoundingClientRect();
  chartTooltip.hidden = false;
  chartTooltip.textContent = text;

  const offset = 14;
  const maxLeft = panelRect.width - chartTooltip.offsetWidth;
  const left = Math.max(
    0,
    Math.min(clientX - panelRect.left + offset, maxLeft),
  );
  const preferredTop = clientY - panelRect.top + offset;
  const top = Math.max(
    0,
    Math.min(preferredTop, panelRect.height - chartTooltip.offsetHeight),
  );

  chartTooltip.style.left = `${left}px`;
  chartTooltip.style.top = `${top}px`;
}

function getHoveredAxisY(clientX, clientY) {
  if (!state.chartMetrics) {
    return null;
  }

  const canvasRect = chartCanvas.getBoundingClientRect();
  if (
    clientX < canvasRect.left ||
    clientX > canvasRect.right ||
    clientY < canvasRect.top ||
    clientY > canvasRect.bottom
  ) {
    return null;
  }

  const x = clientX - canvasRect.left;
  if (x > AXIS_WIDTH) {
    return null;
  }

  const renderedRow = Math.floor((clientY - canvasRect.top) / CHART_CELL_SIZE);
  if (renderedRow < 0 || renderedRow >= state.chartMetrics.renderRows) {
    return null;
  }

  const topFunctionY = state.centerY - BigInt(CHART_BUFFER_ROWS);
  const y = topFunctionY + BigInt(renderedRow);
  return normalizeModulo(y, 4n) === 0n ? y : null;
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
  hideChartTooltip();
  scheduleChartRender();
}

function shiftChartCenterByRows(rowDelta) {
  if (!rowDelta) {
    return;
  }
  state.centerY += BigInt(rowDelta);
  hideChartTooltip();
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
  const rowDelta = Math.trunc(totalDelta / CHART_CELL_SIZE);

  if (rowDelta !== 0) {
    shiftChartCenterByRows(rowDelta);
    state.chartDrag.remainder = totalDelta - rowDelta * CHART_CELL_SIZE;
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
    hideChartTooltip();
  });

  chartViewport.addEventListener("pointermove", (event) => {
    if (state.chartDrag && state.chartDrag.pointerId === event.pointerId) {
      const totalDelta =
        state.chartDrag.remainder + (event.clientY - state.chartDrag.clientY);
      const rowDelta = Math.trunc(totalDelta / CHART_CELL_SIZE);

      if (rowDelta !== 0) {
        shiftChartCenterByRows(rowDelta);
        state.chartDrag.clientY += rowDelta * CHART_CELL_SIZE;
        state.chartDrag.remainder = totalDelta - rowDelta * CHART_CELL_SIZE;
      } else {
        state.chartDrag.remainder = totalDelta;
      }
      return;
    }

    const hoveredY = getHoveredAxisY(event.clientX, event.clientY);
    if (hoveredY === null) {
      hideChartTooltip();
      return;
    }
    showChartTooltip(formatBigInt(hoveredY), event.clientX, event.clientY);
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
  chartViewport.addEventListener("pointerleave", (event) => {
    if (state.chartDrag && state.chartDrag.pointerId === event.pointerId) {
      return;
    }
    hideChartTooltip();
  });

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
