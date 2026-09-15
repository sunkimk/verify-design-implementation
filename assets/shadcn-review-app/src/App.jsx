import {canEditQueuedScreen, resolveQueuedScreen, ReviewQueue} from "./lib/batch-queue.mjs";
import {structuredReport, markdownReport} from "./lib/export-text.mjs";
import {layoutScreensWithAdd, layoutScreens, collectExportParts, pageFileName} from "./lib/multi-page.mjs";
import {buildZip} from "./lib/zip.mjs";
import {autoConfirmsPair, sortPairRows, canRunPair} from "./lib/pairing-policy.mjs";
import {rankCandidates} from "./lib/candidate-ranking.mjs";
import React, {useEffect, useMemo, useRef, useState, useLayoutEffect} from "react";
import {createPortal} from "react-dom";
import {mergeDraftSources} from "./lib/batch-intake.mjs";
import {draftKey, pinRows, selectDraftSource, confirmDraftPair} from "./lib/draft-rows.mjs";
import {HugeiconsIcon} from "@hugeicons/react";
// Per-icon subpath imports, never the package barrel. `@hugeicons/core-free-icons`'s index
// re-exports 6031 separate modules, and rollup opens every one of them to tree-shake: the
// production build spent over ten minutes at ~0% CPU walking that directory. Deep imports pull
// only the icons actually used and bring the build back to seconds.
import AiSearch01Icon from "@hugeicons/core-free-icons/AiSearch01Icon";
import ArrowReloadHorizontalIcon from "@hugeicons/core-free-icons/ArrowReloadHorizontalIcon";
import ArrowTurnBackwardIcon from "@hugeicons/core-free-icons/ArrowTurnBackwardIcon";
import ArrowTurnForwardIcon from "@hugeicons/core-free-icons/ArrowTurnForwardIcon";
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon";
import CheckListIcon from "@hugeicons/core-free-icons/CheckListIcon";
import ContrastIcon from "@hugeicons/core-free-icons/ContrastIcon";
import CursorMagicSelection01Icon from "@hugeicons/core-free-icons/CursorMagicSelection01Icon";
import CursorRectangleSelection01Icon from "@hugeicons/core-free-icons/CursorRectangleSelection01Icon";
import DashboardSquare02Icon from "@hugeicons/core-free-icons/DashboardSquare02Icon";
import Delete02Icon from "@hugeicons/core-free-icons/Delete02Icon";
import FilterHorizontalIcon from "@hugeicons/core-free-icons/FilterHorizontalIcon";
import FitToScreenIcon from "@hugeicons/core-free-icons/FitToScreenIcon";
import FloppyDiskIcon from "@hugeicons/core-free-icons/FloppyDiskIcon";
import HistoryIcon from "@hugeicons/core-free-icons/HistoryIcon";
import Layers01Icon from "@hugeicons/core-free-icons/Layers01Icon";
import Loading03Icon from "@hugeicons/core-free-icons/Loading03Icon";
import MapsIcon from "@hugeicons/core-free-icons/MapsIcon";
import MinusSignCircleIcon from "@hugeicons/core-free-icons/MinusSignCircleIcon";
import PencilEdit01Icon from "@hugeicons/core-free-icons/PencilEdit01Icon";
import PlusSignCircleIcon from "@hugeicons/core-free-icons/PlusSignCircleIcon";
import PlusSignIcon from "@hugeicons/core-free-icons/PlusSignIcon";
import Upload04Icon from "@hugeicons/core-free-icons/Upload04Icon";
import Image02Icon from "@hugeicons/core-free-icons/Image02Icon";
import ViewIcon from "@hugeicons/core-free-icons/ViewIcon";
import ViewOffIcon from "@hugeicons/core-free-icons/ViewOffIcon";

// Single icon set across the workbench. HugeIcons replaced Lucide and the four hand-rolled SVGs that
// predated it, so every glyph now comes from one family at one stroke weight.
function Icon({icon, className, size = 18, ...rest}) {
  return <HugeiconsIcon icon={icon} size={size} className={className} strokeWidth={1.7} aria-hidden="true" {...rest} />;
}
import {Button} from "./components/ui/button";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "./components/ui/card";
import {Badge} from "./components/ui/badge";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "./components/ui/tabs";
import {Input} from "./components/ui/input";
import {Label} from "./components/ui/label";
import {Textarea} from "./components/ui/textarea";

const PRAISE_TEMPLATES = [
  "🎉 这次还原真的很顶！布局、节奏和细节都稳稳接住了设计稿，完成度肉眼可见，给开发狠狠点个赞！👏✨",
  "👏 必须夸一下这次实现：不仅整体还原在线，细节也处理得很扎实。设计意图完全 get 到了，合作体验满分！💯🚀",
  "✨ 这版实现太让人省心了！从页面结构到视觉细节都对得很准，能感受到开发对设计稿的认真理解，辛苦啦！🙌",
  "🚀 还原度直接拉满！画面节奏、组件关系和关键细节都处理得很漂亮，这波设计落地必须给开发加鸡腿！🍗🎊",
  "💚 看到这一版真的很开心：设计稿里的重点几乎都被完整保留下来了，既准确又细致，开发同学太靠谱了！👏",
  "🥳 这次联调可以轻松收工啦！实现效果和设计预期高度一致，细节经得住看，感谢开发把体验稳稳落地！✨",
  "🌟 高质量交付认证！页面整体非常贴近设计稿，细节也没有敷衍，专业、顺畅、让人放心，必须公开表扬！🙌🎉",
];

const PAIRS = {
  "design-implementation": {left: "design", right: "implementation", label: "设计稿 ↔ 实现", meaning: "设计到实现的最终差异"},
};

const ISSUE_TYPES = ["布局", "内容", "状态", "视觉", "可用性"];
const ISSUE_SEVERITIES = ["P0", "P1", "P2"];
// requestAnimationFrame never fires while the document is hidden, so awaiting it deadlocked the
// whole detection at the first phase whenever the reviewer switched tabs after pressing 开始 AI 检测:
// stuck at 10%, no error, no timeout. Race the frame against a timer so a hidden tab still advances.
function paintFrame() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => { if (settled) return; settled = true; resolve(); };
    window.requestAnimationFrame(finish);
    window.setTimeout(finish, 32);
  });
}

const ANALYSIS_PHASES = {
  prepare: {progress: 10, eyebrow: "01 · 证据就位", title: "先把两张界面摆到同一把尺子上", detail: "正在核对视口、比例与截图边界，避免把缩放差异误判成问题。"},
  pixels: {progress: 28, eyebrow: "02 · 证据定位", title: "正在追踪那些“看起来差不多”的细节", detail: "先定位布局、间距、容器和局部视觉变化，为 AI 提供精确线索。"},
  ai: {progress: 72, eyebrow: "03 · AI 视觉检测", title: "AI 正在逐项核对界面", detail: "同步复查文案、图标、字号字重、间距、容器和插画比例，并排除无证据误报。这一步通常需要 20–40 秒。"},
  merge: {progress: 94, eyebrow: "04 · 整理问题", title: "正在把差异翻译成开发能直接改的问题", detail: "合并相同根因、收紧标注范围，并生成设计预期与最小修改要求。"},
  done: {progress: 100, eyebrow: "完成", title: "走查完成，问题清单已经整理好", detail: "正在把标注和筛选结果放回工作台。"},
};

// The AI call is the only genuinely slow step and it reports nothing back until it returns, so a
// fixed percentage sat frozen at 72% for the whole ~30s wait and read as a hung tool. Ease toward a
// ceiling instead: the curve is asymptotic, so the number keeps moving without ever claiming the
// phase finished. This is progress information, not a decorative animation, and it adds no spinner,
// track, or elapsed-time footer.
const AI_EXPECTED_MS = 30000;
const AI_PROGRESS_CEILING = 90;

function phaseProgress(phase, aiElapsedMs) {
  const base = ANALYSIS_PHASES[phase].progress;
  if (phase !== "ai") return base;
  return Math.round(base + (AI_PROGRESS_CEILING - base) * (1 - Math.exp(-aiElapsedMs / AI_EXPECTED_MS)));
}

function codexBridgeConfig() {
  if (typeof window === "undefined") return null;
  const storageKey = "zymix-codex-bridge-session";
  const injected = window.__ZYMIX_CODEX_BRIDGE__;
  if (injected?.token && /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i.test(injected.origin || "")) {
    const config = {origin: injected.origin.replace(/\/$/, ""), token: injected.token};
    try { window.sessionStorage.setItem(storageKey, JSON.stringify(config)); } catch {}
    return config;
  }
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const token = hash.get("bridgeToken");
  if (token) {
    const requestedOrigin = hash.get("bridgeOrigin");
    const origin = requestedOrigin || (/^https?:\/\/127\.0\.0\.1(?::\d+)?$/i.test(window.location.origin) ? window.location.origin : "http://127.0.0.1:43127");
    const config = {origin: origin.replace(/\/$/, ""), token};
    try { window.sessionStorage.setItem(storageKey, JSON.stringify(config)); } catch {}
    return config;
  }
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(storageKey) || "null");
    if (saved?.token && /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i.test(saved.origin || "")) return saved;
  } catch {}
  return null;
}

async function requestCodexReview(config, payload) {
  const response = await fetch(`${config.origin}/api/review`, {
    method: "POST",
    headers: {"Content-Type": "application/json", "X-Zymix-Bridge-Token": config.token},
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Codex 复核失败（${response.status}）`);
  return result;
}

async function requestCodexIssueFill(config, payload) {
  const response = await fetch(`${config.origin}/api/issue-review`, {
    method: "POST",
    headers: {"Content-Type": "application/json", "X-Zymix-Bridge-Token": config.token},
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `AI 快速识别失败（${response.status}）`);
  return result;
}

function createAiSourcePreview(source) {
  if (!source?.image) return null;
  const scale = Math.min(1, 720 / source.width, 1440 / source.height);
  const previewWidth = Math.max(1, Math.round(source.width * scale));
  const previewHeight = Math.max(1, Math.round(source.height * scale));
  if (scale >= .995) {
    return {src: source.src, previewWidth, previewHeight, originalWidth: source.width, originalHeight: source.height, scale: 1,
      baseline: source.baseline || null};
  }
  const canvas = document.createElement("canvas"), context = canvas.getContext("2d");
  canvas.width = previewWidth; canvas.height = previewHeight;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source.image, 0, 0, previewWidth, previewHeight);
  return {
    src: canvas.toDataURL("image/webp", .9),
    previewWidth,
    previewHeight,
    originalWidth: source.width,
    originalHeight: source.height,
    baseline: source.baseline || null,
    scale,
  };
}

function createAiIssueCrop(source, location) {
  if (!source?.image || !location) return null;
  const bounds = normalizedLocation(source, location);
  const scale = Math.min(1, 720 / bounds.width, 720 / bounds.height);
  const previewWidth = Math.max(1, Math.round(bounds.width * scale));
  const previewHeight = Math.max(1, Math.round(bounds.height * scale));
  const canvas = document.createElement("canvas"), context = canvas.getContext("2d");
  canvas.width = previewWidth; canvas.height = previewHeight;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source.image, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, previewWidth, previewHeight);
  return {src: canvas.toDataURL("image/webp", .92), previewWidth, previewHeight, bounds};
}

function compactReportsForAi(reports) {
  return Object.fromEntries(Object.entries(reports || {}).map(([key, report]) => [key, report ? {
    verdict: report.verdict,
    metrics: report.metrics,
    issues: (report.issues || []).map((item) => ({
      id: item.id,
      category: item.category,
      severity: item.severity,
      title: item.title,
      expected: item.expected,
      actual: item.actual,
      delta: item.delta,
      leftLocation: issueLocation(item, "left"),
      rightLocation: issueLocation(item, "right"),
    })),
  } : null]));
}

function normalizedIssueType(item) {
  // A category the model already stated in canonical terms is the answer. Re-deriving it from the
  // wording made the filter disagree with the card it filters: an issue whose category was 状态 but
  // whose title said "群聊照片操作态" matched 操作 first and was filed under 可用性, so the reviewer
  // saw 可用性 1 in the filter row and 状态 on the card and had to guess how they related.
  if (ISSUE_TYPES.includes(item?.category)) return item.category;
  const source = `${item?.category || ""} ${item?.title || ""} ${item?.summary || ""}`;
  if (/可用性|可访问|点击|触控|键盘|反馈|操作/.test(source)) return "可用性";
  if (/状态|选中|未选|禁用|加载|交互/.test(source)) return "状态";
  if (/内容|文案|字段|数量|顺序|图标|缺失|新增/.test(source)) return "内容";
  if (/布局|位置|尺寸|间距|栅格|溢出|对齐|模块/.test(source)) return "布局";
  return "视觉";
}

function evidenceLabel(kind) {
  if (kind === "design") return "设计稿";
  return "开发截图";
}

function screenId(index) {
  return `S${String(index + 1).padStart(2, "0")}`;
}

// --- Review history ------------------------------------------------------------------------------
// Saved reviews keep their full HTML report, which runs to megabytes once evidence crops are inlined,
// so localStorage is not an option. IndexedDB is built in, needs no dependency, and keeps everything
// on this machine — the same privacy rule the rest of the workbench follows.
const HISTORY_DB = "zymix-review-history";
const HISTORY_STORE = "reviews";

function openHistoryDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HISTORY_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HISTORY_STORE)) db.createObjectStore(HISTORY_STORE, {keyPath: "id"});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function historyTransaction(mode, run) {
  const db = await openHistoryDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(HISTORY_STORE, mode);
      const result = run(tx.objectStore(HISTORY_STORE));
      tx.oncomplete = () => resolve(result?.result ?? result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function listHistory() {
  try {
    const records = await historyTransaction("readonly", (store) => store.getAll());
    return (records || []).sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

async function saveHistory(record) {
  // Surfaces its reason rather than failing silently: a review that quietly never got archived is
  // worse than one that says why.
  await historyTransaction("readwrite", (store) => store.put(record));
  return true;
}

async function deleteHistory(id) {
  try {
    await historyTransaction("readwrite", (store) => store.delete(id));
    return true;
  } catch {
    return false;
  }
}

function emptyScreen(id, name = "") {
  return {id, name, sources: {design: null, implementation: null}, reports: {}, ignoredIssues: {}, confirmedIssues: {}, status: "idle", error: ""};
}

// --- Batch pairing -------------------------------------------------------------------------------
// Phone screenshots arrive as IMG_2891.PNG / Screenshot_20260905-171203.png, so filename matching
// fails on exactly the side that matters. Score structurally instead and only use the filename as a
// bonus. The result is always shown for confirmation before any AI runs: one wrong pair burns a full
// model call and produces a report about two unrelated screens.
const SIGNATURE_GRID = 12;

// Zoom bounds. The floor used to be 50%, which could not fit a pair of @3x phone screenshots — two
// 1206×2622 images side by side need roughly 28% — so a restored record opened with both images
// overflowing the stage and no single control that would show them whole.
const ZOOM_MIN = .2;
const ZOOM_MAX = 3;

// Issue rail width bounds. The floor keeps the evidence thumbnails legible; the ceiling keeps the
// canvas usable, since the rail overlays it.
const RAIL_MIN_WIDTH = 320;
const RAIL_MAX_WIDTH = 720;

function layoutSignature(image, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = SIGNATURE_GRID;
  canvas.height = SIGNATURE_GRID;
  const context = canvas.getContext("2d", {willReadFrequently: true});
  context.drawImage(image, 0, 0, width, height, 0, 0, SIGNATURE_GRID, SIGNATURE_GRID);
  const {data} = context.getImageData(0, 0, SIGNATURE_GRID, SIGNATURE_GRID);
  const cells = [];
  for (let i = 0; i < data.length; i += 4) cells.push((data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114) / 255);
  // Compare contrast pattern rather than absolute brightness, so a light/dark shift between design
  // and build does not look like a different screen.
  const mean = cells.reduce((total, value) => total + value, 0) / cells.length;
  const centred = cells.map((value) => value - mean);
  const norm = Math.sqrt(centred.reduce((total, value) => total + value * value, 0)) || 1;
  return centred.map((value) => value / norm);
}

// A long design export compares against several scroll screenshots, and consecutive screenshots
// overlap: whatever the reviewer already scrolled past appears again at the top of the next shot. Left
// alone, that duplicate content is reported as a defect on every screen it repeats on. Stitching them
// back into one tall image is the only way to compare against the long export at all, and the overlap
// has to be measured rather than assumed — a reviewer's scroll distance is never uniform.
const STITCH_COLUMNS = 24;
// Mean absolute row difference, on 0–1 luminance. Two shots of the same scroll content are
// pixel-identical and score 0; this leaves room for a re-rendered shadow or a compression pass.
const STITCH_ROW_TOLERANCE = .02;
// A row counts as the same row below this.
const STITCH_ROW_MATCH = .008;
// The discriminator that actually works. A genuine overlap matches on every row (measured 1.000 on
// all seams of a sliced reference page); the best alignment between two *non-consecutive* shots of
// the same page still reaches a low mean score but only matches 54–71% of its rows, because it is
// lining up repeated card chrome rather than the same content. Mean score alone accepted those.
const STITCH_ROW_COVERAGE = .92;

// One row of `STITCH_COLUMNS` luminance samples per source row, laid out flat.
function rowSignatures(source) {
  const canvas = document.createElement("canvas");
  canvas.width = STITCH_COLUMNS;
  canvas.height = source.height;
  const context = canvas.getContext("2d", {willReadFrequently: true});
  context.drawImage(source.image, 0, 0, source.width, source.height, 0, 0, STITCH_COLUMNS, source.height);
  const {data} = context.getImageData(0, 0, STITCH_COLUMNS, source.height);
  const rows = new Float32Array(source.height * STITCH_COLUMNS);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    rows[p] = (data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114) / 255;
  }
  return rows;
}

function rowDistance(first, firstRow, second, secondRow) {
  let sum = 0;
  const a = firstRow * STITCH_COLUMNS, b = secondRow * STITCH_COLUMNS;
  for (let column = 0; column < STITCH_COLUMNS; column++) sum += Math.abs(first[a + column] - second[b + column]);
  return sum / STITCH_COLUMNS;
}

// The status bar and a fixed tab bar are byte-identical in every shot, so they match at any offset and
// would anchor the overlap search on chrome instead of content. Find them by agreement across all
// shots and exclude them from both the search and the output, keeping one copy of each.
function fixedChromeBands(signatures, height) {
  const agrees = (row) => signatures.every((rows) => rowDistance(rows, row, signatures[0], row) < STITCH_ROW_TOLERANCE);
  let top = 0;
  while (top < height * .2 && agrees(top)) top += 1;
  let bottom = 0;
  while (bottom < height * .25 && agrees(height - 1 - bottom)) bottom += 1;
  return {top, bottom};
}

// How many rows at the bottom of `above`'s content repeat at the top of `below`'s content.
function measureOverlap(above, below, chrome, height) {
  const contentTop = chrome.top, contentBottom = height - chrome.bottom;
  const contentHeight = contentBottom - contentTop;
  const minimumBand = Math.max(24, Math.round(height * .03));
  if (contentHeight < minimumBand * 3) return null;
  let best = null;
  for (let overlap = minimumBand; overlap <= contentHeight - minimumBand; overlap += 1) {
    let sum = 0;
    for (let row = 0; row < overlap; row += 1) {
      sum += rowDistance(above, contentBottom - overlap + row, below, contentTop + row);
    }
    const score = sum / overlap;
    if (!best || score < best.score) best = {overlap, score};
  }
  if (!best || best.score > STITCH_ROW_TOLERANCE) return null;
  // How much of the winning band is genuinely the same rows, rather than merely a low average.
  let matched = 0;
  for (let row = 0; row < best.overlap; row += 1) {
    if (rowDistance(above, contentBottom - best.overlap + row, below, contentTop + row) < STITCH_ROW_MATCH) matched += 1;
  }
  const coverage = matched / best.overlap;
  if (coverage < STITCH_ROW_COVERAGE) return null;
  return {overlap: best.overlap, score: best.score, coverage};
}

// Plan only — no pixels are written until the reviewer confirms, so the dialog can state exactly how
// much each shot contributes and how much was recognised as already-seen.
function planStitch(sources) {
  if (!Array.isArray(sources) || sources.length < 2) return null;
  const width = sources[0].width, height = sources[0].height;
  if (!sources.every((source) => source.width === width && source.height === height)) {
    return {ok: false, reason: "截图尺寸不一致，无法按滚动顺序拼接；请使用同一台设备的连续截图"};
  }
  const signatures = sources.map(rowSignatures);
  const chrome = fixedChromeBands(signatures, height);
  const seams = [];
  for (let index = 1; index < sources.length; index += 1) {
    const seam = measureOverlap(signatures[index - 1], signatures[index], chrome, height);
    if (!seam) {
      return {ok: false, chrome,
        reason: `第 ${index} 张与第 ${index + 1} 张之间找不到可靠的重叠区域，可能不是同一次连续滚动，或中间漏截了一屏`};
    }
    seams.push(seam);
  }
  const contentHeight = height - chrome.top - chrome.bottom;
  const total = (height - chrome.bottom) + seams.reduce((sum, seam) => sum + (contentHeight - seam.overlap), 0) + chrome.bottom;
  return {ok: true, chrome, seams, width, height, total,
    duplicate: seams.reduce((sum, seam) => sum + seam.overlap, 0)};
}

// Execute a plan. Shot 1 is kept whole, each later shot contributes only its new rows, and the fixed
// bottom band is re-attached once at the end so the stitched image still ends in a real screen edge.
function stitchScreenshots(sources, plan) {
  if (!plan?.ok) return null;
  const {chrome, seams, width, height, total} = plan;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = total;
  const context = canvas.getContext("2d");
  context.drawImage(sources[0].image, 0, 0, width, height - chrome.bottom, 0, 0, width, height - chrome.bottom);
  let cursor = height - chrome.bottom;
  seams.forEach((seam, index) => {
    const source = sources[index + 1];
    const sliceTop = chrome.top + seam.overlap;
    const sliceHeight = height - chrome.bottom - sliceTop;
    if (sliceHeight <= 0) return;
    context.drawImage(source.image, 0, sliceTop, width, sliceHeight, 0, cursor, width, sliceHeight);
    cursor += sliceHeight;
  });
  if (chrome.bottom > 0) {
    const last = sources[sources.length - 1];
    context.drawImage(last.image, 0, height - chrome.bottom, width, chrome.bottom, 0, cursor, width, chrome.bottom);
    cursor += chrome.bottom;
  }
  return {src: canvas.toDataURL("image/png"), width, height: cursor};
}

// Stitching alone does not make a long page reviewable. The model preview caps at 720×1440, so an
// 804×4480 stitch arrives as 258×1440 — a whole page squashed to a strip too small to read a label
// on, which is how a review of it comes back empty. Dedup solves double-reporting; this solves
// resolution. Both sides are cut at the same proportional offsets, so the bands stay aligned by
// construction, and each band is reviewed at its native pixel size like any other screen.
// Page background, taken as the median of the outermost column. Cards and list rows are inset in
// essentially every mobile layout, so that column is background nearly everywhere.
function backgroundLuma(rows, height) {
  const gutter = [];
  for (let row = 0; row < height; row += 1) gutter.push(rows[row * STITCH_COLUMNS]);
  gutter.sort((a, b) => a - b);
  return gutter[gutter.length >> 1];
}

function bandSeam(rows, height, target, slack, background) {
  const from = Math.max(1, Math.round(target - slack)), to = Math.min(height - 2, Math.round(target + slack));
  let best = null;
  for (let row = from; row <= to; row += 1) {
    let min = 1, max = 0, sum = 0;
    for (let column = 0; column < STITCH_COLUMNS; column += 1) {
      const value = rows[row * STITCH_COLUMNS + column];
      sum += value;
      if (value < min) min = value;
      if (value > max) max = value;
    }
    // A seam belongs in full-width page background — the gap between two cards. Scoring on smoothness
    // alone put the first seam straight through a card, because a large card's flat interior is
    // smoother than the gap: it has to be background-coloured as well as flat.
    const score = (max - min) * 2
      + Math.abs(sum / STITCH_COLUMNS - background) * 3
      + Math.abs(row - target) / Math.max(1, slack) * .02;
    if (!best || score < best.score) best = {row, score};
  }
  return best ? best.row : Math.round(target);
}

function planBands(design, implementation, bandHeight) {
  if (!design?.image || !implementation?.image) return null;
  const total = implementation.height;
  const count = Math.max(2, Math.round(total / bandHeight));
  if (count < 2) return null;
  // The two sides must describe the same page before their offsets can be mapped onto each other.
  const designRatio = design.height / design.width, implementationRatio = total / implementation.width;
  const fit = Math.min(designRatio, implementationRatio) / Math.max(designRatio, implementationRatio);
  if (fit < .9) {
    return {ok: false, reason: `长图设计稿与拼接结果的比例差异过大（${design.width}×${design.height} vs ${implementation.width}×${total}），无法按同一位置分段`};
  }
  const rows = rowSignatures(implementation);
  const background = backgroundLuma(rows, total);
  const slack = Math.max(8, Math.round(bandHeight * .12));
  const cuts = [0];
  for (let index = 1; index < count; index += 1) {
    const previous = cuts[cuts.length - 1];
    const target = Math.round(total * index / count);
    const row = bandSeam(rows, total, target, slack, background);
    cuts.push(Math.max(previous + Math.round(bandHeight * .4), row));
  }
  cuts.push(total);
  const designScale = design.height / total;
  const bands = [];
  for (let index = 0; index < cuts.length - 1; index += 1) {
    const top = cuts[index], bottom = cuts[index + 1];
    if (bottom - top < 40) continue;
    bands.push({
      index,
      implementation: {top, height: bottom - top},
      design: {top: Math.round(top * designScale), height: Math.round((bottom - top) * designScale)},
    });
  }
  return bands.length >= 2 ? {ok: true, bands, count: bands.length} : null;
}

function cropSource(source, top, height) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = Math.max(1, Math.min(height, source.height - top));
  const context = canvas.getContext("2d");
  context.drawImage(source.image, 0, top, source.width, canvas.height, 0, 0, source.width, canvas.height);
  return canvas.toDataURL("image/png");
}

function signatureSimilarity(first, second) {
  if (!first || !second) return 0;
  let dot = 0;
  for (let i = 0; i < first.length; i++) dot += first[i] * second[i];
  return (dot + 1) / 2;
}

function filenameTokens(name) {
  return String(name || "").toLowerCase().replace(/\.[a-z0-9]+$/, "")
    .split(/[^a-z0-9一-龥]+/).filter((token) => token && !/^(img|image|screenshot|screen|shot|photo|design|final|copy|副本|设计稿|截图)$/.test(token));
}

// A token every file shares separates nothing. Raw overlap counted the boilerplate in
// "NFT-西游记系列：佛祖" and "NFT-西游记系列：唐三藏" as agreement, so two different characters scored
// 0.50 against the 0.75 of a correct match — a 0.25 gap worth only 0.06 of the total, which the
// visual term (same pose, same framing, same backdrop) swamped and the pair came out wrong. Weight
// each token by how rare it is in this batch, so the one distinguishing word decides.
// Tokens shared by nearly every file are the batch's own boilerplate and are dropped outright;
// weighting them down was not enough, because they stayed in the denominator and kept the gap
// between a right and a wrong pair at ~0.06 of the final score — less than the visual term's noise.
// What remains is the part that actually identifies a screen.
function distinguishingTokens(names) {
  const total = names.length || 1;
  const frequency = new Map();
  for (const name of names) {
    for (const token of new Set(filenameTokens(name))) frequency.set(token, (frequency.get(token) || 0) + 1);
  }
  const boilerplate = new Set();
  if (total >= 3) {
    for (const [token, count] of frequency) if (count / total >= .8) boilerplate.add(token);
  }
  const weights = new Map();
  for (const [token, count] of frequency) {
    if (!boilerplate.has(token)) weights.set(token, Math.log(1 + total / count));
  }
  return weights;
}

function filenameTokensFor(name, weights) {
  const tokens = new Set(filenameTokens(name));
  if (!weights) return tokens;
  return new Set([...tokens].filter((token) => weights.has(token)));
}

function filenameSimilarity(first, second, weights) {
  const a = filenameTokensFor(first, weights), b = filenameTokensFor(second, weights);
  if (!a.size || !b.size) return 0;
  const weightOf = (token) => (weights ? weights.get(token) ?? 0 : 1);
  let shared = 0, union = 0;
  for (const token of new Set([...a, ...b])) {
    const weight = weightOf(token);
    union += weight;
    if (a.has(token) && b.has(token)) shared += weight;
  }
  return union ? shared / union : 0;
}

// Only meaningful when the two sides name things the same way. Designs called 佛祖/唐三藏 against
// screenshots called IMG_5637 share no vocabulary at all, so every pair would look like a conflict
// and the flat penalty would drag every score below the plausibility floor — reporting every correct
// pairing as doubtful, which is the failure the weighting was chosen to avoid in the first place.
function namesComparable(designs, implementations, weights) {
  if (!weights) return false;
  for (const design of designs) {
    const a = filenameTokensFor(design.name, weights);
    if (!a.size) continue;
    for (const implementation of implementations) {
      const b = filenameTokensFor(implementation.name, weights);
      for (const token of a) if (b.has(token)) return true;
    }
  }
  return false;
}

// Absence of evidence and evidence of conflict are different things. When both filenames carry a
// distinguishing word and they share none of them, that is a positive signal the pair is wrong, and
// it has to be able to outvote a high visual score between two screens that merely look alike.
function nameConflict(design, implementation, weights) {
  if (!weights) return 0;
  const a = filenameTokensFor(design.name, weights), b = filenameTokensFor(implementation.name, weights);
  if (!a.size || !b.size) return 0;
  for (const token of a) if (b.has(token)) return 0;
  return 1;
}

function pairScore(design, implementation, designIndex, implementationIndex, count, weights) {
  const visual = signatureSimilarity(design.signature, implementation.signature);
  const filename = filenameSimilarity(design.name, implementation.name, weights);
  const conflict = nameConflict(design, implementation, weights);
  const order = count > 1 ? 1 - Math.abs(designIndex - implementationIndex) / count : 1;
  const aspect = Math.min(design.width / design.height, implementation.width / implementation.height)
    / Math.max(design.width / design.height, implementation.width / implementation.height);
  return visual * .58 + filename * .24 + order * .08 + aspect * .10 - conflict * .30;
}

// Global assignment, not greedy: one confident mistake should not cascade into every later pairing.
// `overrides` maps a design filename to the implementation the reviewer picked; those are honoured
// first and removed from the pool, then the rest are assigned automatically around them.
function assignPairs(designs, implementations, overrides = {}) {
  const forced = [], freeDesigns = [], usedImplementations = new Set();
  for (const design of designs) {
    const chosen = overrides[design.name] && implementations.find((item) => item.name === overrides[design.name]);
    if (chosen) { forced.push({design, implementation: chosen, score: 1, margin: 1, manual: true}); usedImplementations.add(chosen); }
    else freeDesigns.push(design);
  }
  const freeImplementations = implementations.filter((item) => !usedImplementations.has(item));
  const auto = assignAutomatically(freeDesigns, freeImplementations);
  const byDesign = new Map([...forced, ...auto].map((entry) => [entry.design, entry]));
  const ordered = designs.map((design) => byDesign.get(design) || {design, implementation: null, score: 0, margin: 0});
  const leftover = auto.filter((entry) => !entry.design);
  return [...ordered, ...leftover];
}

function assignAutomatically(designs, implementations) {
  // Rarity is measured over both sides at once: a word is only distinguishing if it is rare in the
  // whole batch, not just on one side.
  const weights = distinguishingTokens([...designs, ...implementations].map((item) => item.name));
  // Withheld entirely when the two sides use unrelated naming schemes.
  const comparable = namesComparable(designs, implementations, weights);
  const scores = designs.map((design, designIndex) =>
    implementations.map((implementation, implementationIndex) =>
      pairScore(design, implementation, designIndex, implementationIndex, Math.max(designs.length, implementations.length), comparable ? weights : null)));
  const takenDesign = new Set(), takenImplementation = new Set(), pairs = [];
  const candidates = [];
  designs.forEach((_, d) => implementations.forEach((__, i) => candidates.push({d, i, score: scores[d][i]})));
  candidates.sort((a, b) => b.score - a.score);
  for (const {d, i, score} of candidates) {
    if (takenDesign.has(d) || takenImplementation.has(i)) continue;
    takenDesign.add(d); takenImplementation.add(i);
    // Confidence is the margin over this design's runner-up, not the absolute score. Absolute scores
    // are capped by whichever signals are available — with phone-style filenames the name term is
    // always 0, so an absolute threshold would report every correct pairing as low confidence.
    const alternatives = scores[d].filter((_, other) => other !== i).sort((a, b) => b - a);
    pairs.push({design: designs[d], implementation: implementations[i], score, margin: alternatives.length ? score - alternatives[0] : 1});
  }
  designs.forEach((design, d) => { if (!takenDesign.has(d)) pairs.push({design, implementation: null, score: 0, margin: 0}); });
  implementations.forEach((implementation, i) => { if (!takenImplementation.has(i)) pairs.push({design: null, implementation, score: 0, margin: 0}); });
  return pairs;
}

// Margin alone is not enough. When every candidate is wrong — an avatar export against a game
// screenshot — one assignment can still beat the alternative by a wide margin and would be reported
// as high confidence. Gate on absolute plausibility first, then rank by margin.
// Measured on real inputs: a true design/screenshot pair scores ~0.89 structural and 1.00 aspect,
// while an unrelated pair scores ~0.40 structural and ~0.46 aspect, so these floors sit between.
const PLAUSIBLE_STRUCTURE = .58;
const PLAUSIBLE_ASPECT = .72;

// Same plausibility test as the pairing dialog, but usable on any two loaded sources — committed
// screens and restored sessions do not carry a precomputed signature. Used to refuse a review before
// it is sent: a design and an unrelated screenshot cost a full model call and can only produce noise.
function plausiblePair(design, implementation) {
  if (!design?.image || !implementation?.image) return {ok: true, reason: ""};
  const designAspect = design.width / design.height, implementationAspect = implementation.width / implementation.height;
  const aspectFit = Math.min(designAspect, implementationAspect) / Math.max(designAspect, implementationAspect);
  if (aspectFit < PLAUSIBLE_ASPECT) {
    return {ok: false, reason: `两张图宽高比差异过大（${design.width}×${design.height} vs ${implementation.width}×${implementation.height}），多半不是同一个界面，请重新选择对应的对比图片`};
  }
  const structure = signatureSimilarity(
    design.signature || layoutSignature(design.image, design.width, design.height),
    implementation.signature || layoutSignature(implementation.image, implementation.width, implementation.height));
  if (structure < PLAUSIBLE_STRUCTURE) {
    return {ok: false, reason: "两张图画面结构差异过大，多半不是同一个界面，请重新选择对应的对比图片"};
  }
  return {ok: true, reason: ""};
}

function pairQuality(entry) {
  if (!entry.design || !entry.implementation) return {label: "缺一侧", tone: "bad", reason: "", state: "broken"};
  const design = entry.design, implementation = entry.implementation;
  const designAspect = design.width / design.height, implementationAspect = implementation.width / implementation.height;
  const aspectFit = Math.min(designAspect, implementationAspect) / Math.max(designAspect, implementationAspect);
  const structure = signatureSimilarity(design.signature, implementation.signature);
  // A reviewer's own choice is still measured. Reporting "已指定" as high confidence would hide the
  // very mismatch the check exists to catch — say it is their pick, and still flag it.
  const match = Math.round(structure * 100);
  const margin = entry.margin ?? 0;
  const gap = Math.round(margin * 100);
  if (entry.manual && entry.confirmed && !entry.needsConfirmation) return {label:"已指定",tone:"high",state:"ready",match,reason:"已按人工指定配对；匹配度仅供参考，不代表验收通过。"};
  if (aspectFit < PLAUSIBLE_ASPECT) {
    return {label: entry.manual ? "已指定 · 存疑" : "不匹配", tone: "bad", state: "broken", match,
      reason: `宽高比差异大（${design.width}×${design.height} vs ${implementation.width}×${implementation.height}），多半不是同一个界面`};
  }
  if (structure < PLAUSIBLE_STRUCTURE) {
    return {label: entry.manual ? "已指定 · 存疑" : "不匹配", tone: "bad", state: "broken", match,
      reason: `画面结构相似度仅 ${match}%，多半不是同一个界面`};
  }
  if (entry.confirmed) return {label: "已确认", tone: "high", state: "ready", match, reason: "已人工确认两侧为同一界面；尚未进行设计验收。"};
  if (entry.needsConfirmation) return {label: "待确认", tone: "mid", state: "review", match, reason: "配对已调整或撤销确认，请核对两侧图片后确认配对。"};
  if (autoConfirmsPair({...entry,match})) return {label: "自动确认", tone: "high", state: "ready", match, reason: "匹配度达到90%，已自动确认配对；不代表设计验收通过。"};
  if (entry.manual) return {label: "已指定", tone: "high", state: "ready", match, reason: ""};
  if (margin >= .06) return {label: "待确认", tone: "mid", state: "review", match, reason: `匹配度 ${match}%，低于90%自动确认阈值，请核对后确认配对。`};
  if (margin >= .02) {
    return {label: "待确认", tone: "mid", state: "review", match,
      reason: `结构相似度 ${match}%，但与次优候选只差 ${gap}%，建议核对`};
  }
  return {label: "待确认", tone: "low", state: "review", match,
    reason: `结构相似度 ${match}%，另有截图相似度几乎相同（差 ${gap}% 以内），请确认选的是哪一张`};
}

// A failed screen has exactly two useful shapes, and they need opposite fixes. "These two images are
// not the same screen" is the reviewer's problem — re-pair or replace one side; retrying is pointless.
// "The model could not handle this request" is the tool's problem — the pairing is fine and a retry
// usually clears it. Labelling both of them 失败 sent reviewers to the wrong remedy, so the raw
// message is classified and the technical text stays available but folded away.
function classifyFailure(message) {
  const text = String(message || "");
  if (/不是同一个界面|宽高比差异|结构差异|图片不匹配|缺一侧/.test(text)) {
    return {kind: "pairing", title: "两侧不是同一个界面", advice: "重新配对，或换掉其中一张图后再检测", retryable: false};
  }
  // Billing, not capacity, and it must be checked first: the provider's own wording ("out of
  // credits") carries none of the capacity keywords, so this used to land in 未知 and advise a retry
  // that cannot succeed. The provider answers in English; the reviewer reads the toast in Chinese.
  if (/out of credits|insufficient[_ ]?(quota|credits?|balance)|quota[_ ]?exceeded|credit balance|billing|payment required|额度|余额|欠费|请充值/i.test(text)) {
    return {kind: "credits", title: "Codex 账号额度已用完", advice: "这是账号额度问题，不是图片或配对问题。请让 workspace 所有者充值后再重试本屏；换图、改配对或整批重跑都绕不过去。", retryable: true};
  }
  if (/未登录|not logged in|unauthorized|401|invalid api key|authentication/i.test(text)) {
    return {kind: "auth", title: "Codex 未登录或凭据失效", advice: "先在终端重新登录 Codex，再回来重试本屏。", retryable: true};
  }
  if (/容量|上下文|context|token|too large|payload|timeout|超时|ETIMEDOUT|ECONNRESET|429|rate limit|busy|overload/i.test(text)) {
    return {kind: "capacity", title: "模型这次没能处理这组图", advice: "图片偏大或服务繁忙，重试通常就能通过", retryable: true};
  }
  if (/未返回可用问题清单|解析|JSON|schema/i.test(text)) {
    return {kind: "response", title: "返回结果无法解析", advice: "本轮回复不完整，重试本屏即可", retryable: true};
  }
  return {kind: "unknown", title: "检测未完成", advice: "查看技术详情后重试本屏", retryable: true};
}

// Round-over-round comparison. Re-review is the point of an acceptance tool — "did the 7 things I
// reported actually get fixed" — and answering it by hand across two exports is the work the tool
// should be doing. Issues are matched on category plus title wording plus where they sit, because
// IDs are renumbered between rounds and cannot be used as identity.
function normalizeIssueText(value) {
  return String(value || "").toLowerCase().replace(/[\s，。、,.:：；;（）()「」“”"'!?！？·]+/g, "");
}

function titleAffinity(first, second) {
  const a = normalizeIssueText(first), b = normalizeIssueText(second);
  if (!a || !b) return 0;
  if (a === b) return 1;
  // Character bigrams: robust to a reworded prefix, and language-agnostic for mixed zh/en titles.
  const grams = (value) => {
    const set = new Set();
    for (let index = 0; index < value.length - 1; index++) set.add(value.slice(index, index + 2));
    return set;
  };
  const ga = grams(a), gb = grams(b);
  if (!ga.size || !gb.size) return 0;
  let shared = 0;
  for (const gram of ga) if (gb.has(gram)) shared++;
  return (2 * shared) / (ga.size + gb.size);
}

function boxOverlap(first, second) {
  if (!first || !second) return 0;
  const x = Math.max(0, Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x));
  const y = Math.max(0, Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y));
  const intersection = x * y;
  if (!intersection) return 0;
  const union = first.width * first.height + second.width * second.height - intersection;
  return union > 0 ? intersection / union : 0;
}

function matchRounds(previousIssues, currentIssues) {
  const takenCurrent = new Set();
  const carried = [], fixed = [];
  for (const before of previousIssues || []) {
    let best = null, bestScore = 0;
    (currentIssues || []).forEach((after, index) => {
      if (takenCurrent.has(index)) return;
      if (before.category && after.category && before.category !== after.category) return;
      const score = titleAffinity(before.title, after.title) * .7
        + boxOverlap(before.rightLocation, after.rightLocation) * .3;
      if (score > bestScore) { bestScore = score; best = index; }
    });
    // Deliberately not a low bar: calling a different defect "the same one, still open" would hide a
    // regression, and calling the same one "fixed" is worse. Anything below this stays unmatched.
    if (best !== null && bestScore >= .42) {
      takenCurrent.add(best);
      carried.push({before, after: currentIssues[best], score: bestScore});
    } else {
      fixed.push(before);
    }
  }
  const added = (currentIssues || []).filter((_, index) => !takenCurrent.has(index));
  return {carried, fixed, added};
}

function projectNameFromFile(filename) {
  return String(filename || "")
    .replace(/\.[^.]+$/, "")
    .trim() || "未命名项目";
}

// Local-time YYYYMMDDHHmm appended to every downloaded file. Without it a second export of the same
// project silently replaced the first in the download folder, which is the opposite of what a review
// round wants — each round is its own artifact and reviewers compare them.
function exportStamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function safeExportName(value) {
  return String(value || "未命名项目")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 64) || "未命名项目";
}

function UploadIcon() {
  return <Icon icon={Upload04Icon} />;
}

function ZoomIcon({direction}) {
  return <Icon icon={direction === "in" ? PlusSignCircleIcon : MinusSignCircleIcon} className="tool-icon" />;
}

// Compact by default; native vertical resizing belongs to the reviewer.
function IssueTextarea(props) {
  return <Textarea rows={3} {...props} />;
}

// The panels float over the canvas instead of shrinking it, so the stage's own width is not what the
// reviewer can see. Return the visible sub-rectangle in stage-viewport coordinates, measuring the
// panels rather than assuming their widths — the issue rail is resizable and the tool rail's flyouts
// change size. Fitting and centring must both use this, or the fit scales to one box and centres in
// another and the artwork lands off to one side.
const CANVAS_FIT_MARGIN = 24;

function visibleCanvasBox(stage, bounds) {
  const stageBox = bounds || stage.getBoundingClientRect();
  let left = 0, right = stage.clientWidth;
  // The permanent icon strip, not `.tool-rail`: that element's box grows to include whichever hover
  // flyout is open, so fitting to it made the result depend on where the pointer had been — and
  // restoring a record centred the artwork far to the right because the history flyout was still
  // closing when the fit measured.
  for (const selector of [".tool-rail .rail-icon-bar", ".editor-grid > .issue-rail:not(.is-collapsed)"]) {
    const panel = document.querySelector(selector);
    if (!panel) continue;
    const box = panel.getBoundingClientRect();
    if (!box.width || box.right <= stageBox.left || box.left >= stageBox.right) continue;
    const from = box.left - stageBox.left, to = box.right - stageBox.left;
    // Which side the panel is on, decided by where its centre falls. Testing whether it reached the
    // stage edge instead ignored both rails, because each is inset 12px from that edge — so the fit
    // scaled to the full width and put the second frame under the issue rail.
    if ((from + to) / 2 < stage.clientWidth / 2) left = Math.max(left, to);
    else right = Math.min(right, from);
  }
  // Fall back to the whole stage if the panels leave nothing usable, rather than returning a
  // negative width that would place the artwork off screen.
  if (right - left < 160) return {left: 0, top: 0, width: stage.clientWidth, height: stage.clientHeight};
  const width = right - left - CANVAS_FIT_MARGIN * 2;
  const height = Math.max(0, stage.clientHeight - CANVAS_FIT_MARGIN * 2);
  return {left: left + CANVAS_FIT_MARGIN, top: CANVAS_FIT_MARGIN, width, height};
}

// The reference only has to scale linearly with the zoom; the anchor's fraction of it may sit
// outside 0..1. The zoom surface does not qualify — it includes the fixed-height captions, so its
// height grows more slowly than the artwork and the cursor crept vertically. An evidence frame is
// pure image and scales exactly on both axes.
function zoomAnchorElement(stage) {
  return stage?.querySelector(".multi-canvas-surface") || stage?.querySelector(".annotated-frame, .overlay-frame")
    || stage?.querySelector(".zoom-surface")
    || stage?.querySelector(".canvas-extent");
}

function FitIcon() {
  return <Icon icon={FitToScreenIcon} className="tool-icon" />;
}

function OpacityIcon() {
  return <Icon icon={ContrastIcon} className="tool-icon" />;
}

function VisibilityIcon({hidden}) {
  return <Icon icon={hidden ? ViewOffIcon : ViewIcon} className="tool-icon" />;
}

function SourceCard({index, title, hint, kind, source, onFile, onRemove, activeKind, onActivate, children}) {
  const isPasteTarget = activeKind === kind;
  return (
    <Card className={`source-card ${isPasteTarget ? "is-paste-target" : ""}`} onPointerEnter={() => onActivate?.(kind)} onFocusCapture={() => onActivate?.(kind)}>
      <CardHeader className="source-header">
        <CardTitle><span className="source-index">{index}</span>{title}</CardTitle>
        <div className="source-header-meta">{isPasteTarget && <span className="paste-target-badge">⌘/Ctrl V 粘贴目标</span>}{hint && <CardDescription>{hint}</CardDescription>}</div>
      </CardHeader>
      <CardContent className="source-content">
        {children || <UploadControl kind={kind} source={source} onFile={onFile} onRemove={onRemove} title={title} activeKind={activeKind} onActivate={onActivate} />}
      </CardContent>
    </Card>
  );
}

// One zone per evidence kind, accepting many files at once. Replaces the old single-source cards and
// keeps everything they offered: click to pick, drag a whole selection in, or paste into the focused
// zone. Multi-select is the default because a review normally covers several screens.
function DropZone({kind, label, count, active, onActivate, onFiles, footer = null}) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  return (
    <div
      data-source-kind={kind}
      className={`drop-zone ${isDragging ? "is-dragging" : ""} ${active ? "is-active" : ""} ${count ? "has-files" : ""}`}
      onPointerEnter={() => onActivate?.(kind)}
      onFocusCapture={() => onActivate?.(kind)}
      onDragEnter={(event) => { event.preventDefault(); onActivate?.(kind); setIsDragging(true); }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setIsDragging(false); }}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
      onDrop={(event) => {
        event.preventDefault(); event.stopPropagation(); setIsDragging(false);
        if (event.dataTransfer?.files?.length) onFiles(kind, event.dataTransfer.files, {append: true});
      }}
    >
      <input ref={inputRef} className="sr-file" type="file" multiple accept="image/png,image/jpeg,image/webp"
        onChange={(event) => { onFiles(kind, event.target.files); event.target.value = ""; }} />
      {/* The zone states its own affordances, so it opts out of the global button tooltip that would
          otherwise repeat them in a floating chip. The paste hint is part of the same sub-line rather
          than a separate label overlapping the border. */}
      <button type="button" className="drop-zone-trigger" data-no-tip onClick={() => inputRef.current?.click()}>
        <span className="drop-zone-label">{label}</span>
        <span className="drop-zone-hint">
          {isDragging ? "松开即可导入"
            : `${count ? "点击可重选" : "点击选择 · 可拖入多张"} · ⌘/Ctrl + V 粘贴`}
        </span>
      </button>
      {count ? <span className="drop-zone-count">{count}</span> : null}
      {/* A secondary source for this slot, e.g. Figma for the design side. It lives inside the slot it
          affects rather than as a modal-level tab: the old tabs implied the whole dialog had two modes
          when they only changed where the design came from, and switching them made the screenshot
          zone disappear and reappear 230px lower. */}
      {footer ? <div className="drop-zone-footer">{footer}</div> : null}
    </div>
  );
}

// Picks a screenshot by sight rather than by filename. Phone screenshots are named IMG_6028.PNG or a
// content hash, so a native <select> of filenames gives the reviewer nothing to judge by.
function SeverityFilterMenu({value, options, label, onChange}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const triggerRef = useRef(null);
  const place = () => {
    const box = triggerRef.current?.getBoundingClientRect();
    if (box) setAnchor({right: window.innerWidth - box.right, top: box.bottom + 6});
  };
  useEffect(() => {
    if (!open) return undefined;
    const away = (event) => { if (!triggerRef.current?.contains(event.target) && !event.target.closest?.(".filter-menu")) setOpen(false); };
    const esc = (event) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); } };
    const reposition = () => place();
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc, true);
    window.addEventListener("resize", reposition);
    document.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc, true);
      window.removeEventListener("resize", reposition);
      document.removeEventListener("scroll", reposition, true);
    };
  }, [open]);
  const active = options.find((item) => item.id === value);
  return (
    <>
      <button ref={triggerRef} type="button" className={`filter-menu-trigger ${value === "all" ? "" : "is-filtered"}`}
        aria-label={`${label}${active && value !== "all" ? `：${active.label}` : ""}`} aria-expanded={open} aria-haspopup="menu"
        onClick={() => { place(); setOpen((current) => !current); }}>
        <Icon icon={FilterHorizontalIcon} size={15} />
      </button>
      {open && anchor && (
        <div className="filter-menu" role="menu" style={{right: `${anchor.right}px`, top: `${anchor.top}px`}}>
          {options.map((item) => (
            <button key={item.id} type="button" role="menuitemradio" aria-checked={value === item.id} data-no-tip
              className={item.divide ? "is-divided" : ""}
              onClick={() => { onChange(item.id); setOpen(false); }}>
              <span className="filter-menu-check" aria-hidden="true">{value === item.id ? "✓" : ""}</span>
              <span className="filter-menu-label">{item.label}</span>
              <span className="filter-menu-count">{item.count}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function ThumbPicker({label, options, value, onChange, counterpart}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState(null);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const previewRef = useRef(null);
  const triggerRef = useRef(null);
  const current = options.find((item) => item.name === value);
  const ranked = useMemo(() => rankCandidates(options, counterpart, (item, other) => item.signature && other.signature ? signatureSimilarity(item.signature, other.signature) : NaN), [options, counterpart]);
  const filtered = ranked.filter(({item}) => item.name.toLowerCase().includes(query.toLowerCase()));
  const place = () => {
    const box = triggerRef.current?.getBoundingClientRect();
    if (!box) return;
    const width = Math.min(480, Math.max(280, box.width), (window.innerWidth - 36) * .55);
    const height = Math.min(390, window.innerHeight - 24);
    setAnchor({left: Math.max(12, Math.min(box.left, window.innerWidth - width - 12)),
      top: Math.max(12, Math.min(box.bottom + 6, window.innerHeight - height - 12)), width, height});
  };
  const previewHeight = Math.min(820, Math.max(160, window.innerHeight - 48));
  const previewWidth = Math.min(480, Math.max(120, (previewHeight - 76) * (preview?.width || 375) / (preview?.height || 812)), window.innerWidth - (anchor?.width || 0) - 36);
  const previewPosition = anchor ? {
    width: previewWidth, height: previewHeight,
    left: anchor.left + anchor.width + 12 + previewWidth <= window.innerWidth - 12 ? anchor.left + anchor.width + 12
      : anchor.left - previewWidth - 12 >= 12 ? anchor.left - previewWidth - 12 : window.innerWidth - previewWidth - 12,
    top: Math.max(12, Math.min(anchor.top, window.innerHeight - previewHeight - 12)),
  } : null;
  const close = () => { setOpen(false); triggerRef.current?.focus(); };
  useEffect(() => {
    if (!open) return undefined;
    const away = (event) => { if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target) && !previewRef.current?.contains(event.target)) setOpen(false); };
    const esc = (event) => { if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close(); } };
    const reposition = (event) => { if (!menuRef.current?.contains(event.target)) place(); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc, true);
    window.addEventListener("resize", reposition);
    document.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc, true);
      window.removeEventListener("resize", reposition);
      document.removeEventListener("scroll", reposition, true);
    };
  }, [open]);
  return (
    <span className="thumb-picker" ref={rootRef}>
      <button ref={triggerRef} type="button" className="thumb-picker-trigger" data-no-tip aria-label={label} aria-expanded={open} aria-haspopup="dialog"
        onClick={(event) => { event.stopPropagation(); place(); setQuery(""); setPreview(null); setOpen((current) => !current); }}>
        <span className="thumb-picker-name">{current?.name || "选择截图"}</span>
        <span className="thumb-picker-caret" aria-hidden="true">⌄</span>
      </button>
      {open && anchor && createPortal(
        <div ref={menuRef} className="file-picker-popover" role="dialog" aria-label={label} style={anchor}>
          <div className="file-picker-header">
            <input autoFocus aria-label="搜索素材文件名" placeholder="搜索文件名" value={query} onChange={(event) => { setQuery(event.target.value); setPreview(null); }} />
            <button type="button" aria-label="关闭文件选择" onClick={close}><Icon icon={Cancel01Icon} size={16} /></button>
          </div>
          <div className="file-picker-body">
            <div className="file-picker-list" role="listbox" aria-label="可选素材">
              {filtered.map(({item, percent}) => (
                <button key={item.name} type="button" role="option" aria-selected={item.name === value}
                  className={`file-picker-option ${item.name === value ? "selected" : ""}`} data-no-tip
                  onMouseEnter={() => setPreview(item)} onMouseLeave={() => setPreview(null)}
                  onFocus={() => setPreview(item)} onBlur={() => setPreview(null)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                      event.preventDefault();
                      const next = event.key === "ArrowDown" ? event.currentTarget.nextElementSibling : event.currentTarget.previousElementSibling;
                      next?.focus();
                    }
                  }}
                  onClick={(event) => { event.stopPropagation(); onChange(item.name); close(); }}>
                  <span>{item.name}</span>{item.name === value && <small>当前</small>}
                  {percent !== null && <small className="candidate-match" aria-label={`匹配度 ${percent}%`}>{percent}%</small>}
                </button>
              ))}
              {!filtered.length && <p className="file-picker-empty">没有匹配的文件</p>}
            </div>

          </div>
        </div>, document.body
      )}
      {open && preview && previewPosition && createPortal(
        <figure ref={previewRef} className="file-picker-large-preview" style={previewPosition} aria-label="素材大图预览">
          <img src={preview.src} alt={`候选预览：${preview.name}`} draggable="false" />
          <figcaption>{preview.name}</figcaption><small>{preview.width}×{preview.height}</small>
        </figure>, document.body
      )}
    </span>
  );
}

function UploadControl({kind, source, onFile, onRemove, title, activeKind, onActivate}) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const isActive = activeKind === kind;
  const open = () => inputRef.current?.click();
  const acceptDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    const file = event.dataTransfer?.files?.[0];
    if (file?.type?.startsWith("image/")) onFile(kind, file);
  };
  return (
    <div
      className={`upload-shell ${isDragging ? "is-dragging" : ""} ${isActive ? "is-active" : ""}`}
      onPointerEnter={() => onActivate?.(kind)}
      onFocusCapture={() => onActivate?.(kind)}
      onDragEnter={(event) => { event.preventDefault(); onActivate?.(kind); setIsDragging(true); }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setIsDragging(false); }}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
      onDrop={acceptDrop}
    >
      <input ref={inputRef} className="sr-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => onFile(kind, e.target.files?.[0])} />
      <Button variant="ghost" className={`upload-trigger ${source ? "has-source" : ""}`} onClick={open}>
        {source ? <img src={source.src} alt={`${title}预览`} /> : <><UploadIcon /><span><strong>选择或拖入图片</strong><small>PNG、JPG、WebP</small></span></>}
        {source && <span className="replace-label">替换</span>}
      </Button>
      {source && <Button variant="secondary" size="sm" className="remove-source" aria-label={`删除${title}`} onClick={() => onRemove?.(kind)}>×</Button>}
      {isActive && <span className="paste-target-label">{isDragging ? "松开即可上传" : "⌘/Ctrl + V 粘贴到这里"}</span>}
    </div>
  );
}

function HeroTabs({value, onChange, items, ariaLabel, className = ""}) {
  return (
    <Tabs className={className} value={value} onValueChange={(key) => onChange(String(key))}>
      <TabsList aria-label={ariaLabel} className="compact-tabs">
        {items.map((item) => (
          <TabsTrigger value={item.id} key={item.id} disabled={item.disabled} data-shortcut={item.shortcut}
            aria-label={item.icon ? item.label : undefined}>
            {item.icon ? <Icon icon={item.icon} size={16} /> : item.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {items.map((item) => <TabsContent value={item.id} key={item.id} className="sr-panel" />)}
    </Tabs>
  );
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({src, image, width: image.naturalWidth, height: image.naturalHeight});
    image.onerror = () => reject(new Error("图片无法读取"));
    image.src = src;
  });
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function mergeRelatedRegions(regions, width, height) {
  const clusters = regions.map((region) => ({...region, relatedCount: 1}));
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let first = 0; first < clusters.length; first++) {
      for (let second = first + 1; second < clusters.length; second++) {
        const a = clusters[first], b = clusters[second];
        const horizontalGap = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width));
        const verticalGap = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height));
        const horizontalOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
        const verticalOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
        const sameTextLine = verticalOverlap >= Math.min(a.height, b.height) * .45
          && horizontalGap <= Math.max(10, Math.min(a.height, b.height) * .8);
        const sameCompactComponent = horizontalOverlap >= Math.min(a.width, b.width) * .5
          && verticalGap <= Math.max(8, Math.min(a.width, b.width) * .22);
        const overlapping = horizontalGap === 0 && verticalGap === 0;
        if (!sameTextLine && !sameCompactComponent && !overlapping) continue;
        const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), right = Math.max(a.x + a.width, b.x + b.width), bottom = Math.max(a.y + a.height, b.y + b.height);
        const mergedWidth = right - x, mergedHeight = bottom - y;
        const growsIntoModule = mergedWidth > width * .42 && mergedHeight > height * .12
          && Math.max(a.width, b.width) < width * .28;
        if (growsIntoModule) continue;
        clusters[first] = {x, y, width: right - x, height: bottom - y, relatedCount: a.relatedCount + b.relatedCount};
        clusters.splice(second, 1);
        merged = true;
        break outer;
      }
    }
  }
  return clusters;
}

function padRegion(location, width, height, padding) {
  const x = Math.max(0, location.x - padding), y = Math.max(0, location.y - padding);
  const right = Math.min(width, location.x + location.width + padding);
  const bottom = Math.min(height, location.y + location.height + padding);
  return {...location, x, y, width: right - x, height: bottom - y};
}

const COMMON_LOGICAL_WIDTHS = [320, 360, 375, 384, 390, 393, 402, 411, 412, 414, 428, 430, 440, 768, 820, 834, 1024, 1280, 1366, 1440, 1536, 1920];
const COMMON_EXPORT_SCALES = [1, 1.25, 1.5, 1.6, 2, 2.5, 3, 4];

function logicalBaseline(width, height) {
  const inferred = inferLogicalViewport({width, height}, width);
  return {width: inferred.width, height: inferred.height, scale: inferred.scale, origin: "inferred"};
}

function inferLogicalViewport(source, maximumWidth) {
  let best = null;
  for (const width of COMMON_LOGICAL_WIDTHS) {
    if (width > source.width || width > maximumWidth) continue;
    const scale = source.width / width;
    if (scale < .95 || scale > 4.1) continue;
    const nearestScaleError = Math.min(...COMMON_EXPORT_SCALES.map((candidate) => Math.abs(scale - candidate) / candidate));
    const height = source.height / scale;
    const roundedHeight = Math.round(height);
    const roundingError = Math.abs(height - roundedHeight);
    const score = nearestScaleError * 10 + roundingError / Math.max(1, roundedHeight);
    if (!best || score < best.score) best = {width, height: roundedHeight, scale, score};
  }
  if (best) return best;
  const width = Math.min(source.width, maximumWidth);
  const scale = source.width / width;
  return {width, height: Math.round(source.height / scale), scale, score: 1};
}

function comparisonPlan(left, right) {
  if (left.width === right.width && left.height === right.height) {
    const leftTransform = aspectPreservingTransform(left, left.width, left.height);
    const rightTransform = aspectPreservingTransform(right, right.width, right.height);
    return {comparable: true, normalized: false, width: left.width, height: left.height, leftScale: 1, rightScale: 1, leftTransform, rightTransform};
  }
  const leftAspect = left.width / left.height;
  const rightAspect = right.width / right.height;
  const aspectDelta = Math.abs(leftAspect - rightAspect) / Math.max(leftAspect, rightAspect);
  const relativeWidthScale = right.width / left.width;
  const relativeHeightScale = right.height / left.height;
  const scaleDelta = Math.abs(relativeWidthScale - relativeHeightScale) / Math.max(relativeWidthScale, relativeHeightScale);
  if (aspectDelta > .005 || scaleDelta > .005) {
    const leftBase = left.baseline || logicalBaseline(left.width, left.height);
    const rightBase = right.baseline || logicalBaseline(right.width, right.height);
    // Both sides resolved to a recognised device viewport, just not the same one: that is an iOS
    // design against an Android build, not a mismatched pair.
    if (leftBase.width !== rightBase.width || leftBase.height !== rightBase.height) {
      return {comparable: false, crossViewport: true, aspectDelta, scaleDelta, leftBase, rightBase};
    }
    return {comparable: false, aspectDelta, scaleDelta};
  }
  const logical = inferLogicalViewport(left, Math.min(left.width, right.width));
  const leftTransform = aspectPreservingTransform(left, logical.width, logical.height);
  const rightTransform = aspectPreservingTransform(right, logical.width, logical.height);
  return {
    comparable: true,
    normalized: true,
    width: logical.width,
    height: logical.height,
    leftScale: left.width / logical.width,
    rightScale: right.width / logical.width,
    leftTransform,
    rightTransform,
    aspectDelta,
    scaleDelta,
  };
}

function aspectPreservingTransform(source, logicalWidth, logicalHeight) {
  // One uniform factor preserves the source aspect ratio. Anchor to the top-left
  // because mobile screenshots share the same viewport origin; sub-pixel excess
  // caused by DPR rounding is cropped from the right/bottom, never stretched.
  const scale = Math.max(logicalWidth / source.width, logicalHeight / source.height);
  return {
    scale,
    offsetX: 0,
    offsetY: 0,
    drawWidth: source.width * scale,
    drawHeight: source.height * scale,
  };
}

function drawImageAspectPreserved(ctx, source, transform) {
  ctx.drawImage(source.image, transform.offsetX, transform.offsetY, transform.drawWidth, transform.drawHeight);
}

function sourceLocationFromLogical(location, transform, source) {
  return normalizedLocation(source, {
    x: (location.x - transform.offsetX) / transform.scale,
    y: (location.y - transform.offsetY) / transform.scale,
    width: location.width / transform.scale,
    height: location.height / transform.scale,
  });
}

function regionIntersectionOverUnion(first, second) {
  const x = Math.max(first.x, second.x), y = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);
  const intersection = Math.max(0, right - x) * Math.max(0, bottom - y);
  const union = first.width * first.height + second.width * second.height - intersection;
  return union ? intersection / union : 0;
}

function salientDiffRegions(counts, cols, rows, tile, width, height, globalRatio) {
  const windows = [
    {width: Math.max(tile * 4, Math.round(width * .24)), height: Math.max(tile * 3, Math.round(height * .075)), detailKind: "typography"},
    {width: Math.max(tile * 6, Math.round(width * .36)), height: Math.max(tile * 5, Math.round(height * .15)), detailKind: "visual"},
  ];
  const candidates = [];
  for (const window of windows) {
    const stepX = Math.max(tile * 2, Math.round(window.width / 3));
    const stepY = Math.max(tile * 2, Math.round(window.height / 3));
    for (let y = 0; y < height; y += stepY) for (let x = 0; x < width; x += stepX) {
      const right = Math.min(width, x + window.width), bottom = Math.min(height, y + window.height);
      if (right - x < window.width * .7 || bottom - y < window.height * .7) continue;
      const startColumn = Math.floor(x / tile), endColumn = Math.min(cols - 1, Math.floor((right - 1) / tile));
      const startRow = Math.floor(y / tile), endRow = Math.min(rows - 1, Math.floor((bottom - 1) / tile));
      let changed = 0;
      for (let row = startRow; row <= endRow; row++) for (let column = startColumn; column <= endColumn; column++) changed += counts[row * cols + column];
      const ratio = changed / Math.max(1, (right - x) * (bottom - y));
      if (ratio < Math.max(.16, globalRatio * .72)) continue;
      candidates.push({x, y, width: right - x, height: bottom - y, ratio, detailKind: window.detailKind, relatedCount: 1});
    }
  }
  const selected = [];
  ["typography", "visual"].forEach((detailKind) => {
    candidates
      .filter((candidate) => candidate.detailKind === detailKind)
      .sort((first, second) => second.ratio - first.ratio)
      .forEach((candidate) => {
        const sameKind = selected.filter((item) => item.detailKind === detailKind);
        if (sameKind.length >= 1 || sameKind.some((item) => regionIntersectionOverUnion(item, candidate) > .28)) return;
        selected.push(candidate);
      });
  });
  return selected;
}

function calculateDiff(left, right, pairKey) {
  const pair = PAIRS[pairKey];
  const plan = comparisonPlan(left, right);
  if (!plan.comparable) {
    // Different device viewport, same element scale: an iOS design reviewed against an Android
    // build. Not an error, and not something the pixel pre-scan can help with — overlaying two
    // different canvas widths yields noise — so hand the model no candidates and let it compare the
    // images structurally, with the @1x baselines stated in the prompt.
    if (plan.crossViewport) {
      return {verdict: "REVIEW", issues: [], metrics: {ratio: null, groups: 0, normalized: false,
        crossViewport: true, leftBaseline: plan.leftBase, rightBaseline: plan.rightBase}};
    }
    return {verdict: "FAIL", issues: [{id: "SIZE-001", severity: "P1", category: "前置检查", title: "两张截图无法归一到同一逻辑视口", summary: `${left.width}×${left.height} 与 ${right.width}×${right.height} 的宽高比例不一致，无法仅通过导出倍率解释。`, delta: "两侧可能存在不同视口、裁切范围、方向或页面状态。", expected: "两侧证据应能按同一比例归一到相同逻辑视口。", actual: `设计稿为 ${left.width}×${left.height}px，开发截图为 ${right.width}×${right.height}px。`, recommendation: "确认两侧页面状态与截取范围；若逻辑视口不同，请按同一视口重新截图。", verification: "重新上传后，系统应能推导出相同的逻辑宽高，再开始差异分组。", location: null}], metrics: {ratio: null, groups: 1, normalized: false}};
  }
  const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d", {willReadFrequently: true});
  canvas.width = plan.width; canvas.height = plan.height;
  drawImageAspectPreserved(ctx, left, plan.leftTransform); const a = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  ctx.clearRect(0, 0, canvas.width, canvas.height); drawImageAspectPreserved(ctx, right, plan.rightTransform); const b = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const threshold = 24, tile = Math.max(6, Math.round(Math.max(canvas.width, canvas.height) / 240));
  const cols = Math.ceil(canvas.width / tile), rows = Math.ceil(canvas.height / tile), counts = new Uint32Array(cols * rows);
  let candidates = 0;
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const p = (y * canvas.width + x) * 4;
    if (Math.max(Math.abs(a[p] - b[p]), Math.abs(a[p + 1] - b[p + 1]), Math.abs(a[p + 2] - b[p + 2])) >= threshold) { candidates++; counts[Math.floor(y / tile) * cols + Math.floor(x / tile)]++; }
  }
  const active = counts.map((count, index) => { const col = index % cols, row = Math.floor(index / cols); const area = Math.min(tile, canvas.width - col * tile) * Math.min(tile, canvas.height - row * tile); return count >= Math.max(3, area * .035) ? 1 : 0; });
  const seen = new Uint8Array(active.length), groups = [];
  for (let index = 0; index < active.length; index++) {
    if (!active[index] || seen[index]) continue;
    const queue = [index]; seen[index] = 1; let minC = cols, maxC = 0, minR = rows, maxR = 0;
    while (queue.length) {
      const at = queue.pop(), c = at % cols, r = Math.floor(at / cols); minC = Math.min(minC, c); maxC = Math.max(maxC, c); minR = Math.min(minR, r); maxR = Math.max(maxR, r);
      [[c-1,r],[c+1,r],[c,r-1],[c,r+1],[c-1,r-1],[c+1,r-1],[c-1,r+1],[c+1,r+1]].forEach(([nc,nr]) => { const ni = nr * cols + nc; if (nc >= 0 && nr >= 0 && nc < cols && nr < rows && active[ni] && !seen[ni]) { seen[ni] = 1; queue.push(ni); } });
    }
    groups.push({x: minC * tile, y: minR * tile, width: Math.min(canvas.width, (maxC + 1) * tile) - minC * tile, height: Math.min(canvas.height, (maxR + 1) * tile) - minR * tile});
  }
  const globalRatio = candidates / (canvas.width * canvas.height);
  const moduleGroups = mergeRelatedRegions(groups, canvas.width, canvas.height)
    .map((location) => padRegion(location, canvas.width, canvas.height, Math.max(4, Math.round(tile * .75))))
    .sort((x, y) => y.width * y.height - x.width * x.height);
  const detailGroups = globalRatio >= .0025 && moduleGroups.length
    ? salientDiffRegions(counts, cols, rows, tile, canvas.width, canvas.height, globalRatio)
      .filter((candidate) => !moduleGroups.some((location) => location.width * location.height < canvas.width * canvas.height * .035 && regionIntersectionOverUnion(location, candidate) > .72))
      .map((location) => padRegion(location, canvas.width, canvas.height, Math.max(3, Math.round(tile * .45))))
    : [];
  const consolidatedGroups = [...moduleGroups, ...detailGroups];
  const issues = consolidatedGroups.slice(0, 12).map((location, index) => {
    const leftLocation = sourceLocationFromLogical(location, plan.leftTransform, left);
    const rightLocation = sourceLocationFromLogical(location, plan.rightTransform, right);
    let changed = 0, sampled = 0, deltaTotal = 0;
    for (let y = location.y; y < location.y + location.height; y += 2) for (let x = location.x; x < location.x + location.width; x += 2) {
      const p = (y * canvas.width + x) * 4;
      const delta = Math.max(Math.abs(a[p] - b[p]), Math.abs(a[p + 1] - b[p + 1]), Math.abs(a[p + 2] - b[p + 2]));
      sampled++; deltaTotal += delta; if (delta >= threshold) changed++;
    }
    const zone = describeZone(location, canvas.width, canvas.height);
    const ratio = sampled ? changed / sampled : 0, averageDelta = sampled ? Math.round(deltaTotal / sampled) : 0;
    const likelyContentChange = globalRatio < .025
      && location.height < canvas.height * .14
      && location.width < canvas.width * .62;
    const likelyIconChange = likelyContentChange
      && location.width < canvas.width * .13
      && location.width <= location.height * 1.65;
    const isSalientDetail = Boolean(location.detailKind);
    const isModuleLevel = !likelyContentChange
      && (location.width > canvas.width * .5 || location.height > canvas.height * .22 || location.relatedCount >= 5);
    const componentLabel = location.relatedCount > 1 ? `${location.relatedCount} 个相邻组件` : "局部组件";
    if (isSalientDetail) {
      const centerY = location.y + location.height / 2;
      const isHeroVisual = location.detailKind === "visual" && centerY < canvas.height * .42;
      const title = isHeroVisual
        ? "顶部头图或装饰图形的尺寸与位置不一致"
        : location.detailKind === "typography"
          ? `${zone}的局部文字字号、字重或占位尺寸不一致`
          : `${zone}的局部组件尺寸或视觉表现不一致`;
      return {
        id: `VD-${String(index + 1).padStart(3, "0")}`,
        severity: "P2",
        category: "视觉",
        title,
        summary: "整页差异之外，本地多尺度扫描定位到一个高密度局部差异，保留为独立细节候选供 AI 或人工确认。",
        delta: `该局部约 ${(ratio * 100).toFixed(1)}% 的采样像素超过阈值；需要对照两侧局部图确认具体属于字号、字重、图形尺寸还是位置。`,
        expected: isHeroVisual ? "头图中的主体图形应保持设计稿中的相对尺寸、位置与留白。" : "该局部组件的文字排版、尺寸和视觉层级应与设计稿一致。",
        actual: isHeroVisual ? "实现中的头图主体图形在尺寸或位置上出现明显局部偏差。" : "实现中的局部文字或组件尺寸出现高密度像素偏差。",
        recommendation: isHeroVisual ? "单独核对并按设计稿调整头图主体图形的缩放和位置，不连带修改整页模块。" : "放大对照该局部，按设计稿修正字号、字重、组件尺寸或位置中的实际差异。",
        verification: "在相同逻辑视口复测该局部，确认两侧局部叠加后不再出现集中偏差。",
        location: leftLocation,
        leftLocation,
        rightLocation,
      };
    }
    if (likelyContentChange) return {
      id: `VD-${String(index + 1).padStart(3, "0")}`,
      severity: "P1",
      category: "内容",
      title: likelyIconChange ? `${zone}的局部图标不一致` : `${zone}的局部文案不一致`,
      summary: likelyIconChange ? "差异集中在单个标签的图形区域，不属于整个模块的布局问题。" : "差异集中在单个标签的文字区域，不属于整个模块的布局问题。",
      delta: likelyIconChange ? "当前本地像素检测已定位到具体图标；标签名称可由浏览器文字识别或 AI 语义复核补充。" : "当前本地像素检测已定位到具体文案；新旧文字可由浏览器文字识别或 AI 语义复核补充。",
      expected: likelyIconChange ? "该位置应使用设计稿中的原始图标。" : "该位置应显示设计稿中的原始文案。",
      actual: likelyIconChange ? "实现图在同一标签位置替换了图标。" : "实现图在同一标签位置替换了文案。",
      recommendation: likelyIconChange ? "仅将该标签图标替换为设计稿图标，不改动相邻组件或整个模块布局。" : "仅将该标签文案改回设计稿文案，不改动相邻组件或整个模块布局。",
      verification: likelyIconChange ? "复测该局部标签，确认图标与设计稿一致，且相邻区域不再被误报。" : "复测该局部标签，确认文案与设计稿一致，且相邻区域不再被误报。",
      location: leftLocation,
      leftLocation,
      rightLocation,
    };
    return {
      id: `VD-${String(index + 1).padStart(3, "0")}`,
      severity: ratio > .35 ? "P1" : "P2",
      category: isModuleLevel ? "模块差异" : "组件细节",
      title: isModuleLevel ? `${zone}的模块样式与布局整体不一致` : `${zone}的${componentLabel}存在位置或样式差异`,
      summary: isModuleLevel ? `该范围内 ${location.relatedCount} 个相邻差异片段已合并为一个模块级问题。` : `该标注框对应${componentLabel}，不再拆成多个重复问题。`,
      delta: `标注范围为 x ${location.x}、y ${location.y}、${location.width}×${location.height}px；约 ${(ratio * 100).toFixed(1)}% 的采样像素超过阈值，平均色差 ${averageDelta}。`,
      expected: isModuleLevel ? `基准图中 ${zone} 作为一个完整模块，其组件形态、栅格、间距、内容边界和状态层级应保持一致。` : `基准图中标注框内的${componentLabel}应保持相同的文案、图标、位置、尺寸与状态。`,
      actual: isModuleLevel ? `实现图在该模块内形成 ${location.relatedCount} 个相邻差异片段，说明偏差属于整体结构或组件体系，不应按单个元素重复提报。` : `实现图在标注框内检测到${componentLabel}的连续像素差异；当前仅能确认位置或视觉表现不一致，具体是文案、图标还是状态需结合局部对比图确认。`,
      recommendation: isModuleLevel ? `将整个标注范围作为一个模块统一修正：先对齐组件形态和布局规则，再核对内容与状态；同模块内不要重复创建相同问题。` : `对照上方两张局部图逐项确认这${location.relatedCount > 1 ? location.relatedCount : "一"}个组件的文案、图标、位置、尺寸和状态，并在问题标题中保留确认后的具体差异。`,
      verification: `在相同视口重新截图，确认该标注范围与基准一致，且同一模块不再产生重复差异分组。`,
      location: leftLocation,
      leftLocation,
      rightLocation,
    };
  });
  return {verdict: issues.length ? "REVIEW" : "VISUAL_OK", issues, metrics: {ratio: globalRatio, groups: issues.length, normalized: plan.normalized, normalizationMode: plan.normalized ? "uniform-cover-top-left" : "native", logicalWidth: canvas.width, logicalHeight: canvas.height, leftScale: plan.leftScale, rightScale: plan.rightScale}};
}

function describeZone(location, width, height) {
  if (!location) return "整张截图";
  const centerX = location.x + location.width / 2, centerY = location.y + location.height / 2;
  if (location.width > width * .72 && location.height > height * .24) return "主体内容布局";
  if (centerY < height * .2) return "顶部导航与标题区";
  if (centerY > height * .82) return "底部操作区";
  if (centerX < width * .34) return "内容左侧区域";
  if (centerX > width * .66) return "内容右侧区域";
  return "内容中心区域";
}

function normalizedLocation(source, location) {
  const requested = location || {x: 0, y: 0, width: source.width, height: source.height};
  const x = Math.max(0, Math.min(source.width - 1, Math.round(requested.x)));
  const y = Math.max(0, Math.min(source.height - 1, Math.round(requested.y)));
  const width = Math.max(1, Math.min(source.width - x, Math.round(requested.width)));
  const height = Math.max(1, Math.min(source.height - y, Math.round(requested.height)));
  return {x, y, width, height};
}

function issueLocation(item, side) {
  if (!item) return null;
  return side === "left" ? (item.leftLocation || item.location) : (item.rightLocation || item.location);
}

function defaultIssueLocation(source) {
  if (!source) return null;
  const width = Math.max(80, Math.round(source.width * .42));
  const height = Math.max(80, Math.round(source.height * .2));
  return normalizedLocation(source, {
    x: Math.round((source.width - width) / 2),
    y: Math.round((source.height - height) / 2),
    width,
    height,
  });
}

// Raw pixels alone are not comparable across two images at different export scales: 104×112px on a
// @2x design and 104×112px on a @3x build are different objects. The @1x logical size is what the
// two sides actually share, so the bounds carry it alongside the pixels and the scale it came from.
function formatBounds(location, source) {
  if (!location) return "整张截图";
  const pixels = `x ${location.x} · y ${location.y} · ${location.width}×${location.height}px`;
  if (!source?.width) return pixels;
  const baseline = source.baseline || logicalBaseline(source.width, source.height);
  if (!(baseline?.scale > 1.02)) return pixels;
  const logicalWidth = Math.round(location.width / baseline.scale);
  const logicalHeight = Math.round(location.height / baseline.scale);
  return `${pixels}（@${Number(baseline.scale.toFixed(2))}x → ${logicalWidth}×${logicalHeight}pt）`;
}

// Same exact-pixel crop the card and PDF use, returned as a data URL so the HTML handoff can embed
// the evidence inline. Wide crops are scaled down uniformly — never per-axis — to keep the file sane.
function cropDataUrl(source, location, maxWidth = 1100) {
  if (!source?.image) return "";
  const bounds = normalizedLocation(source, location);
  const scale = Math.min(1, maxWidth / bounds.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bounds.width * scale));
  canvas.height = Math.max(1, Math.round(bounds.height * scale));
  const context = canvas.getContext("2d");
  context.drawImage(source.image, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) =>
    ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[character]);
}

function ExactRegionCrop({source, location, label}) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source?.image) return;
    const bounds = normalizedLocation(source, location), context = canvas.getContext("2d");
    canvas.width = bounds.width;
    canvas.height = bounds.height;
    context.clearRect(0, 0, bounds.width, bounds.height);
    context.drawImage(source.image, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
  }, [source, location?.x, location?.y, location?.width, location?.height]);
  return <canvas ref={canvasRef} className="region-crop" role="img" aria-label={label} />;
}

function RegionComparison({left, right, item, pair, onEnlarge}) {
  const leftBounds = issueLocation(item, "left"), rightBounds = issueLocation(item, "right");
  if ((!leftBounds && !rightBounds) || !left || !right) return null;
  // The card crop is only ~200px wide, which renders a full module at roughly a quarter size — too
  // small to judge shape, weight, or state. Clicking either crop opens both at full card width.
  const enlarge = (event) => { event.stopPropagation(); onEnlarge?.(item); };
  return (
    <div className="region-comparison">
      <figure><figcaption>{pair.label.split(" ↔ ")[0]}</figcaption>
        <div className="region-crop-shell" role="button" tabIndex="0" aria-label={`放大查看 ${item.id} 的两侧证据局部`}
          onClick={enlarge} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") enlarge(event); }}>
          <ExactRegionCrop source={left} location={leftBounds} label={`${item.id} 的左侧证据局部`} />
        </div>
      </figure>
      <figure><figcaption>{pair.label.split(" ↔ ")[1]}</figcaption>
        <div className="region-crop-shell" role="button" tabIndex="0" aria-label={`放大查看 ${item.id} 的两侧证据局部`}
          onClick={enlarge} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") enlarge(event); }}>
          <ExactRegionCrop source={right} location={rightBounds} label={`${item.id} 的右侧证据局部`} />
        </div>
      </figure>
    </div>
  );
}

function evidenceOverviewSources(sources) {
  return ["design", "implementation"]
    .map((kind) => ({kind, source: sources?.[kind]}))
    .filter(({source}) => Boolean(source?.src));
}

function downloadBlob(blob, filename) {
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob); anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
}

function drawContainedImage(ctx, source, location, x, y, width, height) {
  ctx.fillStyle = "#f0f2f5"; ctx.fillRect(x, y, width, height);
  if (!source?.image) return;
  const bounds = normalizedLocation(source, location);
  const scale = Math.min(width / bounds.width, height / bounds.height), dw = bounds.width * scale, dh = bounds.height * scale;
  ctx.drawImage(source.image, bounds.x, bounds.y, bounds.width, bounds.height, x + (width - dw) / 2, y + (height - dh) / 2, dw, dh);
  ctx.strokeStyle = "#d9dce2"; ctx.lineWidth = 2; ctx.strokeRect(x, y, width, height);
}

function drawWidthMatchedEvidencePair(ctx, left, right, leftLocation, rightLocation, xLeft, xRight, y, columnWidth, maxHeight) {
  const leftBounds = normalizedLocation(left, leftLocation), rightBounds = normalizedLocation(right, rightLocation);
  const leftBaseScale = columnWidth / leftBounds.width, rightBaseScale = columnWidth / rightBounds.width;
  const tallestWidthMatchedCrop = Math.max(leftBounds.height * leftBaseScale, rightBounds.height * rightBaseScale);
  // Match the browser issue card: each crop first fills the same column width.
  // If the PDF page is not tall enough, shrink both sides by one shared factor
  // instead of independently fitting each crop to an equal-height box.
  const sharedPageScale = Math.min(1, maxHeight / tallestWidthMatchedCrop);
  const panels = [
    {source: left, bounds: leftBounds, x: xLeft, scale: leftBaseScale * sharedPageScale},
    {source: right, bounds: rightBounds, x: xRight, scale: rightBaseScale * sharedPageScale},
  ];
  panels.forEach(({source, bounds, x, scale}) => {
    ctx.fillStyle = "#f0f2f5"; ctx.fillRect(x, y, columnWidth, maxHeight);
    const drawWidth = bounds.width * scale, drawHeight = bounds.height * scale;
    ctx.drawImage(source.image, bounds.x, bounds.y, bounds.width, bounds.height, x + (columnWidth - drawWidth) / 2, y, drawWidth, drawHeight);
    ctx.strokeStyle = "#d9dce2"; ctx.lineWidth = 2; ctx.strokeRect(x, y, columnWidth, maxHeight);
  });
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 4) {
  const characters = Array.from(String(text || ""));
  let line = "", lines = [];
  characters.forEach((character) => {
    const next = line + character;
    if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = character; } else line = next;
  });
  if (line) lines.push(line);
  if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, -1)}…`; }
  lines.forEach((value, index) => ctx.fillText(value, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

function createOverviewPdfPage(sources, metadata, issueCount) {
  const items = evidenceOverviewSources(sources);
  const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
  canvas.width = 1240; canvas.height = 1754;
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const projectLabel = metadata?.projectName?.trim() || "未命名项目";
  const designerLabel = metadata?.designerName?.trim() || "设计师";
  ctx.fillStyle = "#171719"; ctx.font = '700 34px "PingFang SC", "Microsoft YaHei", sans-serif'; ctx.fillText("设计验收问题清单", 72, 68);
  ctx.font = '22px "PingFang SC", "Microsoft YaHei", sans-serif'; drawWrappedText(ctx, projectLabel, 72, 104, 1096, 27, 2);
  ctx.fillStyle = "#777b83"; ctx.font = '24px "PingFang SC", "Microsoft YaHei", sans-serif'; ctx.fillText(`完整界面概览  ·  ${items.length} 份原始证据  ·  ${issueCount} 项问题`, 72, 166);
  ctx.textAlign = "right"; ctx.fillText(`设计师：${designerLabel}`, 1168, 166); ctx.textAlign = "left";
  ctx.strokeStyle = "#e2e4e8"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(72, 190); ctx.lineTo(1168, 190); ctx.stroke();

  const gap = 24, availableWidth = 940, columnWidth = (availableWidth - gap * Math.max(0, items.length - 1)) / Math.max(1, items.length);
  items.forEach(({kind, source}, index) => {
    const x = 150 + index * (columnWidth + gap);
    ctx.fillStyle = "#202126"; ctx.font = '700 25px "PingFang SC", "Microsoft YaHei", sans-serif'; ctx.fillText(evidenceLabel(kind), x, 240);
    ctx.textAlign = "right"; ctx.fillStyle = "#8a8d95"; ctx.font = '20px "PingFang SC", "Microsoft YaHei", sans-serif'; ctx.fillText(`${source.width}×${source.height}`, x + columnWidth, 240); ctx.textAlign = "left";
    drawContainedImage(ctx, source, null, x, 264, columnWidth, 1100);
    ctx.fillStyle = "#777b83"; ctx.font = '18px "PingFang SC", "Microsoft YaHei", sans-serif';
    const sourceName = source.name || `${evidenceLabel(kind)}原图`;
    drawWrappedText(ctx, sourceName, x, 1400, columnWidth, 26, 2);
  });
  ctx.fillStyle = "#92959c"; ctx.font = '18px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(metadata?.statusLabel || "以下页面按问题展示局部证据与复刻要求", 72, 1694);
  return canvas;
}

function createIssuePdfPage(item, index, total, left, right, pair, metadata) {
  const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
  canvas.width = 1240; canvas.height = 1754;
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const projectLabel = metadata?.projectName?.trim() || "未命名项目";
  const designerLabel = metadata?.designerName?.trim() || "设计师";
  ctx.fillStyle = "#171719"; ctx.font = '700 34px "PingFang SC", "Microsoft YaHei", sans-serif'; ctx.fillText("设计验收问题清单", 72, 68);
  ctx.font = '22px "PingFang SC", "Microsoft YaHei", sans-serif'; drawWrappedText(ctx, projectLabel, 72, 104, 1096, 27, 2);
  ctx.fillStyle = "#777b83"; ctx.font = '24px "PingFang SC", "Microsoft YaHei", sans-serif'; ctx.fillText(`${pair.label}  ·  第 ${index + 1}/${total} 项`, 72, 166);
  ctx.textAlign = "right"; ctx.fillText(`设计师：${designerLabel}`, 1168, 166); ctx.textAlign = "left";
  ctx.strokeStyle = "#e2e4e8"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(72, 190); ctx.lineTo(1168, 190); ctx.stroke();

  ctx.fillStyle = item.severity === "P0" ? "#c63f35" : item.severity === "P1" ? "#a46a00" : "#6d7178"; ctx.font = '700 25px "PingFang SC", "Microsoft YaHei", sans-serif'; ctx.fillText(`${item.id}  ${item.severity}  ${item.category}`, 72, 232);
  ctx.fillStyle = "#1d1e22"; ctx.font = '700 34px "PingFang SC", "Microsoft YaHei", sans-serif'; drawWrappedText(ctx, item.title, 72, 282, 1096, 46, 2);

  ctx.fillStyle = "#656870"; ctx.font = '600 22px "PingFang SC", "Microsoft YaHei", sans-serif'; ctx.fillText(pair.label.split(" ↔ ")[0], 72, 378); ctx.fillText(pair.label.split(" ↔ ")[1], 632, 378);
  drawWidthMatchedEvidencePair(ctx, left, right, issueLocation(item, "left"), issueLocation(item, "right"), 72, 632, 400, 536, 460);

  const sections = [
    ["设计预期", item.expected || item.summary, "#202126"],
    ["实现现状", item.actual || item.delta, "#202126"],
    ["复刻要求", item.recommendation || item.delta, "#8b322c"],
    ["验证方式", item.verification || "在相同视口与状态下重新截图，并与设计基准复核。", "#202126"],
  ];
  let top = 900;
  sections.forEach(([label, value, color], sectionIndex) => {
    if (sectionIndex === 2) { ctx.fillStyle = "#fff2ef"; ctx.fillRect(58, top - 35, 1124, 158); ctx.fillStyle = "#dc4338"; ctx.fillRect(58, top - 35, 5, 158); }
    ctx.fillStyle = color; ctx.font = '700 25px "PingFang SC", "Microsoft YaHei", sans-serif'; ctx.fillText(label, 72, top);
    ctx.fillStyle = sectionIndex === 2 ? "#71312c" : "#555860"; ctx.font = '24px "PingFang SC", "Microsoft YaHei", sans-serif';
    drawWrappedText(ctx, value, 72, top + 42, 1096, 34, 3);
    top += 170;
  });
  ctx.fillStyle = "#92959c"; ctx.font = '20px "PingFang SC", "Microsoft YaHei", sans-serif';
  const leftLabel = evidenceLabel(pair.left), rightLabel = evidenceLabel(pair.right);
  const locationText = `${leftLabel} ${formatBounds(issueLocation(item, "left"), left)}  ·  ${rightLabel} ${formatBounds(issueLocation(item, "right"), right)}`;
  ctx.font = '18px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(locationText, 72, 1650);
  ctx.fillText(`导出时间 ${new Date().toLocaleString("zh-CN")}`, 72, 1694);
  return canvas;
}

function dataUrlBytes(dataUrl) {
  const binary = atob(dataUrl.split(",")[1]), bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function concatBytes(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0), output = new Uint8Array(length);
  let offset = 0; parts.forEach((part) => { output.set(part, offset); offset += part.length; });
  return output;
}

function buildImagePdf(canvases) {
  const encoder = new TextEncoder(), pages = canvases.map((canvas) => canvas.bytes ? canvas : ({width: canvas.width, height: canvas.height, bytes: dataUrlBytes(canvas.toDataURL("image/jpeg", .9))}));
  const objects = [], pageRefs = pages.map((_, index) => 3 + index * 3);
  objects[1] = [encoder.encode("<< /Type /Catalog /Pages 2 0 R >>")];
  objects[2] = [encoder.encode(`<< /Type /Pages /Count ${pages.length} /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(" ")}] >>`)];
  pages.forEach((page, index) => {
    const pageRef = 3 + index * 3, imageRef = pageRef + 1, contentRef = pageRef + 2, imageName = `Im${index}`;
    objects[pageRef] = [encoder.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /${imageName} ${imageRef} 0 R >> >> /Contents ${contentRef} 0 R >>`)];
    objects[imageRef] = [encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`), page.bytes, encoder.encode("\nendstream")];
    const content = `q 595.28 0 0 841.89 0 0 cm /${imageName} Do Q`;
    objects[contentRef] = [encoder.encode(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)];
  });
  const parts = [encoder.encode("%PDF-1.4\n%PDFIMAGE\n")], offsets = [0];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = parts.reduce((sum, part) => sum + part.length, 0);
    parts.push(encoder.encode(`${id} 0 obj\n`), ...objects[id], encoder.encode("\nendobj\n"));
  }
  const xrefOffset = parts.reduce((sum, part) => sum + part.length, 0);
  const xref = ["xref", `0 ${objects.length}`, "0000000000 65535 f "];
  for (let id = 1; id < objects.length; id++) xref.push(`${String(offsets[id]).padStart(10, "0")} 00000 n `);
  xref.push(`trailer\n<< /Size ${objects.length} /Root 1 0 R >>`, `startxref\n${xrefOffset}`, "%%EOF");
  parts.push(encoder.encode(`${xref.join("\n")}\n`));
  return new Blob([concatBytes(parts)], {type: "application/pdf"});
}

function PairSourceHover({source, onUpload, onUnpair}) {
  const [open,setOpen]=useState(false);
  const trigger=useRef(null), closeButton=useRef(null), upload=useRef(null);
  useEffect(()=>{
    if(!open)return;
    closeButton.current?.focus();
    const close=event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();setOpen(false);}if(event.key==="Tab"){event.preventDefault();closeButton.current?.focus();}};
    document.addEventListener("keydown",close,true);
    return()=>{document.removeEventListener("keydown",close,true);trigger.current?.focus({preventScroll:true});};
  },[open]);
  return <>
    <div className="pairing-thumb pairing-action-thumb">
      <img src={source.src} alt={source.name}/>
      <div className="pairing-icon-actions">
        <button ref={trigger} type="button" aria-label="预览" onClick={()=>setOpen(true)}><Icon icon={ViewIcon} size={17}/></button>
        <button type="button" aria-label="重新上传" onClick={()=>upload.current?.click()}><Icon icon={Upload04Icon} size={17}/></button>
        <button type="button" aria-label="取消配对" onClick={onUnpair}><Icon icon={Cancel01Icon} size={17}/></button>
      </div>
      <input ref={upload} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>{if(event.target.files?.length)onUpload(event.target.files);event.target.value="";}}/>
    </div>
    {open&&createPortal(<div className="pair-image-lightbox" onClick={event=>{if(event.target===event.currentTarget)setOpen(false);}}>
      <section role="dialog" aria-modal="true" aria-label="图片预览"><button ref={closeButton} type="button" aria-label="关闭图片预览" onClick={()=>setOpen(false)}><Icon icon={Cancel01Icon}/></button><img src={source.src} alt={`大图 ${source.name}`}/><span title={source.name}>{source.name}</span><small>{source.width} × {source.height}</small></section>
    </div>,document.body)}
  </>;
}

function GroupProgress({value}) {
  return <div className="group-processing-status" role="status">检测中 <strong role="progressbar" aria-label="本组检测进度（估算）" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>{value}%</strong></div>;
}

// The issue title was a single-line input, so anything longer than the rail's width was cut off
// mid-sentence with no way to see the rest short of clicking in and arrowing across. It wraps to two
// lines now and scrolls beyond that, which also keeps the card height bounded. Enter commits instead
// of inserting a newline, and pasted newlines collapse to spaces — a title is one line of prose.
function IssueTitleField({value, ariaLabel, onChange, onClick}) {
  return (
    <Textarea
      className="issue-title-input"
      rows={2}
      value={value}
      aria-label={ariaLabel}
      onClick={onClick}
      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }}
      onChange={(event) => onChange(event.target.value.replace(/[\r\n]+/g, " "))}
    />
  );
}

function CanvasGroupActions({zoom=1,actionsDisabled,onReplace,onDelete,onReview,reviewDisabled,queuePosition=0,groupLabel=""}) {
  const designInput=useRef(null), implementationInput=useRef(null), anchorMarker=useRef(null), bar=useRef(null);
  const [position,setPosition]=useState(null);
  useLayoutEffect(()=>{
    const anchor=anchorMarker.current?.closest(".canvas-page-group, .zoom-surface");
    const stage=anchorMarker.current?.closest(".canvas-stage");if(!anchor||!stage)return;
    const place=()=>{
      const rect=anchor.getBoundingClientRect(),stageRect=stage.getBoundingClientRect(),visible=visibleCanvasBox(stage);
      const width=bar.current?.offsetWidth||124,height=bar.current?.offsetHeight||48;
      const nav=document.querySelector(".screen-switcher")?.getBoundingClientRect();
      const topBound=Math.max(stageRect.top+8,nav?nav.bottom+8:72);
      const x=Math.max(stageRect.left+visible.left+8,Math.min(stageRect.left+visible.left+visible.width-width-8,rect.left+(rect.width-width)/2));
      const y=Math.min(window.innerHeight-height-80,Math.max(topBound,rect.top-height-12));
      setPosition(current=>current?.x===x&&current?.y===y?current:{x,y});
    };
    place();const observer=new ResizeObserver(place);observer.observe(anchor);observer.observe(stage);
    window.addEventListener("scroll",place,true);window.addEventListener("resize",place);
    return()=>{observer.disconnect();window.removeEventListener("scroll",place,true);window.removeEventListener("resize",place);};
  },[zoom]);
  return <><span ref={anchorMarker} hidden/>{createPortal(<div ref={bar} className="canvas-group-actions" role="toolbar" aria-label={groupLabel?`当前组操作 · ${groupLabel}`:"当前组操作"} style={{position:"fixed",zIndex:1500,left:position?.x||0,top:position?.y||0,bottom:"auto",transform:"none",visibility:position?"visible":"hidden"}} onClick={event=>event.stopPropagation()} onPointerDown={event=>event.stopPropagation()}>
    <button type="button" aria-label="更换设计稿" disabled={actionsDisabled} onClick={()=>designInput.current?.click()}><Icon icon={PencilEdit01Icon} size={17}/></button>
    <button type="button" aria-label="更换实现图" disabled={actionsDisabled} onClick={()=>implementationInput.current?.click()}><Icon icon={Image02Icon} size={17}/></button>
    <button type="button" aria-label={queuePosition?`取消验收，排队中（${queuePosition}）`:"开始验收当前组"} disabled={reviewDisabled} onClick={onReview}><Icon icon={queuePosition?Cancel01Icon:AiSearch01Icon} size={17}/></button>
    <button type="button" aria-label="删除该组" disabled={actionsDisabled} onClick={onDelete}><Icon icon={Delete02Icon} size={17}/></button>
    {[["design",designInput],["implementation",implementationInput]].map(([kind,ref])=><input key={kind} ref={ref} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>{const file=event.target.files?.[0];if(file)onReplace(kind,file);event.target.value="";}}/>)}
  </div>,document.body)}</>;
}

function CanvasPageGroup({group, active, stageRef, onSelect, children, progress, onReplace, onDelete, actionsDisabled, zoom, actionsVisible, selected, onReview, reviewDisabled, queuePosition=0, onCancelQueue}) {
  const ref = useRef(null);
  return <section ref={ref} data-screen-id={group.screen.id} className={`canvas-page-group ${selected ? "is-active" : ""}`}
    onClick={(event) => { if (!event.target.closest("button, input, textarea, .issue-box")) onSelect(); }}
    style={{left:group.x,top:group.y,width:group.width,height:group.height}} aria-label={`页面组 ${group.screen.name || group.screen.id}`}>
    {active && actionsVisible && <CanvasGroupActions zoom={zoom} groupLabel={`${group.screen.id} ${group.screen.name||""}`.trim()} actionsDisabled={actionsDisabled} onReplace={onReplace} onDelete={onDelete} onReview={onReview} reviewDisabled={reviewDisabled} queuePosition={queuePosition}/>}
    <header><button type="button" onClick={onSelect}>{group.screen.id} · {group.screen.name || "未命名页面"}</button>{queuePosition>0 && <span className="queue-status">排队中（{queuePosition}）<button type="button" className="queue-cancel" aria-label="取消排队" title="取消排队" onPointerDown={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();onCancelQueue();}}><Icon icon={Cancel01Icon} size={14}/></button></span>}{group.screen.status === "running" && <GroupProgress value={progress}/>}</header>
    {children()}
  </section>;
}

export function App() {
  const canvasStageRef = useRef(null);
  const issueListRef = useRef(null);
  const gestureRef = useRef(null);
  const browserGestureRef = useRef(null);
  const pointerPanRef = useRef(null);
  const issueResizeRef = useRef(null);
  const issueMoveRef = useRef(null);
  // A review covers many screens, not one. Every per-screen slice below lives in `screens[i]`, and the
  // names the rest of this component already uses (`sources`, `reports`, `confirmedIssues`,
  // `ignoredIssues`) are re-exposed as views onto the active screen. That keeps the annotation, crop,
  // normalization, and export code untouched — it still only ever sees one screen at a time.
  const [screens, setScreens] = useState(() => [emptyScreen("S01")]);
  const [activeScreenId, setActiveScreenId] = useState("S01");
  const activeScreen = screens.find((screen) => screen.id === activeScreenId) || screens[0];

  // Twenty-one screens do not fit in a strip of tabs: names truncate, the total issue count only
  // ever appeared inside a re-run warning, and a failed screen looked identical to a clean one. The
  // overview is the answer to "where does this review stand", so it is derived once here and used by
  // both the strip badges and the grid.
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [overviewFilter, setOverviewFilter] = useState("all");
  const [canvasMode, setCanvasMode] = useState("all");
  const [canvasNavigation, setCanvasNavigation] = useState(null);
  const [groupActionsVisible,setGroupActionsVisible]=useState(false);
  const [groupRerun,setGroupRerun]=useState(null);
  useEffect(()=>{
    if(!groupRerun)return;
    const outside=event=>{if(!event.target.closest?.(".group-rerun-popover,[aria-label='开始验收当前组']"))setGroupRerun(null);};
    const key=event=>{if(event.key==="Escape"){event.stopPropagation();setGroupRerun(null);}};
    const dismiss=()=>setGroupRerun(null);
    document.addEventListener("pointerdown",outside,true);document.addEventListener("keydown",key,true);window.addEventListener("resize",dismiss);window.addEventListener("wheel",outside,true);
    return()=>{document.removeEventListener("pointerdown",outside,true);document.removeEventListener("keydown",key,true);window.removeEventListener("resize",dismiss);window.removeEventListener("wheel",outside,true);};
  },[groupRerun]);
  const [selectedGroupIds,setSelectedGroupIds]=useState([]);
  const [selectionRect,setSelectionRect]=useState(null);
  const skipSelectionClick=useRef(false);
  useEffect(()=>{
    const dismiss=event=>{
      if(event.target.closest?.(".canvas-group-actions"))return;
      setGroupActionsVisible(Boolean(event.target.closest?.(".canvas-page-group, .canvas-stage .annotated-frame, .canvas-stage .overlay-frame")));
    };
    document.addEventListener("pointerdown",dismiss,true);
    return()=>document.removeEventListener("pointerdown",dismiss,true);
  },[]);
  const retainedBoard=useRef(null);
  const deletionView=useRef(null);
  useLayoutEffect(()=>{const saved=deletionView.current;if(!saved)return;const stage=canvasStageRef.current,surface=stage?.querySelector(".multi-canvas-surface");if(stage&&surface){const rect=surface.getBoundingClientRect();stage.scrollLeft+=rect.left-saved.left;stage.scrollTop+=rect.top-saved.top;}deletionView.current=null;},[screens]);
  const [keepBoard,setKeepBoard]=useState(false);
  const [newCanvasGroup,setNewCanvasGroup]=useState(null);
  const [newCanvasKind,setNewCanvasKind]=useState("design");
  useEffect(()=>{
    if(!newCanvasGroup)return;
    const previous=document.activeElement;
    const layer=document.querySelector(".new-canvas-group-dialog");layer?.querySelector("button")?.focus();
    const keydown=event=>{
      if(event.key==="Escape"){event.preventDefault();event.stopPropagation();setNewCanvasGroup(null);}
      if(event.key==="Tab"&&layer){const nodes=[...layer.querySelectorAll("button:not(:disabled),input:not(:disabled),[tabindex='0']")];const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
    };
    document.addEventListener("keydown",keydown,true);return()=>{document.removeEventListener("keydown",keydown,true);if(previous?.isConnected)previous.focus?.({preventScroll:true});};
  },[newCanvasGroup?.id]);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMenu, setExportMenu] = useState(null);
  const exportTriggerRef = useRef(null);

  const [exportScope, setExportScope] = useState("all");
  const [exportMode, setExportMode] = useState("merged");
  const [exportFormat, setExportFormat] = useState("html");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportProgress, setExportProgress] = useState("");
  useEffect(() => {
    if (!exportMenu && !exportOpen) return;
    const layer = document.querySelector(exportOpen ? ".page-export-dialog" : ".export-format-menu");
    layer?.querySelector("button, input")?.focus();
    const keydown = event => {
      if (event.key === "Escape" && !exportBusy) {
        event.preventDefault(); event.stopPropagation(); setExportMenu(null); setExportOpen(false); exportTriggerRef.current?.focus();
      }
      if (event.key === "Tab" && layer) {
        const items = [...layer.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled)")];
        const first=items[0], last=items.at(-1);
        if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener("keydown",keydown,true);
    return ()=>document.removeEventListener("keydown",keydown,true);
  }, [exportMenu,exportOpen,exportBusy]);
  const multiCanvas = canvasMode === "all" && (screens.some(screen=>screen.sources.design||screen.sources.implementation) || keepBoard);


  const updateActiveScreen = (patch) => setScreens((current) => current.map((screen) =>
    screen.id === activeScreenId ? {...screen, ...(typeof patch === "function" ? patch(screen) : patch)} : screen));
  const screenSetter = (field) => (value) => updateActiveScreen((screen) =>
    ({[field]: typeof value === "function" ? value(screen[field]) : value}));

  const sources = activeScreen.sources, setSources = screenSetter("sources");
  const reports = activeScreen.reports, setReports = screenSetter("reports");
  const ignoredIssues = activeScreen.ignoredIssues, setIgnoredIssues = screenSetter("ignoredIssues");
  const confirmedIssues = activeScreen.confirmedIssues, setConfirmedIssues = screenSetter("confirmedIssues");

  // Undo covers the whole workbench, not just restored records: every user edit to `screens` (issue
  // text, ignore/restore, annotation drag, inclusion, manual issues) lands in one snapshot stack.
  // Snapshots are cheap because the per-screen slices are already plain, structurally-shared data.
  const editHistory = useRef({past: [], future: [], last: null, mode: "baseline"});
  const [undoDepth, setUndoDepth] = useState(0);
  const [redoDepth, setRedoDepth] = useState(0);

  function resetEditHistory() {
    const store = editHistory.current;
    store.past = []; store.future = []; store.mode = "baseline";
    store.coalescing = false; store.coalesceBase = null; store.lastPushAt = 0;
    setUndoDepth(0); setRedoDepth(0);
  }

  // A drag emits a state change per pointer frame and typing emits one per keystroke. Without
  // grouping, undoing one dragged annotation would take dozens of presses. Drags declare their own
  // start and end; everything else merges changes that land within a short window of the last step.
  const COALESCE_MS = 500;

  function beginCoalescedEdit() {
    const store = editHistory.current;
    if (store.coalescing) return;
    store.coalescing = true;
    store.coalesceBase = store.last;
  }

  function endCoalescedEdit() {
    const store = editHistory.current;
    if (!store.coalescing) return;
    store.coalescing = false;
    const base = store.coalesceBase;
    store.coalesceBase = null;
    if (!base || base === store.last) return;
    store.past.push(base);
    if (store.past.length > 60) store.past.shift();
    store.future = [];
    store.lastPushAt = Date.now();
    setUndoDepth(store.past.length);
    setRedoDepth(0);
  }

  function undoEdit() {
    const store = editHistory.current;
    if (!store.past.length) return;
    const previous = store.past.pop();
    store.future.push(store.last);
    store.mode = "replay";
    store.lastPushAt = 0;
    setScreens(previous);
    setUndoDepth(store.past.length); setRedoDepth(store.future.length);
  }

  function redoEdit() {
    const store = editHistory.current;
    if (!store.future.length) return;
    const next = store.future.pop();
    store.past.push(store.last);
    store.mode = "replay";
    store.lastPushAt = 0;
    setScreens(next);
    setUndoDepth(store.past.length); setRedoDepth(store.future.length);
  }

  // Figma is one way to fill the design slot, not a mode of the whole dialog, so it opens as a popover
  // from that slot instead of swapping the dialog's contents.
  const [figmaOpen, setFigmaOpen] = useState(false);
  const [figmaAnchor, setFigmaAnchor] = useState(null);
  const figmaTriggerRef = useRef(null);
  const [figmaUrl, setFigmaUrl] = useState("");
  const [figmaToken, setFigmaToken] = useState("");
  const [figmaError, setFigmaError] = useState("");
  const [figmaNote, setFigmaNote] = useState("");
  const [loadingFigma, setLoadingFigma] = useState(false);
  const pairKey = "design-implementation";

  // One state per screen, not one number. A screen with zero issues is only "已通过" if it was
  // actually checked — an untested or failed screen reporting 0 is the exact confusion the audit
  // caught, so 未检测 / 检测中 / 失败 / 待确认 / 已通过 are kept distinct all the way to the UI.
  const screenSummaries = useMemo(() => screens.map((screen) => {
    const all = screen.reports?.[pairKey]?.issues || [];
    // A blocker is the model refusing to compare, not a finding. It cannot count toward the issue
    // totals and it must not let the screen read as checked.
    const blockers = all.filter((issue) => issue.kind === "blocker");
    const issues = all.filter((issue) => issue.kind !== "blocker");
    const ignored = screen.ignoredIssues?.[pairKey] || [];
    const counts = {P0: 0, P1: 0, P2: 0};
    issues.forEach((issue) => { if (counts[issue.severity] !== undefined) counts[issue.severity] += 1; });
    const blocking = counts.P0 + counts.P1;
    const paired = Boolean(screen.sources?.design && screen.sources?.implementation);
    const state = screen.status === "running" ? "running"
      : screen.status === "failed" ? "failed"
      : blockers.length ? "blocked"
      : screen.status === "done" ? (blocking ? "blocking" : issues.length ? "review" : "clean")
      : "pending";
    return {screen, id: screen.id, name: screen.name || screen.id, issues, blockers, ignored, counts, blocking, paired, state,
      failure: screen.status === "failed" ? classifyFailure(screen.error) : null};
  }), [screens, pairKey]);

  const coverage = useMemo(() => {
    const tally = {total: screenSummaries.length, pending: 0, running: 0, failed: 0, blocked: 0, blocking: 0, review: 0, clean: 0, issues: 0, blockingIssues: 0, retryable: 0};
    screenSummaries.forEach((item) => {
      tally[item.state] += 1;
      tally.issues += item.issues.length;
      tally.blockingIssues += item.blocking;
      // Only what a retry would actually run. Counting every unfinished screen promised "重试未完成
      // 1 屏" for a structural mismatch, which the retry then skipped — a button that does nothing.
      if ((item.state === "failed" || item.state === "pending") && item.paired
        && (!item.failure || item.failure.retryable)) tally.retryable += 1;
    });
    tally.checked = tally.blocking + tally.review + tally.clean;
    // Not a count of problems. As long as anything is unchecked, in flight, failed, or blocked on a
    // mismatched pair, the review has no verdict yet — "0 个问题" must never read as a pass on a
    // screen the model never saw or refused to compare.
    tally.verdict = tally.pending || tally.running || tally.failed || tally.blocked ? "incomplete"
      : tally.blocking ? "blocking" : tally.review ? "review" : tally.total ? "passed" : "empty";
    return tally;
  }, [screenSummaries]);

  const [view, setView] = useState("annotated");
  const [opacity, setOpacity] = useState(50);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [isCanvasDragging, setIsCanvasDragging] = useState(false);
  // There is no mode to pick. The pointer is the default and leaves annotations draggable; holding
  // Space turns the whole canvas into a drag surface, so a stray drag can never nudge a box.
  const pendingScrollRef = useRef(null);
  // The wheel and gesture listeners are bound once with empty deps, so they read the live zoom from
  // here instead of a render closure that would be stale after the first change.
  const zoomRef = useRef(1);
  const [canvasView, setCanvasView] = useState(null);
  const dockRowRef = useRef(null);
  // The dock sits centred in the canvas and only steps aside when the issue panel would actually
  // cover it. Recentring on every collapse moved a toolbar that was never in the way.
  const [dockShift, setDockShift] = useState(0);
  const [showMinimap, setShowMinimap] = useState(false);
  const minimapToggleRef = useRef(null);
  const viewControlsRef = useRef(null);
  const [showOpacity, setShowOpacity] = useState(false);
  const [spacePanning, setSpacePanning] = useState(false);
  const panMode = spacePanning;
  const [selectedIssue, setSelectedIssue] = useState(0);
  const [issueJump,setIssueJump]=useState(0);
  const [issueFilter, setIssueFilter] = useState("all");
  const [issueTypeFilter, setIssueTypeFilter] = useState("all");
  const [issueSeverityFilter, setIssueSeverityFilter] = useState("all");
  const [copiedPraise, setCopiedPraise] = useState(false);
  const [praiseText, setPraiseText] = useState(PRAISE_TEMPLATES[0]);
  const [praiseGenerationNote, setPraiseGenerationNote] = useState("可以继续编辑，再复制给开发");
  const [isGeneratingPraise, setIsGeneratingPraise] = useState(false);
  const [codexBridge, setCodexBridge] = useState(() => codexBridgeConfig());
  const [codexStatus, setCodexStatus] = useState("checking");
  const [reviewNote, setReviewNote] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisPhase, setAnalysisPhase] = useState("prepare");
  const [aiElapsedMs, setAiElapsedMs] = useState(0);
  const [enlargedIssue, setEnlargedIssue] = useState(null);
  const [railPanel, setRailPanel] = useState(null);
  useEffect(() => {
    if (!figmaOpen) return undefined;
    const close = (event) => {
      // Escape dismisses the popover only. Without stopping here the dialog's own Escape handler also
      // fired and the whole intake dialog closed, losing the material the reviewer had already picked.
      if (event.type === "keydown") {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        setFigmaOpen(false);
        return;
      }
      if (event.target.closest?.(".figma-popover, .figma-entry")) return;
      setFigmaOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", close, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", close, true);
    };
  }, [figmaOpen]);
  // Closing intake must not leave the popover orphaned on screen.
  useEffect(() => { if (railPanel !== "intake") setFigmaOpen(false); }, [railPanel]);

  const [railSticky, setRailSticky] = useState(false);
  // Hover menus must tolerate the trip from the icon to the panel. Closing on the first mouseleave
  // meant any pause in the gap dismissed the panel, so closing is deferred and cancelled on re-entry.
  const railCloseTimer = useRef(null);
  const toolRailRef = useRef(null);
  const intakeModalRef = useRef(null);
  const [history, setHistory] = useState([]);

  // A panel opened by hover should follow the pointer away again; one opened deliberately — the
  // rail button, U, or a double-click on the canvas — must stay until it is dismissed, otherwise the
  // first mouse movement after the click closes it before the reviewer can reach it.
  function openRailPanel(name, sticky = false) {
    window.clearTimeout(railCloseTimer.current);
    setRailSticky(sticky);
    setRailPanel(name);
  }

  useEffect(() => {
    if (railPanel !== "intake") return;
    const frame = requestAnimationFrame(() => intakeModalRef.current?.querySelector("button")?.focus());
    const onKey = event => {
      if (event.key === "Escape") { event.preventDefault(); setRailPanel(null); }
      if (event.key !== "Tab") return;
      const controls = Array.from(intakeModalRef.current?.querySelectorAll('button:not([disabled]), input:not([disabled]):not([type="file"]), a[href], [tabindex="0"]') || []).filter(el => el.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) return;
      if (event.shiftKey && (document.activeElement === first || !intakeModalRef.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown",onKey);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("keydown",onKey); toolRailRef.current?.querySelector('button[data-shortcut="U"]')?.focus(); };
  }, [railPanel]);

  function scheduleRailClose() {
    window.clearTimeout(railCloseTimer.current);
    railCloseTimer.current = window.setTimeout(() => setRailPanel(null), 260);
  }

  // Closing is decided by the pointer's position against the rail's own box, not by mouseleave. The
  // rail is `pointer-events: none` so its children stay clickable without the container swallowing
  // canvas input, and a container that never receives pointer events cannot be trusted to report a
  // leave. The box spans the icons, the gap, and the open panel, so travel between them is inside.
  useEffect(() => {
    if (!railPanel || railSticky) return undefined;
    const onMove = (event) => {
      const rail = toolRailRef.current;
      if (!rail) return;
      const box = rail.getBoundingClientRect();
      const inside = event.clientX >= box.left - 10 && event.clientX <= box.right + 10
        && event.clientY >= box.top - 10 && event.clientY <= box.bottom + 10;
      if (inside) window.clearTimeout(railCloseTimer.current);
      else scheduleRailClose();
    };
    document.addEventListener("pointermove", onMove);
    return () => { document.removeEventListener("pointermove", onMove); window.clearTimeout(railCloseTimer.current); };
  }, [railPanel, railSticky]);

  // A sticky panel is dismissed explicitly instead: Escape, or a press anywhere outside the rail.
  useEffect(() => {
    if (!railPanel || !railSticky || railPanel === "intake") return undefined;
    const onDown = (event) => { if (!toolRailRef.current?.contains(event.target)) setRailPanel(null); };
    const onKey = (event) => { if (event.key === "Escape") setRailPanel(null); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [railPanel, railSticky]);
  // Starts closed: with nothing reviewed there is nothing in it, and it costs the canvas a third of
  // the window. It opens itself the first time findings appear.
  const [issueRailCollapsed, setIssueRailCollapsed] = useState(true);
  const hadFindingsRef = useRef(false);
  const [aiFillingIssueId, setAiFillingIssueId] = useState("");
  const [aiIssueMessages, setAiIssueMessages] = useState({});
  const [activeSourceKind, setActiveSourceKind] = useState("design");
  const [buttonTip, setButtonTip] = useState(null);
  // Empty, not "design". That literal is the `kind` string used for the design side elsewhere and
  // leaked in here as the initial project name, so an untouched workbench showed 「项目：design」 and
  // looked like a project was already open. Display and input both fall back to 未命名项目 on empty,
  // and importing sets the real name from the design filename.
  const [projectName, setProjectName] = useState("");
  const [designerName, setDesignerName] = useState("");
  const [editingProjectName, setEditingProjectName] = useState(false);
  const [editingDesignerName, setEditingDesignerName] = useState(false);
  const [batchDrafts, setBatchDrafts] = useState(null);
  // Exception-first: with 21 pairs the reviewer should only be asked about the ones the matcher is
  // unsure of. The rest are shown on request.
  const [pairFilter, setPairFilter] = useState("pending");
  const [pairPreview, setPairPreview] = useState(null);
  // Discarding an import loses every file the reviewer just dragged in, so Escape asks first.
  const [discardPairs, setDiscardPairs] = useState(false);
  // Set when a run stopped because the provider refused at the account level (no credits, bad
  // credentials). Outranks the per-screen failure in the toast: the consequence for the queue is
  // what the reviewer needs, not the same sentence repeated for one screen.
  const [queueAbort, setQueueAbort] = useState(null);
  // The round being re-reviewed. Holds the previous round's issues per screen so the run can report
  // 已修复 / 仍存在 / 新增 instead of replacing the record and losing the comparison.
  const [baselineRound, setBaselineRound] = useState(null);
  const [roundDiff, setRoundDiff] = useState(null);
  // Which history record the workbench is currently showing, if any. Uploading new evidence would
  // silently overwrite it, so the upload is held here until the reviewer confirms leaving.
  // {id, projectName, snapshot} — the snapshot is what the record looked like when it was opened, so
  // edits made since can be detected and offered for saving.
  const [restoredRecord, setRestoredRecord] = useState(null);
  // Decoding a record's inlined evidence takes a moment. Without its own state the issue list read
  // as a finished, empty review for that moment.
  const [restoringRecord, setRestoringRecord] = useState(false);
  // The rail holds paragraphs of prose next to a canvas that can spare the room. Persisted because
  // re-dragging it on every reload is the kind of small tax that makes a tool feel unfinished.
  const [railWidth, setRailWidth] = useState(() => {
    const stored = Number(window.localStorage?.getItem("zymix-rail-width"));
    return stored >= RAIL_MIN_WIDTH && stored <= RAIL_MAX_WIDTH ? stored : 0;
  });
  const railResizeRef = useRef(null);
  const [leavePrompt, setLeavePrompt] = useState(null);
  const [rerunPrompt, setRerunPrompt] = useState(null);
  const [dismissedFailures, setDismissedFailures] = useState({});
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({done: 0, total: 0, current: ""});
  const batchCancelRef = useRef(false);
  const queuedChanges=useRef(new Map());
  const runningGroupId=useRef(null);
  const liveReviewQueue=useRef(null);
  const [waitingGroupIds,setWaitingGroupIds]=useState([]);
  const refreshWaiting=()=>setWaitingGroupIds(liveReviewQueue.current?.pending().filter(item=>queuedChanges.current.get(item.id)!==null).map(item=>item.id)||[]);
  function submitGroupReview(screen){
    if(liveReviewQueue.current){
      if(batchCancelRef.current)return;
      if(liveReviewQueue.current.enqueue(screen)){
        queuedChanges.current.delete(screen.id);
        setScreens(current=>current.map(item=>item.id===screen.id?{...item,status:"pending"}:item));
        refreshWaiting();
        setBatchProgress(current=>({...current,total:current.total+1}));
      }
    }else runBatch([screen],{partial:true});
  }
  function cancelQueuedReview(id){
    const original=liveReviewQueue.current?.cancel(id);if(!original)return;
    const latest=resolveQueuedScreen(original,queuedChanges.current);
    queuedChanges.current.delete(id);
    setScreens(current=>current.map(item=>item.id===id?{...item,status:latest?.status==="pending"?"idle":latest?.status||"idle"}:item));
    refreshWaiting();
    setBatchProgress(current=>({...current,total:Math.max(current.done,current.total-1)}));
  }
  const sourceLoads=useRef(new Set());
  const canEditGroup=screen=>canEditQueuedScreen(screen,{batchRunning,isAnalyzing,replacing:replacingGroup,runningId:runningGroupId.current});

  // One place decides what is undoable. AI results streaming in during a batch, and the wholesale
  // replacements behind "new task" and "open record", re-baseline instead of stacking dozens of
  // steps the reviewer never took.
  useEffect(() => {
    const store = editHistory.current;
    if (store.last === screens) return;
    if (store.mode === "replay" || store.mode === "baseline" || batchRunning || isAnalyzing) {
      store.mode = "track";
      store.last = screens;
      return;
    }
    // A drag in progress owns its own grouping and commits one step when it ends.
    if (store.coalescing) { store.last = screens; return; }
    // Otherwise fold changes that follow closely on the last step into that step, so a burst of
    // keystrokes is one undo rather than one per character.
    const now = Date.now();
    if (store.past.length && now - (store.lastPushAt || 0) < COALESCE_MS) { store.last = screens; return; }
    store.past.push(store.last);
    if (store.past.length > 60) store.past.shift();
    store.future = [];
    store.last = screens;
    store.lastPushAt = now;
    setUndoDepth(store.past.length);
    setRedoDepth(0);
  }, [screens, batchRunning, isAnalyzing]);

  // Load a whole upload at once and compute each file's layout signature up front, so pairing is a
  // pure local computation and the reviewer sees a proposal without waiting on anything.
  async function loadBatchFiles(fileList) {
    const files = [...fileList].filter((file) => file.type?.startsWith("image/"));
    const loaded = [];
    for (const file of files) {
      try {
        const src = await readFile(file);
        const image = await loadImage(src);
        loaded.push({...image, name: file.name, origin: "upload", baseline: logicalBaseline(image.width, image.height),
          signature: layoutSignature(image.image, image.width, image.height)});
      } catch {
        // Skip unreadable files rather than aborting the whole batch.
      }
    }
    return loaded;
  }

  async function onBatchFiles(kind, fileList, {append = false} = {}) {
    const loaded = await loadBatchFiles(fileList);
    if (!loaded.length) return;
    setBatchDrafts((current) => mergeDraftSources(current, kind, loaded, append));
  }

  const [replacingGroup,setReplacingGroup]=useState(false);
  async function replaceGroupSource(id,kind,file) {
    const original=screens.find(screen=>screen.id===id);
    if(!canEditGroup(original))return;
    sourceLoads.current.add(id);
    setReplacingGroup(true);
    try {
      const [source]=await loadBatchFiles([file]);
      if(!source)throw new Error("图片无法读取，请重新选择");
      if(batchRunning)queuedChanges.current.set(id,{...original,sources:{...original.sources,[kind]:source},reports:{},ignoredIssues:{},confirmedIssues:{},status:"idle",error:""});
      editHistory.current.lastPushAt=0;
      setScreens(current=>current.map(screen=>screen.id===id && screen.sources===original.sources ? {...screen,sources:{...screen.sources,[kind]:source},reports:{},ignoredIssues:{},confirmedIssues:{},status:"idle",error:""}:screen));
      setSelectedIssue(0);setReviewNote("已更换本组素材，请重新检测；可撤销恢复之前的素材与结果。");
    }catch(error){setReviewNote(error.message || "更换失败");}
    finally{sourceLoads.current.delete(id);setReplacingGroup(false);}
  }
  function reviewCanvasGroup(screen,event){
    if(waitingGroupIds.includes(screen.id)){cancelQueuedReview(screen.id);return;}
    if(runningGroupId.current===screen.id||isAnalyzing||codexStatus!=="connected"||batchCancelRef.current&&liveReviewQueue.current)return;
    if(screen.reports?.[pairKey]){const r=event.currentTarget.getBoundingClientRect();const above=r.top>=160;setGroupRerun({id:screen.id,left:Math.max(12,Math.min(window.innerWidth-300,r.left+r.width/2-144)),top:above?r.top-8:r.bottom+8,above});return;}
    submitGroupReview(screen);
  }
  function deleteCanvasGroup(id) {
    if(!canEditGroup(screens.find(screen=>screen.id===id)))return;
    if(batchRunning){cancelQueuedReview(id);queuedChanges.current.set(id,null);}
    editHistory.current.lastPushAt=0;
    if(multiCanvas){const surface=canvasStageRef.current?.querySelector(".multi-canvas-surface");if(surface){const rect=surface.getBoundingClientRect();deletionView.current={left:rect.left,top:rect.top};}retainedBoard.current=retainedBoard.current || boardLayout;setKeepBoard(true);}
    suppressGroupAutoScroll.current=true;
    setCanvasNavigation(null);
    const remaining=screens.filter(screen=>screen.id!==id);
    setScreens(remaining.length?remaining:[emptyScreen("S01")]);
    if(id===activeScreenId){setActiveScreenId(remaining[0]?.id || "S01");setSelectedIssue(0);}
    setGroupActionsVisible(false);
    setReviewNote("已删除该组，可通过撤销恢复。");
  }

  async function loadCanvasGroupImage(kind,files) {
    if(!newCanvasGroup)return;
    const requestId=newCanvasGroup.id;
    setNewCanvasGroup(current=>current&&({...current,loading:true,error:""}));
    const [source]=await loadBatchFiles(files);
    setNewCanvasGroup(current=>current?.id===requestId?{...current,loading:false,error:source?"":"图片无法读取",sources:{...current.sources,...(source?{[kind]:source}:{})}}:current);
  }
  function addCanvasGroup(slot=null){setNewCanvasKind("design");setNewCanvasGroup({id:Date.now(),slot,sources:{},loading:false,error:""});}
  function commitCanvasGroup(){
    if(!newCanvasGroup?.sources.design||!newCanvasGroup.sources.implementation||newCanvasGroup.loading)return;
    const number=Math.max(0,...screens.map(screen=>Number(screen.id.replace(/\D/g,""))||0))+1;
    const id=screenId(number-1);
    const screen={...emptyScreen(id,projectNameFromFile(newCanvasGroup.sources.design.name)),sources:newCanvasGroup.sources};
    retainedBoard.current=boardLayout;
    setKeepBoard(true);setCanvasMode("all");setScreens(current=>[...current.filter(item=>item.sources.design||item.sources.implementation),screen]);setNewCanvasGroup(null);setReviewNote("已添加新组，可开始检测。");
  }

  function removeScreen(id) {
    setScreens((current) => {
      const remaining = current.filter((screen) => screen.id !== id);
      const renumbered = remaining.map((screen, index) => ({...screen, id: screenId(index)}));
      const next = renumbered.length ? renumbered : [emptyScreen("S01")];
      if (id === activeScreenId || !next.some((screen) => screen.id === activeScreenId)) {
        setActiveScreenId(next[0].id);
        setSelectedIssue(0);
      }
      return next;
    });
  }

  // One long design export against several scroll screenshots. Pairing cannot help here — there is
  // one design and N screenshots, so N-1 of them would be left unpaired and the review would cover
  // one screenful of a page that is five screenfuls long.
  const stitchCandidate = useMemo(() => {
    const designs = batchDrafts?.designs || [], shots = batchDrafts?.implementations || [];
    if (designs.length !== 1 || shots.length < 2) return null;
    const design = designs[0], first = shots[0];
    if (!design?.width || !first?.width) return null;
    if (!shots.every((shot) => shot.width === first.width && shot.height === first.height)) return null;
    // The design has to be materially taller than one screen, or these are just N screenshots of N
    // screens that happen to share a device size.
    if (design.height / design.width < (first.height / first.width) * 1.4) return null;
    return {design, shots};
  }, [batchDrafts]);

  const [stitchState, setStitchState] = useState(null);

  // Tied to the dialog, not to the candidate. Clearing it whenever `stitchCandidate` changed wiped
  // the "here is what I did" line the instant stitching succeeded, because succeeding is exactly what
  // makes the candidate stop existing.
  useEffect(() => { if (!batchDrafts) setStitchState(null); }, [batchDrafts]);

  // Measured on demand rather than on load: the row scan costs a few hundred milliseconds, and it is
  // wasted on the common case where the reviewer simply dropped several separate screens.
  async function runStitch() {
    if (!stitchCandidate) return;
    setStitchState({status: "working"});
    // Yield once so the working state paints before the scan blocks the thread.
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    const plan = planStitch(stitchCandidate.shots);
    if (!plan?.ok) {
      setStitchState({status: "failed", reason: plan?.reason || "无法识别这组截图的滚动顺序"});
      return;
    }
    const stitched = stitchScreenshots(stitchCandidate.shots, plan);
    if (!stitched) {
      setStitchState({status: "failed", reason: "拼接失败"});
      return;
    }
    const whole = await loadImage(stitched.src);
    const design = stitchCandidate.design;
    // One screenful is the natural review unit and matches the resolution the model can actually
    // read, so band on the original screenshot height rather than an arbitrary number.
    const bands = planBands(design, whole, stitchCandidate.shots[0].height);
    if (bands && bands.ok === false) {
      setStitchState({status: "failed", reason: bands.reason});
      return;
    }
    if (!bands) {
      setStitchState({status: "failed", reason: "拼接成功，但无法把长图切成可核对的分段"});
      return;
    }
    const designs = [], implementations = [];
    for (const band of bands.bands) {
      const label = String(band.index + 1).padStart(2, "0");
      const designPart = await loadImage(cropSource(design, band.design.top, band.design.height));
      const implementationPart = await loadImage(cropSource(whole, band.implementation.top, band.implementation.height));
      designs.push({...designPart, name: `${projectNameFromFile(design.name)}-段${label}.png`, origin: "sliced",
        baseline: design.baseline || logicalBaseline(designPart.width, designPart.height),
        signature: layoutSignature(designPart.image, designPart.width, designPart.height)});
      implementations.push({...implementationPart, name: `拼接${stitchCandidate.shots.length}张-段${label}.png`, origin: "stitched",
        stitchedFrom: stitchCandidate.shots.map((shot) => shot.name),
        baseline: whole.baseline || logicalBaseline(implementationPart.width, implementationPart.height),
        signature: layoutSignature(implementationPart.image, implementationPart.width, implementationPart.height)});
    }
    setStitchState({status: "done", plan, height: stitched.height, bands: bands.count});
    setReviewNote(`已把 ${stitchCandidate.shots.length} 张截图拼成 ${stitched.width}×${stitched.height}px 长图（去重 ${plan.duplicate}px），并与设计稿对齐切成 ${bands.count} 段逐段核对`);
    // Bands are already in scroll order on both sides, so pin the pairing rather than let the
    // structural matcher re-derive it — adjacent bands of the same page look alike by design.
    setBatchDrafts((current) => current
      ? {...current, designs, implementations, overrides: Object.fromEntries(designs.map((item, index) => [item.name, implementations[index].name])), skipped: {}}
      : current);
  }

  const batchPairs = batchDrafts ? (batchDrafts.rows || assignPairs(batchDrafts.designs, batchDrafts.implementations, batchDrafts.overrides || {})) : [];
  const [newDraftKey, setNewDraftKey] = useState(null);
  // Exception-first only pays off when exceptions exist. The dialog opened on 待配对 unconditionally,
  // so a batch where every pair matched greeted the reviewer with "没有待配对项" — an empty list that
  // reads as "nothing was imported" at the exact moment they want to see their material. Fall back to
  // whichever tab actually holds the pairs, and only do it while the reviewer has not chosen a tab
  // themselves, so this never fights a deliberate switch.
  // The filter is per-import, not per-session: 新建一组 parks the reviewer on 全部 so the empty row it
  // just added is visible, and the fallback below can park them on 已配对. Left as-is, the *next*
  // import opened on that leftover tab instead of the exceptions it should lead with.
  const pairTabTouched = useRef(false);
  useEffect(() => {
    if (batchDrafts) return;
    pairTabTouched.current = false;
    setPairFilter("pending");
    setDiscardPairs(false);
  }, [batchDrafts]);
  useEffect(() => {
    if (!batchDrafts || pairTabTouched.current || pairFilter !== "pending") return;
    const skipped = batchDrafts.skipped || {};
    const rows = batchPairs.map((entry) => ({quality: pairQuality(entry), skipped: Boolean(skipped[pairKeyOf(entry)])}));
    if (rows.some((row) => !row.skipped && row.quality.state !== "ready")) return;
    const ready = rows.some((row) => !row.skipped && row.quality.state === "ready");
    if (ready) setPairFilter("ready");
    else if (rows.length) setPairFilter("all");
  }, [batchDrafts, batchPairs, pairFilter]);

  const pairingListRef = useRef(null);
  useEffect(() => {
    if (!newDraftKey) return;
    const row = Array.from(pairingListRef.current?.children || []).find(el => el.dataset.pairKey === newDraftKey);
    if (row) { row.scrollIntoView({block: "nearest", behavior: "smooth"}); row.focus({preventScroll:true}); setNewDraftKey(null); }
  }, [newDraftKey, batchDrafts, pairFilter]);
  const hasScreens = screens.some((screen) => screen.sources.design && screen.sources.implementation);
  // "Already reviewed" means findings exist that a re-run would throw away, whether they came from
  // this session's AI pass or from a restored record.
  // Ignored issues count too: they are archived work, and a re-run discards them with everything else.
  const completedIssueTotal = screens.reduce((total, screen) =>
    total
    + Object.values(screen.reports || {}).reduce((sum, entry) => sum + (entry?.issues?.length || 0), 0)
    + Object.values(screen.ignoredIssues || {}).reduce((sum, list) => sum + (list?.length || 0), 0), 0);
  // Keyed on a pass having run, not on the issue count: a review whose issues were all ignored still
  // holds work a re-run would discard.
  const hasCompletedReview = screens.some((screen) => Object.keys(screen.reports || {}).length > 0);
  const failureKey = activeScreen.status === "failed" ? `${activeScreen.id}:${activeScreen.error}` : "";
  // The toast carries the classified Chinese reason, not the provider's raw reply. Codex answers in
  // English and repeats itself, so a billing failure read as a 200-character English wall that says
  // nothing about what the reviewer should do. The raw text stays on the element's title and in the
  // 技术详情 fold below, which is where it is actually useful.
  const activeFailure = activeScreen.status === "failed" ? classifyFailure(activeScreen.error) : null;
  const queueAbortMessage = queueAbort
    ? `${queueAbort.title}，已停止检测${queueAbort.skipped ? `并取消排队中的 ${queueAbort.skipped} 组` : ""}` : "";
  const screenFailure = failureKey && !dismissedFailures[failureKey]
    ? `${activeScreen.id} 检测失败：${activeFailure.title}` : "";

  // The toast clears itself, so nothing in it needs a dismiss control. A failed screen stays
  // retryable afterwards: 开始验收 re-runs it along with the rest.
  useEffect(() => {
    // Failures stay until dismissed: a review that did not run is a result the reviewer has to see,
    // and three seconds is easy to miss.
    if (screenFailure) return undefined;
    if (!reviewNote) return undefined;
    const timer = window.setTimeout(() => setReviewNote(""), 3000);
    return () => window.clearTimeout(timer);
  }, [screenFailure, reviewNote, failureKey]);

  // Cache source fingerprints so replacing evidence is saveable without rehashing it on every edit.
  const sourceFingerprints=useRef(new WeakMap());
  function sourceFingerprint(source){
    if(!source)return null;
    if(sourceFingerprints.current.has(source))return sourceFingerprints.current.get(source);
    const data=source.src||"";let hash=2166136261;
    for(let i=0;i<data.length;i++)hash=Math.imul(hash^data.charCodeAt(i),16777619);
    const value=[source.name,source.width,source.height,data.length,hash>>>0];sourceFingerprints.current.set(source,value);return value;
  }
  function sessionFingerprint(list, project=projectName, designer=designerName) {
    return JSON.stringify({project:project?.trim()||"未命名项目",designer:designer?.trim()||"设计师",screens:list.map(screen=>({
      id:screen.id,name:screen.name,sources:Object.fromEntries(Object.entries(screen.sources||{}).map(([kind,source])=>[kind,sourceFingerprint(source)])),
      reports:screen.reports,confirmed:screen.confirmedIssues,ignored:screen.ignoredIssues,
    }))});
  }
  const restoredDirty = Boolean(restoredRecord) && sessionFingerprint(screens) !== restoredRecord.snapshot;

  const [savingRecord,setSavingRecord]=useState(false);
  const saveDisabledReason = savingRecord ? "正在保存，请稍候" : batchRunning || isAnalyzing ? "检测进行中，完成后可保存" : !hasScreens ? "尚无完整配对，请先添加设计稿和实现图" : restoredRecord && !restoredDirty ? "没有新的修改，当前记录已保存" : "";
  async function saveRestoredRecord() {
    if (saveDisabledReason) return;
    const savedId=restoredRecord?.id || `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    setSavingRecord(true);
    const keep = (source) => source && {src: source.src, width: source.width, height: source.height, name: source.name, origin: source.origin, baseline:source.baseline || null};
    const usable = screens.filter((screen) => screen.sources.design && screen.sources.implementation);
    try {
      // Same id, so the record is updated in place rather than duplicated.
      await saveHistory({
        id: savedId,
        createdAt: Date.now(),
        projectName: projectName.trim() || "未命名项目",
        designerName: designerName.trim() || "设计师",
        screenCount: usable.length,
        issueCount: usable.reduce((total, screen) => total + (screen.reports?.[pairKey]?.issues?.length || 0), 0),
        screens: usable.map((screen) => ({
          id: screen.id, name: screen.name, status: screen.status,
          reports: screen.reports, confirmedIssues: screen.confirmedIssues, ignoredIssues: screen.ignoredIssues,
          sources: {design: keep(screen.sources.design), implementation: keep(screen.sources.implementation)},
        })),
      });
      setRestoredRecord({id:savedId,projectName:projectName.trim() || "未命名项目",snapshot:sessionFingerprint(screens)});
      setHistory(await listHistory());
      setReviewNote("走查记录已更新");
    } catch (error) {
      setReviewNote(`保存走查记录失败：${error?.message || error}`);
    } finally { setSavingRecord(false); }
  }

  // One design against one screenshot has nothing to confirm, so commit it straight to a screen and
  // skip the dialog — a single-image review should not cost an extra click. Only when that lone pair
  // fails the plausibility check is the dialog still worth showing.
  const singleObviousPair = batchDrafts && !batchDrafts.rows && batchDrafts.designs.length === 1 && batchDrafts.implementations.length === 1
    && pairQuality(batchPairs.find((entry) => entry.design && entry.implementation) || {}).state === "ready";

  useEffect(() => {
    if (singleObviousPair) commitBatch();
  }, [singleObviousPair]);

  useEffect(() => {
    if (batchDrafts?.rows || (batchDrafts?.designs?.length && batchDrafts?.implementations?.length)) setRailPanel(current => current === "intake" ? null : current);
  }, [batchDrafts]);

  // An explicit override map, not list reordering: the reviewer's choice must survive exactly as
  // given. Assigning an implementation that another design already holds releases it from that one,
  // so a single correction can never silently duplicate a screenshot across two screens.
  // A row is identified by whichever side it has, so a design-less row can still be skipped.
  function pairKeyOf(entry) {
    return draftKey(entry);
  }

  function addDraftGroup() {
    const key = `group:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    setBatchDrafts(current => current ? {...current, rows: [...pinRows(current.rows || assignPairs(current.designs, current.implementations, current.overrides)), {_rowId:key, design:null, implementation:null}]} : current);
    setPairFilter("all"); setNewDraftKey(key);
  }

  function chooseDraftSource(entry, kind, source) {
    const key = pairKeyOf(entry);
    setBatchDrafts(current => {
      if (!current) return current;
      const field = kind === "design" ? "designs" : "implementations";
      const pool = source && !current[field].some(item => item.name === source.name) ? [...current[field],source] : current[field];
      return {...current, [field]:pool, rows:selectDraftSource(current.rows || assignPairs(current.designs,current.implementations,current.overrides),key,kind,source)};
    });

  }

  async function uploadDraftSource(entry, kind, files) {
    const [source] = await loadBatchFiles(files);
    if (source) chooseDraftSource(entry,kind,source);
  }

  function setDraftConfirmation(entry, confirmed) {
    if (confirmed && pairQuality(entry).state === "broken") return;
    setBatchDrafts(current => current ? {...current, rows: confirmDraftPair(current.rows || assignPairs(current.designs,current.implementations,current.overrides), pairKeyOf(entry), confirmed)} : current);
    setReviewNote(confirmed ? "已确认配对，可在已配对中查看或撤销。确认配对不代表验收通过。" : "已撤销配对确认。");
    setPairPreview(null);
  }

  function toggleSkipPair(entry) {
    const key = pairKeyOf(entry);
    setBatchDrafts((current) => {
      if (!current) return current;
      const skipped = {...(current.skipped || {})};
      if (skipped[key]) delete skipped[key]; else skipped[key] = true;
      return {...current, skipped};
    });
  }

  // Picking a different design for a row swaps the two rows' screenshots rather than reordering the
  // list. Anything else would break the one-to-one relationship the whole step depends on: the two
  // designs would either fight over one screenshot or leave another orphaned.
  function swapDesignPairing(currentDesignName, pickedDesignName) {
    if (currentDesignName === pickedDesignName) return;
    setBatchDrafts((current) => {
      if (!current) return current;
      const pairs = assignPairs(current.designs, current.implementations, current.overrides);
      const byDesign = new Map(pairs.filter((entry) => entry.design).map((entry) => [entry.design.name, entry]));
      const here = byDesign.get(currentDesignName), there = byDesign.get(pickedDesignName);
      const overrides = {...(current.overrides || {})};
      // Each design keeps its own row; the screenshots trade places.
      if (there?.implementation) overrides[currentDesignName] = there.implementation.name;
      else delete overrides[currentDesignName];
      if (here?.implementation) overrides[pickedDesignName] = here.implementation.name;
      else delete overrides[pickedDesignName];
      return {...current, overrides};
    });
  }

  // Assigns a screenshot to this design without taking it away from anyone else. The same screenshot
  // may legitimately serve several designs — the same screen on iOS and Android is compared against
  // one design, and one build screenshot can be checked against two design revisions. Automatic
  // matching still prefers unused screenshots; only an explicit pick may duplicate.
  function repairDraft(designName, implementationName) {
    setBatchDrafts((current) => {
      if (!current) return current;
      return {...current, overrides: {...(current.overrides || {}), [designName]: implementationName}};
    });
  }

  // Fills an empty half of a row. The counterpart is already known, so the new file is added to that
  // side's pool and forced onto this pairing rather than left to the matcher to rediscover.
  async function addDraftImage(kind, counterpartName, fileList) {
    const [loaded] = await loadBatchFiles(fileList);
    if (!loaded) return;
    setBatchDrafts((current) => {
      if (!current) return current;
      const field = kind === "design" ? "designs" : "implementations";
      const overrides = {...(current.overrides || {})};
      if (kind === "design") overrides[loaded.name] = counterpartName;
      else overrides[counterpartName] = loaded.name;
      const existing = current[field].some((item) => item.name === loaded.name);
      return {...current, overrides,
        [field]: existing ? current[field].map((item) => item.name === loaded.name ? loaded : item) : [...current[field], loaded]};
    });
  }

  // Replaces one image in place. The reviewer spotted the wrong file on a specific row, so swapping
  // just that entry is the smallest fix — re-picking the whole side would discard their other work.
  async function replaceDraftImage(kind, name, fileList) {
    const [loaded] = await loadBatchFiles(fileList);
    if (!loaded) return;
    setBatchDrafts((current) => {
      if (!current) return current;
      const field = kind === "design" ? "designs" : "implementations";
      const overrides = {...(current.overrides || {})};
      if (kind === "design") { delete overrides[name]; overrides[loaded.name] = overrides[name]; }
      return {...current, overrides,
        [field]: current[field].map((item) => item.name === name ? loaded : item)};
    });
  }

  function startNewTask() {
    resetEditHistory();
    setBaselineRound(null);
    setRoundDiff(null);
    hadFindingsRef.current = false;
    setIssueRailCollapsed(true);
    setScreens([emptyScreen("S01")]);
    setActiveScreenId("S01");
    setBatchDrafts(null);
    setRestoredRecord(null);
    setReviewNote("");
    setProjectName("design");
    setSelectedIssue(0);
    setIssueFilter("all");
    setIssueTypeFilter("all");
    setIssueSeverityFilter("all");
    setZoom(1);
  }

  // Opening the intake while a record is on screen means abandoning it, so the + button asks first.
  function requestIntake(anchorRect) {
    if (!restoredRecord) { openRailPanel("intake", true); return; }
    setLeavePrompt({top: anchorRect.top, left: anchorRect.right + 10});
  }

  // Double-clicking the empty canvas is the same action as the rail's + button, so it routes through
  // requestIntake and inherits the restored-record guard. It anchors the leave prompt to that button.
  function openIntakeFromCanvas() {
    const anchor = toolRailRef.current?.querySelector("button")?.getBoundingClientRect();
    requestIntake(anchor || {top: 140, right: 68});
  }

  function confirmLeaveRecord() {
    setLeavePrompt(null);
    startNewTask();
    openRailPanel("intake", true);
  }

  function commitBatch() {
    const skipped = batchDrafts?.skipped || {};
    const usable = batchPairs.filter(entry => canRunPair(entry, pairQuality(entry), skipped[pairKeyOf(entry)]));
    if (!usable.length) return;
    const built = usable.map((entry, index) => ({
      ...emptyScreen(screenId(index), projectNameFromFile(entry.design.name)),
      sources: {design: entry.design, implementation: entry.implementation},
    }));
    resetEditHistory();
    setScreens(built);
    setActiveScreenId(built[0].id);
    setRestoredRecord(null);
    setProjectName(projectNameFromFile(usable[0].design.name));
    setBatchDrafts(null);
    setSelectedIssue(0);
    setIssueFilter("all");
    return built;
  }

  // Sequential on purpose: a screen takes about a minute, results stream in as each finishes so the
  // reviewer can start triaging screen 1 while the rest run, and one failure never discards the others.
  // `partial` marks a retry of one screen inside an existing run. Such a pass must not archive — it
  // would file a one-screen record over a twenty-one-screen review — and must not recompute the round
  // diff, which is only meaningful across the whole set.
  async function runBatch(target, {partial = false} = {}) {
    if(liveReviewQueue.current)return;
    const queue = (target || screens).filter((screen) => screen.sources.design && screen.sources.implementation);
    if (!queue.length || !codexBridge || codexStatus !== "connected") return;
    liveReviewQueue.current=new ReviewQueue(queue);
    // Share this array so jobs appended during await are consumed by this loop.
    const work=liveReviewQueue.current;
    work.items=queue;
    batchCancelRef.current = false;
    // Collected here rather than read back from state: the archive step used to run on a timer that
    // could fire before React committed the last result, and silently archived nothing.
    const completed = [];
    // Counted separately so the closing note can tell "we refused these pairs" from "the model or
    // the account failed on them": reporting every empty run as 图片不匹配 sent the reviewer off to
    // re-pick screenshots that were fine.
    let mismatched = 0;
    // Set when the provider refuses for a reason no other screen can get past, which ends the run.
    let abort = null;
    setQueueAbort(null);
    queuedChanges.current=new Map();
    refreshWaiting();
    let processed=0;
    const liveTotal=()=>queue.filter(item=>!queuedChanges.current.has(item.id)||queuedChanges.current.get(item.id)!==null).length;
    setBatchRunning(true);
    setScreens(current=>current.map(screen=>queue.some(item=>item.id===screen.id)?{...screen,status:"pending"}:screen));
    setBatchProgress({done: 0, total: queue.length, current: queue[0]?.name || ""});
    for (let index = 0; index < queue.length; index++) {
      if (batchCancelRef.current) break;
      work.index=index;
      refreshWaiting();
      const queued=queue[index];
      while(sourceLoads.current.has(queued.id) && !batchCancelRef.current)await new Promise(resolve=>setTimeout(resolve,50));
      if(batchCancelRef.current)break;
      const screen=resolveQueuedScreen(queued,queuedChanges.current);
      if(!screen)continue;
      runningGroupId.current=screen.id;
      setBatchProgress({done: processed, total: liveTotal(), current: screen.name || screen.id});
      // Refuse before spending the call, not after: an obviously mismatched pair burns a full model
      // request and returns findings about two unrelated screens.
      const plausible = plausiblePair(screen.sources.design, screen.sources.implementation);
      if (!plausible.ok) {
        mismatched += 1;
        setScreens((current) => current.map((item) => item.id === screen.id
          ? {...item, status: "failed", error: plausible.reason} : item));
        setBatchProgress({done: ++processed, total: liveTotal(), current: screen.name || screen.id});
        runningGroupId.current=null;
        continue;
      }
      setScreens((current) => current.map((item) => item.id === screen.id ? {...item, status: "running", error: ""} : item));
      setAnalysisPhase("prepare");
      try {
        setAnalysisPhase("pixels");
        const pixelReports = {[pairKey]: calculateDiff(screen.sources.design, screen.sources.implementation, pairKey)};
        const aiSources = Object.fromEntries(Object.entries(screen.sources)
          .map(([kind, source]) => [kind, createAiSourcePreview(source)])
          .filter(([, source]) => Boolean(source)));
        setAnalysisPhase("ai");
        const reviewed = await requestCodexReview(codexBridge,
          {reports: compactReportsForAi(pixelReports), pairKey, projectName: screen.name || screen.id, sources: aiSources});
        if (!reviewed?.reports || !Object.keys(reviewed.reports).length) throw new Error("AI 未返回可用问题清单");
        setAnalysisPhase("merge");
        const issues = reviewed.reports[pairKey]?.issues || [];
        const confirmed = Object.fromEntries(issues.map((issue) => [`${pairKey}:${issue.id}`, true]));
        completed.push({id: screen.id, name: screen.name || screen.id, left: screen.sources.design,
          right: screen.sources.implementation, issues, reports: reviewed.reports, confirmedIssues: confirmed});
        setScreens((current) => current.map((item) => item.id === screen.id
          ? {...item, reports: reviewed.reports, status: "done", error: "",
             confirmedIssues: Object.fromEntries(issues.map((issue) => [`${pairKey}:${issue.id}`, true]))}
          : item));
      } catch (error) {
        setScreens((current) => current.map((item) => item.id === screen.id
          ? {...item, status: "failed", error: error?.message || "检测失败"} : item));
        // Account-level refusals — no credits, bad credentials — will hit every remaining pair in
        // exactly the same way. Walking the rest of the queue only produces one identical failure
        // per screen and spends the reviewer's time watching it happen, so stop here and say how
        // many were dropped. Not `batchCancelRef`: screens that already passed still get archived.
        const reason = classifyFailure(error?.message);
        if (reason.kind === "credits" || reason.kind === "auth") {
          abort = {title: reason.title, advice: reason.advice,
            // The screen that tripped it is folded into this one message. Left on its own it also
            // qualifies for the per-screen failure toast, so dismissing the queue message brought up
            // a second toast saying the same thing about one screen.
            failureKey: `${screen.id}:${error?.message || "检测失败"}`,
            skipped: queue.slice(index + 1).filter((item) => queuedChanges.current.get(item.id) !== null).length};
          setBatchProgress({done: ++processed, total: liveTotal(), current: screen.name || screen.id});
          runningGroupId.current = null;
          break;
        }
      }
      setBatchProgress({done: ++processed, total: liveTotal(), current: screen.name || screen.id});
        runningGroupId.current=null;
    }
    runningGroupId.current=null;
    const unstarted=queue;
    setScreens(current=>current.map(item=>{const original=unstarted.find(job=>job.id===item.id);return original&&item.status==="pending"?{...item,status:original.status||"idle"}:item;}));
    liveReviewQueue.current=null;
    setWaitingGroupIds([]);
    setAnalysisPhase("prepare");
    setBatchRunning(false);
    // Round comparison, if this run is a re-review. Matching is per screen and keyed on the design
    // filename, because screen ids are reassigned every time a batch is committed.
    if (baselineRound && !partial) {
      const byDesign = new Map(baselineRound.screens.map((screen) => [screen.designName, screen]));
      const perScreen = completed.map((part) => {
        const before = byDesign.get(part.left?.name);
        const diff = matchRounds(before?.issues || [], part.issues || []);
        return {id: part.id, name: part.name, designName: part.left?.name,
          previousCount: before?.issues?.length || 0, ...diff};
      });
      setRoundDiff({
        recordId: baselineRound.recordId,
        projectName: baselineRound.projectName,
        createdAt: baselineRound.createdAt,
        screens: perScreen,
        totals: perScreen.reduce((total, screen) => ({
          previous: total.previous + screen.previousCount,
          fixed: total.fixed + screen.fixed.length,
          carried: total.carried + screen.carried.length,
          added: total.added + screen.added.length,
        }), {previous: 0, fixed: 0, carried: 0, added: 0}),
      });
      // Carry the reviewer's own words forward: an issue that is still open should not lose the
      // wording they rewrote last round, and something they ignored should stay ignored.
      // The merge is computed once, here, and written to BOTH the live screens and the `completed`
      // entries the archive is built from. Archiving the raw AI report instead meant the carried
      // wording survived only until the record was closed: reopening the new round showed the model's
      // text again, so "re-review preserves your work" held on screen but not on disk.
      const carryOver = new Map();
      completed.forEach((part) => {
        const before = byDesign.get(part.left?.name);
        if (!before) return;
        const diff = matchRounds(before.issues || [], part.issues || []);
        const edits = new Map(diff.carried.map(({before: was, after}) => [after.id, was]));
        // Wording the reviewer rewrote on an issue they then ignored has to carry too. Matching only
        // the carried *active* issues re-ignored it correctly but handed back the model's fresh
        // wording, quietly discarding their edit — an issue that comes back ignored is matched by
        // title, so look the edit up the same way.
        const ignoredBefore = new Map((before.ignored || []).map((item) => [normalizeIssueText(item.title), item]));
        const kept = [], reIgnored = [];
        (part.issues || []).forEach((issue) => {
          const was = edits.get(issue.id) || ignoredBefore.get(normalizeIssueText(issue.title));
          const merged = was ? {...issue, title: was.title, expected: was.expected, actual: was.actual,
            recommendation: was.recommendation, carriedFrom: was.originalId || was.id} : issue;
          if (ignoredBefore.has(normalizeIssueText(issue.title))) {
            reIgnored.push({...merged, originalId: merged.id, ignoredKey: `${pairKey}:${Date.now()}:${reIgnored.length}`});
          } else kept.push(merged);
        });
        carryOver.set(part.id, {kept, reIgnored});
        // Same merge into the archive source, so a reopened round shows what the reviewer sees now.
        const report = part.reports?.[pairKey];
        if (report) {
          part.reports = {...part.reports, [pairKey]: {...report, issues: kept, metrics: {...report.metrics, groups: kept.length}}};
          part.issues = kept;
          part.confirmedIssues = Object.fromEntries(kept.map((issue) => [`${pairKey}:${issue.id}`, true]));
          part.ignoredIssues = reIgnored.length ? {[pairKey]: reIgnored} : {};
        }
      });
      setScreens((current) => current.map((screen) => {
        const merged = carryOver.get(screen.id);
        const report = screen.reports?.[pairKey];
        if (!merged || !report) return screen;
        return {...screen,
          reports: {...screen.reports, [pairKey]: {...report, issues: merged.kept, metrics: {...report.metrics, groups: merged.kept.length}}},
          ignoredIssues: merged.reIgnored.length ? {...screen.ignoredIssues, [pairKey]: merged.reIgnored} : screen.ignoredIssues};
      }));
    }
    const refused = queue.length - completed.length;
    if (abort) {
      setQueueAbort(abort);
      setDismissedFailures((current) => ({...current, [abort.failureKey]: true}));
    }
    setReviewNote(abort ? "" : batchCancelRef.current ? "批量检测已中止"
      : partial && queue.length>1 ? `队列验收完成（${completed.length}/${queue.length} 组）`
      : partial ? (completed.length ? `${queue[0]?.name || "本屏"} 重新检测完成` : `${queue[0]?.name || "本屏"} 重新检测仍未通过`)
      : completed.length === 0 ? (mismatched === refused ? "没有可检测的界面：图片不匹配，请重新选择"
        : mismatched ? `本轮没有检测成功：${mismatched} 个界面图片不匹配，其余检测未完成`
        : "本轮没有检测成功，可查看各界面的失败原因")
      : refused > 0 ? (mismatched === refused ? `批量检测完成（${refused} 个界面因图片不匹配被跳过）`
        : mismatched ? `批量检测完成（${mismatched} 个界面图片不匹配，另有 ${refused - mismatched} 个检测未完成）`
        : `批量检测完成（${refused} 个界面检测未完成）`)
      : "批量检测完成");
    if (!batchCancelRef.current && !partial) recordHistory(completed);
  }

  // In-place re-pairing. Reopening the pairing dialog would rebuild `screens` from scratch and throw
  // away every finding and edit in the run, which is far too expensive for "screen 1 got the wrong
  // screenshot". Exchanging one side between two screens keeps both images in play — nothing is
  // orphaned — and only the two screens touched go back to 未检测.
  function swapScreenSource(kind, fromId, toId) {
    if (fromId === toId) return;
    setScreens((current) => {
      const from = current.find((screen) => screen.id === fromId);
      const to = current.find((screen) => screen.id === toId);
      if (!from || !to) return current;
      const a = from.sources[kind], b = to.sources[kind];
      return current.map((screen) => {
        if (screen.id !== fromId && screen.id !== toId) return screen;
        const next = screen.id === fromId ? b : a;
        return {...screen, sources: {...screen.sources, [kind]: next},
          // The old result described a different pair. Keeping it would attribute findings to images
          // that are no longer there, so it is cleared rather than left to look current.
          reports: {}, status: "idle", error: "", confirmedIssues: {}, ignoredIssues: {},
          name: kind === "design" ? projectNameFromFile(next?.name || screen.name) : screen.name};
      });
    });
    setReviewNote(`已交换 ${kind === "design" ? "设计稿" : "实现图"}，两个界面需要重新检测`);
  }

  // Acting on a failure notice is acknowledging it. If the retry fails the same way, the notice has
  // nothing new to say, so it does not come back — a different error still does, because that is new
  // information. The reason stays on the screen's own surfaces either way.
  function acknowledgeFailures(list) {
    const keys = list.filter((screen) => screen.status === "failed" && screen.error)
      .map((screen) => `${screen.id}:${screen.error}`);
    if (keys.length) setDismissedFailures((current) => ({...current, ...Object.fromEntries(keys.map((key) => [key, true]))}));
  }

  function retryScreen(id) {
    const screen = screens.find((item) => item.id === id);
    if (!screen) return;
    acknowledgeFailures([screen]);
    runBatch([screen], {partial: screens.length > 1});
  }

  // Every screen that has not produced a result yet, in one pass. After a 21-screen batch where three
  // timed out, the alternative was hunting for them one tab at a time.
  function retryUnfinished() {
    const pending = screens.filter((screen) => screen.status === "failed" || screen.status === "idle" || !screen.status
      || (screen.status !== "done" && screen.status !== "running"));
    const retryable = pending.filter((screen) => screen.sources.design && screen.sources.implementation
      && classifyFailure(screen.error).retryable !== false);
    if (retryable.length) { acknowledgeFailures(retryable); runBatch(retryable, {partial: retryable.length < screens.length}); }
  }

  // Drive the AI-phase progress curve. Resets whenever the phase changes so a rerun starts over.
  useEffect(() => {
    if (analysisPhase !== "ai") { setAiElapsedMs(0); return undefined; }
    const startedAt = Date.now();
    const timer = window.setInterval(() => setAiElapsedMs(Date.now() - startedAt), 500);
    return () => window.clearInterval(timer);
  }, [analysisPhase]);

  useEffect(() => {
    if (!codexBridge) { setCodexStatus("offline"); return undefined; }
    let cancelled = false;
    fetch(`${codexBridge.origin}/api/health`, {headers: {"X-Zymix-Bridge-Token": codexBridge.token}})
      .then((response) => { if (!cancelled) setCodexStatus(response.ok ? "connected" : "offline"); })
      .catch(() => { if (!cancelled) setCodexStatus("offline"); });
    return () => { cancelled = true; };
  }, [codexBridge]);


  useEffect(() => {
    const onPaste = (event) => {
      const target = event.target;
      if (String(target?.tagName).match(/INPUT|TEXTAREA|SELECT/) || target?.isContentEditable) return;
      const imageItem = Array.from(event.clipboardData?.items || []).find((item) => item.type.startsWith("image/"));
      const rawImage = imageItem?.getAsFile();
      if (!rawImage) return;
      const imageFile = new File([rawImage], `粘贴-${Date.now()}-${Math.random().toString(36).slice(2,6)}.${rawImage.type === "image/jpeg" ? "jpg" : rawImage.type === "image/webp" ? "webp" : "png"}`, {type: rawImage.type});
      event.preventDefault();
      const rowTarget = target?.closest?.("[data-pair-side]");
      if (rowTarget) {
        const entry = batchPairs.find(item => pairKeyOf(item) === rowTarget.closest("[data-pair-key]")?.dataset.pairKey);
        if (entry) uploadDraftSource(entry,rowTarget.dataset.pairSide,[imageFile]);
        return;
      }
      const explicitKind = target?.closest?.("[data-source-kind]")?.dataset.sourceKind;
      if (explicitKind) { onBatchFiles(explicitKind, [imageFile], {append: true}); return; }
      // With the pairing dialog open the reviewer is looking at a specific gap, so a paste fills it
      // rather than joining the pool and being re-matched somewhere else.
      if (batchDrafts) {
        const pairs = batchDrafts.rows || assignPairs(batchDrafts.designs, batchDrafts.implementations, batchDrafts.overrides);
        const missingDesign = pairs.find((entry) => !entry.design && entry.implementation);
        const missingImplementation = pairs.find((entry) => entry.design && !entry.implementation);
        if (missingDesign) { uploadDraftSource(missingDesign,"design",[imageFile]); return; }
        if (missingImplementation) { uploadDraftSource(missingImplementation,"implementation",[imageFile]); return; }
        return;
      }
      // Paste feeds the intake pool like a drop does, so a pasted screenshot joins the batch instead
      // of silently replacing the active screen's evidence.
      onBatchFiles(activeSourceKind, [imageFile], {append: true});
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [activeSourceKind, batchDrafts]);

  useEffect(() => {
    const getButton = (target) => target?.closest?.("button");
    const getLabel = (button) => {
      if (!button || button.getAttribute("aria-describedby") || button.hasAttribute("data-no-tip")) return "";
      return button.getAttribute("aria-label") || button.getAttribute("title") || button.innerText.replace(/\s+/g, " ").trim();
    };
    const showTip = (event) => {
      const button = getButton(event.target), label = getLabel(button);
      if (!label) return;
      const bounds = button.getBoundingClientRect(), below = bounds.top < 72;
      const x = Math.max(86, Math.min(window.innerWidth - 86, bounds.left + bounds.width / 2));
      // The shortcut rides on the element so the tip stays a single source of truth for both.
      setButtonTip({label, shortcut: button.getAttribute("data-shortcut") || "", x, y: below ? bounds.bottom + 8 : bounds.top - 8, below});
    };
    const hideTip = (event) => {
      const button = getButton(event.target);
      if (!button || button.contains(event.relatedTarget)) return;
      setButtonTip(null);
    };
    document.addEventListener("pointerover", showTip);
    document.addEventListener("pointerout", hideTip);
    document.addEventListener("focusin", showTip);
    document.addEventListener("focusout", hideTip);
    return () => {
      document.removeEventListener("pointerover", showTip);
      document.removeEventListener("pointerout", hideTip);
      document.removeEventListener("focusin", showTip);
      document.removeEventListener("focusout", hideTip);
    };
  }, []);

  useEffect(() => {
    const stage = canvasStageRef.current;
    if (!stage) return undefined;
    const onTrackpadPinch = (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      if (!stage.contains(event.target)) return;
      // deltaMode 1 is lines, not pixels; a fixed step per event ignored how far the gesture
      // actually travelled, which is what made fine scrolling feel coarse and fast scrolling slow.
      const pixels = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const step = Math.max(-.25, Math.min(.25, -pixels * .0022));
      changeZoom(zoomRef.current * Math.exp(step), {x: event.clientX, y: event.clientY});
    };
    const onGestureStart = (event) => {
      event.preventDefault();
      browserGestureRef.current = stage.contains(event.target)
        ? {scale: Number(event.scale) || 1, x: event.clientX, y: event.clientY} : null;
    };
    const onGestureChange = (event) => {
      event.preventDefault();
      if (!stage.contains(event.target)) return;
      const gesture = browserGestureRef.current;
      const previous = gesture?.scale || 1, next = Number(event.scale) || previous;
      if (Math.abs(next - previous) < .03) return;
      changeZoom(zoomRef.current * (next / previous), {x: event.clientX ?? gesture?.x, y: event.clientY ?? gesture?.y});
      browserGestureRef.current = {...gesture, scale: next};
    };
    const onGestureEnd = (event) => {
      event.preventDefault();
      browserGestureRef.current = null;
    };
    document.addEventListener("wheel", onTrackpadPinch, {passive: false, capture: true});
    document.addEventListener("gesturestart", onGestureStart, {passive: false, capture: true});
    document.addEventListener("gesturechange", onGestureChange, {passive: false, capture: true});
    document.addEventListener("gestureend", onGestureEnd, {passive: false, capture: true});
    return () => {
      document.removeEventListener("wheel", onTrackpadPinch, true);
      document.removeEventListener("gesturestart", onGestureStart, true);
      document.removeEventListener("gesturechange", onGestureChange, true);
      document.removeEventListener("gestureend", onGestureEnd, true);
    };
  }, []);

  const pair = PAIRS[pairKey], report = reports[pairKey], left = sources[pair.left], right = sources[pair.right];
  const selectedScreens=screens.filter(screen=>selectedGroupIds.includes(screen.id));
  const multiSelection=selectedScreens.length>1;
  const selectedIssueCount=selectedScreens.reduce((sum,screen)=>sum+(screen.reports[pairKey]?.issues?.length||0),0);
  const selectedIgnoredCount=selectedScreens.reduce((sum,screen)=>sum+(screen.ignoredIssues[pairKey]?.length||0),0);
  useEffect(()=>{
    const all=event=>{
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="a" && !event.target.closest?.("input,textarea,select,[contenteditable=true],[role=dialog]")){
        event.preventDefault();event.stopPropagation();setSelectedGroupIds(screens.filter(screen=>screen.sources.design||screen.sources.implementation).map(screen=>screen.id));setCanvasMode("all");setView("annotated");setIssueRailCollapsed(false);setGroupActionsVisible(true);
      }
    };
    const cancelClick=event=>{if(skipSelectionClick.current){event.preventDefault();event.stopPropagation();skipSelectionClick.current=false;}};
    document.addEventListener("keydown",all,true);document.addEventListener("click",cancelClick,true);
    return()=>{document.removeEventListener("keydown",all,true);document.removeEventListener("click",cancelClick,true);};
  },[screens]);
  function beginGroupSelection(event){
    if(!event.shiftKey||event.button!==0||event.target.closest("button,input,textarea,.canvas-group-actions"))return;
    event.preventDefault();event.stopPropagation();
    const start={x:event.clientX,y:event.clientY};
    const base=selectedGroupIds.length?selectedGroupIds:[activeScreenId];
    const move=e=>setSelectionRect({left:Math.min(start.x,e.clientX),top:Math.min(start.y,e.clientY),width:Math.abs(e.clientX-start.x),height:Math.abs(e.clientY-start.y)});
    const up=e=>{
      const rect={left:Math.min(start.x,e.clientX),right:Math.max(start.x,e.clientX),top:Math.min(start.y,e.clientY),bottom:Math.max(start.y,e.clientY)};
      const groups=[...canvasStageRef.current.querySelectorAll(".canvas-page-group")];
      const hits=groups.filter(node=>{const b=node.getBoundingClientRect();return b.right>=rect.left&&b.left<=rect.right&&b.bottom>=rect.top&&b.top<=rect.bottom;}).map(node=>node.dataset.screenId);
      const click=rect.right-rect.left<5&&rect.bottom-rect.top<5;
      const next=new Set(base);hits.forEach(id=>click&&next.has(id)?next.delete(id):next.add(id));
      setSelectedGroupIds([...next]);if(next.size===1)setActiveScreenId([...next][0]);setIssueRailCollapsed(false);setGroupActionsVisible(true);setSelectionRect(null);skipSelectionClick.current=true;setTimeout(()=>{skipSelectionClick.current=false;},0);
      window.removeEventListener("pointermove",move,true);window.removeEventListener("pointerup",up,true);
    };
    window.addEventListener("pointermove",move,true);window.addEventListener("pointerup",up,true);
  }

  // Nothing to compare, annotate, or hide until both images are in. The map is the exception: it
  // still reports where the viewport sits on an empty canvas.
  const boardLayout = useMemo(() => layoutScreensWithAdd(screens,pair), [screens,pair]);

  const suppressGroupAutoScroll = useRef(false);
  function selectCanvasGroup(screenId,event) {
    if(event?.shiftKey){const next=new Set(selectedGroupIds.length?selectedGroupIds:[activeScreenId]);next.has(screenId)?next.delete(screenId):next.add(screenId);setSelectedGroupIds([...next]);if(next.size===1)setActiveScreenId([...next][0]);setIssueRailCollapsed(false);setGroupActionsVisible(true);return;}
    setSelectedGroupIds([]);
    setGroupActionsVisible(true);
    if (screenId === activeScreenId) return;
    suppressGroupAutoScroll.current = true;
    setCanvasNavigation(null);
    setActiveScreenId(screenId); setSelectedIssue(0);
    setIssueFilter("all"); setIssueTypeFilter("all"); setIssueSeverityFilter("all");
  }

  function navigateCanvas(screenId, issueIndex = 0) {
    setIssueJump(value=>value+1);setIssueRailCollapsed(false);
    setGroupActionsVisible(true);
    setActiveScreenId(screenId); setSelectedIssue(issueIndex);
    setIssueFilter("all"); setIssueTypeFilter("all"); setIssueSeverityFilter("all");
    setOverviewOpen(false);
    if (multiCanvas) setCanvasNavigation({screenId});
  }

  function viewAllPages() { setView("annotated"); setCanvasMode("all"); setCanvasNavigation({all:true}); }

  useEffect(() => {
    if (multiCanvas && !retainedBoard.current) setCanvasNavigation(current=>current || {all:true});
  }, [multiCanvas, boardLayout.width, boardLayout.height]);

  useEffect(() => {
    if (!multiCanvas || !canvasNavigation) return;
    const stage = canvasStageRef.current;
    const target = canvasNavigation.all ? stage?.querySelector(".multi-canvas-surface")
      : Array.from(stage?.querySelectorAll(".canvas-page-group") || []).find(el=>el.dataset.screenId===canvasNavigation.screenId);
    if (!stage || !target) return;
    const natural = canvasNavigation.all ? boardLayout : boardLayout.groups.find(g=>g.screen.id===canvasNavigation.screenId);
    if (!natural?.width || !natural?.height) return;
    const available = visibleCanvasBox(stage);
    const scale = Math.max(.03, Math.min(1, available.width/natural.width, (available.height-90)/natural.height));
    pendingScrollRef.current = null;
    if (Math.abs(zoom-scale) > .001) { zoomRef.current=scale; setZoom(scale); return; }
    const frame = requestAnimationFrame(() => {
      const box=target.getBoundingClientRect(), bounds=stage.getBoundingClientRect();
      stage.scrollLeft += box.left-bounds.left+box.width/2-(available.left+available.width/2);
      stage.scrollTop += box.top-bounds.top+box.height/2-stage.clientHeight/2;
      setCanvasNavigation(null); syncCanvasView();
    });
    return () => cancelAnimationFrame(frame);
  }, [canvasNavigation,multiCanvas,zoom,activeScreenId,boardLayout.width,boardLayout.height]);

  useEffect(() => { if (view === "overlay") setCanvasMode("single"); }, [view]);

  const hasEvidence = Boolean(left && right);

  // A finding the model raised to say "these two are not the same screen". It is not a defect the
  // developer can fix, so it never joins the defect list, never counts toward the issue total, and
  // never lets the screen read as checked — it asks for a different screenshot instead.
  const blockerIssues = (report?.issues || []).filter((item) => item.kind === "blocker");
  const defectIssues = report?.issues || [];

  // One explicit state instead of a fall-through. The chain used to end at "clean", so a task with
  // no images at all reached the success wording: an empty workbench claimed "已完成检测，未发现与
  // 设计稿的差异". Zero problems is only a clean result when this pair was actually checked, and even
  // then it is the model's finding, not the reviewer's sign-off.
  const issueListState = (() => {
    if (restoringRecord) return "restoring";
    // Intake is batch-first, so a half-finished selection lives in `batchDrafts` and never reaches
    // `sources` — the canvas really is empty. Reporting only "还没有导入素材" was accurate and
    // useless: say which side is still missing from the selection they have already started.
    // A committed screen always carries both sides, so there is no one-sided state to report here:
    // `commitBatch` only builds pairs that have both, restoring a record skips a screen that lost
    // one, and `swapScreenSource` exchanges two present images. Removal is per screen, never per
    // side — a screen with one image can neither be reviewed nor refilled without rebuilding
    // `screens`, which would discard every finding and edit in the run.
    if (!hasEvidence) return batchDrafts && (batchDrafts.designs?.length || batchDrafts.implementations?.length) ? "staging" : "empty";
    if (activeScreen.status === "running" || isAnalyzing) return "running";
    // A failed AI run does not stop the reviewer: they can still walk the screen by hand and record
    // what they find. The failure block used to win outright, so a manually added problem was
    // counted in 共 N 项问题 and drawn on the canvas while the list kept showing "这一屏没有检测成功"
    // — the card existed but was unreachable. Failure yields to real content; the reason moves to a
    // one-line banner above the list so it is still there after the toast is dismissed.
    if (activeScreen.status === "failed" && !defectIssues.length) return "failed";
    if (blockerIssues.length) return "blocked";
    // No report for the current pair. Replacing either image clears the report, so this also covers
    // "was checked, then one side was swapped" — which must not keep showing the old conclusion.
    if (!report) return "unchecked";
    if (!defectIssues.length) return "clean";
    return "list";
  })();

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const typing = String(target?.tagName).match(/INPUT|TEXTAREA|SELECT/) || target?.isContentEditable;
      // Undo/redo are the one pair that must survive the modifier guard below, and they stay out of
      // text fields so the browser's own text undo keeps working while editing an issue.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !typing) {
        event.preventDefault();
        if (event.shiftKey) redoEdit(); else undoEdit();
        return;
      }
      // Space is a held modifier for panning, not a toggle, so it repeats harmlessly and is released
      // by the keyup listener below.
      if (event.code === "Space" && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        setSpacePanning(true);
        return;
      }
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || typing) return;
      // Delete archives the selected annotation. It maps to 忽略, not removal: ignoring is reversible
      // in this product, so the issue keeps its edits and both crops and can be restored later.
      if (event.key === "Delete" || event.key === "Backspace") {
        const issues = report?.issues || [];
        const target = issues[selectedIssue];
        if (!target) return;
        event.preventDefault();
        ignoreIssue(target.id, selectedIssue);
        return;
      }
      // Canvas shortcuts. Each one mirrors a control in the dock, and the dock advertises the key in
      // its tooltip, so the two never drift apart.
      const key = event.key.toLowerCase();
      if (key === "h") { event.preventDefault(); if (hasEvidence) setShowAnnotations((current) => !current); return; }
      if (key === "a") { event.preventDefault(); if (hasEvidence) setView("annotated"); return; }
      if (key === "o") { event.preventDefault(); if (hasEvidence) setView("overlay"); return; }
      if (key === "0") { event.preventDefault(); changeZoom(1); return; }
      if (key === "f") { event.preventDefault(); if (hasEvidence) fitToCanvas(); return; }
      if (key === "=" || key === "+") { event.preventDefault(); changeZoom(steppedZoom(1)); return; }
      if (key === "-" || key === "_") { event.preventDefault(); changeZoom(steppedZoom(-1)); return; }
      if (key === "r") {
        event.preventDefault();
        if (hasScreens && !batchRunning && !isAnalyzing && codexStatus === "connected") runBatch();
        return;
      }
      // Panel shortcuts. U and L mirror the two rail entries, I mirrors the issue rail's collapse
      // toggle, and each control carries the same key in data-shortcut so the tooltip cannot drift.
      if (key === "u") {
        event.preventDefault();
        if (railPanel === "intake" && railSticky) setRailPanel(null); else openIntakeFromCanvas();
        return;
      }
      if (key === "l") { event.preventDefault(); if (railPanel === "history" && railSticky) setRailPanel(null); else openRailPanel("history", true); return; }
      if (key === "i") { event.preventDefault(); setIssueRailCollapsed((current) => !current); return; }
      if (key === "m") { event.preventDefault(); setShowMinimap((current) => !current); return; }

    };
    const onKeyUp = (event) => { if (event.code === "Space") setSpacePanning(false); };
    // A drag that outlives the window blur would otherwise leave the canvas stuck in pan mode.
    const dropSpace = () => setSpacePanning(false);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", dropSpace);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", dropSpace);
    };
  }, [view, report, selectedIssue, zoom, hasScreens, batchRunning, isAnalyzing, codexStatus, railPanel, railSticky, restoredRecord, undoDepth, redoDepth, hasEvidence]);

  // Measured from the DOM rather than derived from the zoom maths, so the minimap stays honest
  // whatever the extent padding, centring, and image aspect ratios work out to.
  function measureCanvasView() {
    const stage = canvasStageRef.current;
    if (!stage || !stage.scrollWidth) return null;
    const stageRect = stage.getBoundingClientRect();
    const frames = Array.from(stage.querySelectorAll(multiCanvas ? ".canvas-page-group" : ".annotated-frame, .overlay-frame")).map((node, index) => {
      const rect = node.getBoundingClientRect();
      return {
        key: index,
        x: rect.left - stageRect.left + stage.scrollLeft,
        y: rect.top - stageRect.top + stage.scrollTop,
        width: rect.width,
        height: rect.height,
      };
    });
    return {
      scrollWidth: stage.scrollWidth, scrollHeight: stage.scrollHeight,
      clientWidth: stage.clientWidth, clientHeight: stage.clientHeight,
      left: stage.scrollLeft, top: stage.scrollTop,
      frames,
    };
  }

  useEffect(() => {
    const stage = canvasStageRef.current;
    if (!stage) { setCanvasView(null); return undefined; }
    // Panning only changes where the viewport sits; the frames keep their place in the content, so
    // scrolling patches two numbers instead of re-measuring the DOM. Nothing here is deferred to
    // requestAnimationFrame, which does not run while the tab is hidden and left the map stale.
    const onScroll = () => setCanvasView((current) =>
      current ? {...current, left: stage.scrollLeft, top: stage.scrollTop} : measureCanvasView());
    const remeasure = () => setCanvasView(measureCanvasView());
    remeasure();
    stage.addEventListener("scroll", onScroll, {passive: true});
    const observer = new ResizeObserver(remeasure);
    observer.observe(stage);
    // The zoom surface animates its width, so a measurement taken on the React commit catches a
    // mid-transition size and leaves the map showing the wrong scale. Observing the surface itself
    // re-measures once the animation settles.
    const surface = stage.querySelector(".zoom-surface");
    if (surface) observer.observe(surface);
    return () => { stage.removeEventListener("scroll", onScroll); observer.disconnect(); };
  }, [left, right, view, zoom, showAnnotations, report, issueRailCollapsed, multiCanvas, boardLayout.width, boardLayout.height]);

  // Zoom re-anchors on the previous viewport centre; the new scroll offset can only be applied once
  // the resized surface has been laid out.
  useEffect(() => {
    zoomRef.current = zoom;
    const stage = canvasStageRef.current, pending = pendingScrollRef.current;
    if (!stage) return;
    pendingScrollRef.current = null;
    const surface = zoomAnchorElement(stage);
    if (pending && surface) {
      // Runs after layout, so these are the post-zoom sizes. Put the same fraction of the surface
      // back under the same viewport point.
      const bounds = stage.getBoundingClientRect(), box = surface.getBoundingClientRect();
      const surfaceLeft = box.left - bounds.left + stage.scrollLeft;
      const surfaceTop = box.top - bounds.top + stage.scrollTop;
      stage.scrollLeft = surfaceLeft + pending.fractionX * box.width - pending.pointX;
      stage.scrollTop = surfaceTop + pending.fractionY * box.height - pending.pointY;
    }
    syncCanvasView();
  }, [zoom]);

  // The extent puts a viewport of empty space on every side, so an untouched canvas would otherwise
  // open somewhere in that padding rather than on the artwork.
  useEffect(() => {
    const stage = canvasStageRef.current;
    if (!stage) return;
    if (multiCanvas) return;
    // Applies to the empty canvas too: it now sits in the same extent, so without this the start
    // hint would open somewhere out in the surrounding space rather than in front of the reviewer.
    stage.scrollLeft = (stage.scrollWidth - stage.clientWidth) / 2;
    stage.scrollTop = (stage.scrollHeight - stage.clientHeight) / 2;
    syncCanvasView();
  }, [left?.src, right?.src, view, hasEvidence, multiCanvas]);

  // Programmatic scrolling does not always deliver a scroll event before the next paint, and the
  // centring effect runs after the measuring one, so every deliberate move re-reads the position
  // instead of trusting the listener to have caught it.
  function syncCanvasView() { setCanvasView(measureCanvasView()); }

  function navigateFromMinimap(event, scale) {
    const stage = canvasStageRef.current;
    if (!stage || !scale) return;
    const box = event.currentTarget.getBoundingClientRect();
    stage.scrollLeft = (event.clientX - box.left) / scale - stage.clientWidth / 2;
    stage.scrollTop = (event.clientY - box.top) / scale - stage.clientHeight / 2;
    syncCanvasView();
  }

  // The opacity control only means anything in overlay, so it follows the view rather than being a
  // separate thing to remember to open.
  useEffect(() => { setShowOpacity(view === "overlay"); }, [view]);

  // Measured rather than derived: the dock's width changes with the batch progress label, the issue
  // count badge, and the screen count, so a fixed threshold would be wrong as soon as any of those
  // changed. Only the overlap is compensated, so a dock that already clears the panel never moves.
  useEffect(() => {
    const row = dockRowRef.current;
    if (!row) return undefined;
    const measure = () => {
      const pills = [...row.children];
      const parent = row.offsetParent;
      if (!pills.length || !parent) return;
      const rail = document.querySelector(".issue-rail");
      const railBox = rail?.getBoundingClientRect();
      if (!railBox || !railBox.width) { setDockShift(0); return; }
      // Derived from layout, never from the shifted geometry. Reading the transformed element meant
      // measuring a transition in flight, so each pass added to the last and the offset crept.
      // offsetLeft/offsetWidth ignore transforms; the content width is transform-invariant because
      // both edges are translated equally.
      const parentLeft = parent.getBoundingClientRect().left;
      const centre = parentLeft + row.offsetLeft + row.offsetWidth / 2;
      const contentWidth = pills[pills.length - 1].getBoundingClientRect().right - pills[0].getBoundingClientRect().left;
      const restingRight = centre + contentWidth / 2, restingLeft = centre - contentWidth / 2;
      const overlap = restingRight - (railBox.left - 12);
      // Never push it past the opposite edge; a partial shift beats vanishing off-screen.
      setDockShift(Math.round(Math.max(0, Math.min(overlap, restingLeft - parentLeft - 16))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    const rail = document.querySelector(".issue-rail");
    if (rail) observer.observe(rail);
    // The panel animates its width, so the measurement taken on this commit still sees the old
    // geometry and lands one state behind. Re-measure when that animation finishes — and on a timer
    // as well, because a ResizeObserver does not fire while the tab is hidden.
    const onTransitionEnd = (event) => { if (event.propertyName === "width") measure(); };
    rail?.addEventListener("transitionend", onTransitionEnd);
    const settle = window.setTimeout(measure, 240);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      rail?.removeEventListener("transitionend", onTransitionEnd);
      window.clearTimeout(settle);
      window.removeEventListener("resize", measure);
    };
  }, [issueRailCollapsed, batchRunning, screens.length, report?.issues?.length, hasEvidence, restoredDirty, undoDepth, redoDepth]);

  // Only on the transition into having findings, and only ever to open. Auto-closing when the last
  // issue is ignored would yank the panel away mid-edit.
  useEffect(() => {
    const hasFindings = Boolean(report?.issues?.length);
    if (hasFindings && !hadFindingsRef.current) setIssueRailCollapsed(false);
    hadFindingsRef.current = hasFindings;
  }, [report?.issues?.length]);

  useEffect(() => { listHistory().then(setHistory); }, []);

  // A record is the working session, not a finished report: opening one puts the reviewer back where
  // they left off — same screens, same evidence, same issues, edits and ignored archive — so the pass
  // can be continued or revised. Exporting is still available from the restored session.
  async function openHistoryRecord(id) {
    const record = history.find((item) => item.id === id);
    if (!record) return;
    // Records written before history stored the working session only carry a rendered report; say so
    // instead of doing nothing when one is clicked.
    if (!record.screens?.length) {
      setReviewNote("这条记录来自旧版本，只存了导出结果，无法恢复现场");
      return;
    }
    setReviewNote("正在恢复走查记录…");
    setRestoringRecord(true);
    try {
      const restored = [];
      for (const screen of record.screens) {
        const sources = {};
        for (const kind of ["design", "implementation"]) {
          const stored = screen.sources?.[kind];
          if (!stored?.src) continue;
          // HTMLImageElement cannot be persisted, so rebuild it from the stored data URL.
          const loaded = await loadImage(stored.src);
          sources[kind] = {...loaded, name: stored.name, origin: stored.origin || "upload"};
        }
        if (!sources.design || !sources.implementation) continue;
        restored.push({...emptyScreen(screen.id, screen.name), sources,
          reports: screen.reports || {}, confirmedIssues: screen.confirmedIssues || {},
          ignoredIssues: screen.ignoredIssues || {}, status: screen.status || "done"});
      }
      if (!restored.length) { setReviewNote("这条记录缺少可恢复的素材"); return; }
      const renumbered = restored.map((screen, index) => ({...screen, id: screenId(index)}));
      resetEditHistory();
      setBaselineRound(null);
      setRoundDiff(null);
      setScreens(renumbered);
      setActiveScreenId(renumbered[0].id);
      setProjectName(record.projectName || "未命名项目");
      setDesignerName(record.designerName === "设计师" ? "" : (record.designerName || ""));
      setSelectedIssue(0);
      setIssueFilter("all");
      setIssueTypeFilter("all");
      setIssueSeverityFilter("all");
      setRailPanel(null);
      setRestoredRecord({id: record.id, projectName: record.projectName, snapshot: sessionFingerprint(renumbered, record.projectName, record.designerName)});
      setReviewNote(`已恢复走查记录：${record.projectName}`);
      // Restoring at 100% left a phone screenshot pair overflowing the stage top and bottom, so the
      // reviewer could not see either image whole without hunting for the zoom control. Fit instead —
      // a restored record has no viewport of the reviewer's own to preserve.
      fitToCanvas({defer: true});
    } catch (error) {
      setReviewNote(`恢复走查记录失败：${error?.message || error}`);
    } finally {
      setRestoringRecord(false);
    }
  }

  // Designs carry over from the round being re-reviewed; only new screenshots are needed. The old
  // record is left untouched — this is the guarantee the audit called out as P0.
  async function startReReview(id) {
    const record = history.find((item) => item.id === id);
    if (!record?.screens?.length) { setReviewNote("这条记录缺少可复验的素材"); return; }
    setReviewNote("正在准备复验…");
    try {
      const designs = [];
      const baseline = [];
      for (const screen of record.screens) {
        const stored = screen.sources?.design;
        if (!stored?.src) continue;
        const loaded = await loadImage(stored.src);
        designs.push({...loaded, name: stored.name || `${screen.name}.png`, origin: stored.origin || "upload",
          baseline: stored.baseline || logicalBaseline(loaded.width, loaded.height),
          signature: layoutSignature(loaded.image, loaded.width, loaded.height)});
        baseline.push({
          name: screen.name,
          designName: stored.name || `${screen.name}.png`,
          issues: screen.reports?.[pairKey]?.issues || [],
          ignored: screen.ignoredIssues?.[pairKey] || [],
        });
      }
      if (!designs.length) { setReviewNote("这条记录里的设计稿无法读取"); return; }
      resetEditHistory();
      setScreens([emptyScreen("S01")]);
      setActiveScreenId("S01");
      setRestoredRecord(null);
      setRoundDiff(null);
      setBaselineRound({recordId: record.id, projectName: record.projectName, createdAt: record.createdAt, screens: baseline});
      setProjectName(record.projectName || "未命名项目");
      setDesignerName(record.designerName === "设计师" ? "" : (record.designerName || ""));
      setBatchDrafts({designs, implementations: [], overrides: {}, skipped: {}});
      setPairFilter("pending");
      openRailPanel("intake", true);
      setReviewNote(`复验「${record.projectName}」：设计稿已带入 ${designs.length} 个界面，请选择本轮的实现截图`);
    } catch (error) {
      setReviewNote(`准备复验失败：${error?.message || error}`);
    }
  }

  async function removeHistoryRecord(id) {
    await deleteHistory(id);
    setHistory(await listHistory());
  }

  // Escape used to throw the whole import away in one keystroke — every dragged file, every manual
  // correction, no undo. It now asks. Nested layers (file picker, preview, lightbox) own Escape
  // first: they live in child components, so their stopPropagation cannot stop this window-level
  // listener, and the DOM is the one place that knows which of them is actually open.
  useEffect(() => {
    if (!batchDrafts) return undefined;
    const close = (event) => {
      if (event.key !== "Escape") return;
      if (document.querySelector(".file-picker-popover, .pair-source-popover, .pair-preview, .pair-image-lightbox")) return;
      event.preventDefault();
      setDiscardPairs((open) => (open ? false : true));
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [batchDrafts]);

  useEffect(() => {
    if (!reviewNote || batchRunning || isAnalyzing) return undefined;
    const timer = window.setTimeout(() => setReviewNote(""), 6000);
    return () => window.clearTimeout(timer);
  }, [reviewNote, batchRunning, isAnalyzing]);

  useEffect(() => {
    if (!pairPreview) return undefined;
    const close = (event) => { if (event.key === "Escape") { event.stopPropagation(); setPairPreview(null); } };
    window.addEventListener("keydown", close, true);
    return () => window.removeEventListener("keydown", close, true);
  }, [pairPreview]);

  useEffect(() => {
    if (!enlargedIssue) return undefined;
    const close = (event) => { if (event.key === "Escape") setEnlargedIssue(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [enlargedIssue]);

  useEffect(() => {
    if (!overviewOpen) return undefined;
    const close = (event) => { if (event.key === "Escape") { event.stopPropagation(); setOverviewOpen(false); } };
    window.addEventListener("keydown", close, true);
    return () => window.removeEventListener("keydown", close, true);
  }, [overviewOpen]);

  // Keep the canvas marker and the issue card for the selected issue both on screen. Selecting an
  // issue used to leave the canvas wherever it was, so on a long screenshot the reviewer had to hunt
  // for the matching box by hand. Scrolls only the given container (never the page), and does
  // nothing when the target is already visible, so it cannot fight the reviewer's own scrolling.
  useEffect(() => {
    if (suppressGroupAutoScroll.current) { suppressGroupAutoScroll.current = false; return; }
    if (!report?.issues?.length) return;
    const centreWithin = (container, element) => {
      if (!container || !element) return;
      const box = container.getBoundingClientRect(), target = element.getBoundingClientRect();
      if (target.top >= box.top && target.bottom <= box.bottom) return;
      const delta = target.top - box.top - Math.max(0, (box.height - target.height) / 2);
      // Smooth scrolling is a silent no-op while the document is hidden, which would leave the two
      // panes out of sync after a background rerun. Fall back to an instant jump when hidden.
      container.scrollTo({top: container.scrollTop + delta, behavior: document.hidden ? "auto" : "smooth"});
    };
    const scope = multiCanvas ? Array.from(canvasStageRef.current?.querySelectorAll(".canvas-page-group") || []).find(el=>el.dataset.screenId===activeScreenId) : canvasStageRef.current;
    centreWithin(canvasStageRef.current, scope?.querySelector(`.issue-box[data-issue-index="${selectedIssue}"]`));
    centreWithin(issueListRef.current, [...(issueListRef.current?.querySelectorAll(".issue-card[data-issue-index]")||[])].find(node=>node.dataset.screenId===activeScreenId&&Number(node.dataset.issueIndex)===selectedIssue));
  }, [selectedIssue, report, view, activeScreenId, multiCanvas]);
  useLayoutEffect(()=>{
    if(!issueJump || issueRailCollapsed)return;
    const list=issueListRef.current;if(!list)return;
    const card=[...list.querySelectorAll(".issue-card[data-issue-index]")].find(node=>node.dataset.screenId===activeScreenId && Number(node.dataset.issueIndex)===selectedIssue);
    if(!card)return;
    const bounds=list.getBoundingClientRect(),rect=card.getBoundingClientRect();
    if(rect.top<bounds.top || rect.bottom>bounds.bottom)list.scrollTop+=rect.top-bounds.top-12;
  },[issueJump,selectedIssue,activeScreenId,multiSelection,issueRailCollapsed,issueFilter]);

  // Blockers are excluded from every count, filter, and export: they say "these are different
  // screens", which is not something a developer can fix and must not leave the workbench as a bug
  // report. They keep their index in `report.issues` so annotations and undo stay aligned.
  const confirmedCount = defectIssues.length;
  const ignoredList = ignoredIssues[pairKey] || [];
  const issueTabSource = issueFilter === "ignored"
    ? ignoredList
    : defectIssues;
  const issueTypeCounts = ISSUE_TYPES.reduce((counts, type) => ({...counts, [type]: issueTabSource.filter((item) => normalizedIssueType(item) === type).length}), {});
  const issueSeverityCounts = ISSUE_SEVERITIES.reduce((counts, severity) => ({...counts, [severity]: issueTabSource.filter((item) => item.severity === severity).length}), {});
  const matchesIssueFilters = (item) => (issueTypeFilter === "all" || normalizedIssueType(item) === issueTypeFilter)
    && (issueSeverityFilter === "all" || item.severity === issueSeverityFilter);
  const filteredIssueEntries = (report?.issues || [])
    .map((item, index) => ({item, index}))
    .filter(({item}) => matchesIssueFilters(item));
  const filteredIgnoredIssues = ignoredList.filter(matchesIssueFilters);
  const fidelity = report?.metrics?.ratio == null ? null : Math.max(0, Math.min(100, (1 - report.metrics.ratio) * 100));
  // Never congratulate on a pair the model refused to compare, and never on an unchecked screen.
  const showPraise = fidelity != null && fidelity >= 95 && issueListState !== "blocked"
    && (issueListState === "clean" || issueListState === "list");

  async function onFile(kind, file, metadata = {}) {
    if (!file || !file.type?.startsWith("image/")) return;
    const src = await readFile(file), loaded = await loadImage(src);
    const displayName = metadata.name || file.name;
    setSources((current) => ({...current, [kind]: {...loaded, name: displayName, origin: metadata.origin || "upload", sourceUrl: metadata.sourceUrl || ""}}));
    if (kind === "design") {
      setProjectName(metadata.projectName || projectNameFromFile(displayName));
      if (metadata.origin !== "figma") setDesignMode("upload");
    }
    setReports({});
    setIgnoredIssues({});
    setConfirmedIssues({});
    setIssueFilter("all");
    setIssueTypeFilter("all");
    setIssueSeverityFilter("all");
    setSelectedIssue(0);
    setZoom(1);
    setCopiedPraise(false);
  }

  // A Figma link usually points at a whole board, not one screen: the frame the reviewer pastes is
  // 7310×4590 because it holds every screen of the flow side by side. Exporting that as a single
  // design gave one unusable image, and it went down the legacy single-pair path so the batch
  // pairing flow never saw it — with screenshots uploaded, the panel just said "请再选择设计稿" and
  // there was no way forward. Now each child frame is exported as its own design and they all join
  // the same pool as uploaded files.
  const FIGMA_FRAME_TYPES = new Set(["FRAME", "COMPONENT", "COMPONENT_SET", "INSTANCE", "SECTION"]);

  function figmaScreenChildren(node) {
    const children = node?.children || [];
    const frames = [];
    for (const child of children) {
      if (!FIGMA_FRAME_TYPES.has(child.type)) continue;
      const box = child.absoluteBoundingBox;
      // Sections wrap screens in newer files, so look one level in for the real frames.
      if (child.type === "SECTION" && child.children?.length) {
        for (const inner of child.children) {
          const innerBox = inner.absoluteBoundingBox;
          if (FIGMA_FRAME_TYPES.has(inner.type) && innerBox?.width >= 240) frames.push({...inner, box: innerBox});
        }
        continue;
      }
      // A screen-sized frame, not an inner auto-layout row or an annotation label.
      if (box?.width >= 240) frames.push({...child, box});
    }
    // Board reading order: rows top to bottom, then left to right inside a row. This becomes the
    // screen order, and the frame names become the filenames the pairing step matches on.
    const rowHeight = Math.max(...frames.map((f) => f.box.height), 1) * .5;
    return frames.sort((a, b) => {
      const rowDelta = Math.floor(a.box.y / rowHeight) - Math.floor(b.box.y / rowHeight);
      return rowDelta !== 0 ? rowDelta : a.box.x - b.box.x;
    });
  }

  async function fetchFigmaImages(fileKey, ids, token) {
    const images = {};
    // The images endpoint takes a batch of ids, but a whole board can be dozens of frames; chunk it
    // so one oversized request cannot fail the entire import.
    for (let index = 0; index < ids.length; index += 12) {
      const slice = ids.slice(index, index + 12);
      const response = await fetch(`https://api.figma.com/v1/images/${encodeURIComponent(fileKey)}?ids=${encodeURIComponent(slice.join(","))}&format=png&scale=2`,
        {headers: {"X-Figma-Token": token}});
      if (!response.ok) throw new Error(`Figma 图片导出失败（${response.status}）`);
      Object.assign(images, (await response.json()).images || {});
    }
    return images;
  }

  async function loadFigma() {
    setLoadingFigma(true); setFigmaError(""); setFigmaNote("");
    try {
      const url = new URL(figmaUrl);
      if (!/(^|\.)figma\.com$/i.test(url.hostname)) throw new Error("请输入 figma.com 链接");
      const match = url.pathname.match(/\/(?:file|design|proto|board)\/([^/]+)/);
      const nodeId = (url.searchParams.get("node-id") || "").replace(/-/g, ":");
      const fileKey = match?.[1];
      const pathName = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) || "Figma 设计稿");

      if (figmaToken) {
        if (!fileKey || !nodeId) throw new Error("私有文件需要具体 Frame 链接（包含 node-id）");
        const treeResponse = await fetch(`https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}/nodes?ids=${encodeURIComponent(nodeId)}&depth=2`,
          {headers: {"X-Figma-Token": figmaToken}});
        if (!treeResponse.ok) throw new Error(`Figma 结构读取失败（${treeResponse.status}）`);
        const tree = await treeResponse.json();
        const document = tree.nodes?.[nodeId]?.document;
        const screens = figmaScreenChildren(document);
        const targets = screens.length >= 2
          ? screens.map((frame) => ({id: frame.id, name: frame.name}))
          : [{id: nodeId, name: document?.name || pathName}];
        const images = await fetchFigmaImages(fileKey, targets.map((item) => item.id), figmaToken);
        const files = [];
        for (const target of targets) {
          const imageUrl = images[target.id];
          if (!imageUrl) continue;
          const blob = await (await fetch(imageUrl)).blob();
          files.push(new File([blob], `${safeExportName(target.name)}.png`, {type: blob.type || "image/png"}));
        }
        if (!files.length) throw new Error("未获取到可用的 Frame 导出");
        await onBatchFiles("design", files, {append: true});
        setProjectName((current) => current && current !== "design" ? current : (document?.name || pathName));
        setFigmaNote(targets.length > 1
          ? `已从 Figma 拆出 ${files.length} 个界面，接着选择实现截图即可开始配对`
          : "已加载 1 个 Figma 界面，接着选择实现截图");
      } else {
        const response = await fetch(`https://www.figma.com/oembed?url=${encodeURIComponent(figmaUrl)}`);
        if (!response.ok) throw new Error(`公开预览请求失败（${response.status}）`);
        const preview = await response.json();
        if (!preview.thumbnail_url) throw new Error("未获取到可用预览图");
        const blob = await (await fetch(preview.thumbnail_url)).blob();
        const resolvedName = preview.title || pathName;
        await onBatchFiles("design", [new File([blob], `${safeExportName(resolvedName)}.png`, {type: blob.type || "image/png"})], {append: true});
        setProjectName((current) => current && current !== "design" ? current : resolvedName);
        // Public links only ever yield one flattened thumbnail, so say so rather than letting the
        // reviewer wonder why a whole board arrived as a single screen.
        setFigmaNote("公开链接只能取到整块预览图。需要按界面拆分请填临时 Token");
      }
      setFigmaToken("");
    } catch (error) {
      setFigmaError(`${error.message}。若浏览器阻止跨域读取，请从 Figma 导出 PNG 后上传。`);
    } finally { setLoadingFigma(false); }
  }

  async function analyze() {
    if (!sources.design || !sources.implementation) return;
    // The local Codex bridge is the only review path. A host-injected override used to be accepted
    // here, which would have routed the review away from Codex; nothing ever injected it.
    if (!codexBridge || codexStatus !== "connected") {
      setReviewNote("AI 未连接。请从已安装的 Skill 启动工作台后重试");
      return;
    }
    setIsAnalyzing(true);
    setAnalysisPhase("prepare");
    setReviewNote("AI 正在检查视觉差异与 ZYMIX 文案规范…");
    const next = {};
    let completed = false;
    try {
      await paintFrame(); await paintFrame();
      setAnalysisPhase("pixels");
      await paintFrame();
      const pixelReports = {};
      for (const [key, config] of Object.entries(PAIRS)) {
        if (!sources[config.left] || !sources[config.right]) continue;
        pixelReports[key] = calculateDiff(sources[config.left], sources[config.right], key);
      }

      const aiSources = Object.fromEntries(Object.entries(sources)
        .map(([kind, source]) => [kind, createAiSourcePreview(source)])
        .filter(([, source]) => Boolean(source)));
      const codexReviewPromise = requestCodexReview(codexBridge,
        {reports: compactReportsForAi(pixelReports), pairKey, projectName, sources: aiSources});
      setAnalysisPhase("ai");
      const reviewed = await codexReviewPromise;
      if (!reviewed?.reports || !Object.keys(reviewed.reports).length) throw new Error("AI 未返回可用问题清单");
      Object.assign(next, reviewed.reports);
      completed = true;
      const durationMs = Number(reviewed?.durationMs) || 0;
      setReviewNote(durationMs ? `AI 检测完成（${Math.max(.1, durationMs / 1000).toFixed(1)} 秒）` : "AI 检测完成");
      setAnalysisPhase("merge");
      await paintFrame(); await paintFrame();
      setAnalysisPhase("done");
      await new Promise((resolve) => window.setTimeout(resolve, 260));
    } catch (error) {
      console.warn("AI 检测未完成。", error);
      // Same rule as the failed-screen toast: the reviewer gets the classified Chinese reason, and
      // the provider's raw reply stays in the console rather than in the status line.
      const reason = classifyFailure(error?.message);
      setReviewNote(error?.message ? `AI 检测未完成：${reason.title}。${reason.advice}` : "AI 检测未完成：连接失败");
    } finally {
      setIsAnalyzing(false);
    }
    if (!completed) return;
    setReports(next); setIgnoredIssues({}); setSelectedIssue(0); setConfirmedIssues({}); setIssueFilter("all"); setIssueTypeFilter("all"); setIssueSeverityFilter("all"); setZoom(1);
    setShowAnnotations(true);
    setCopiedPraise(false);
  }

  async function copyPraise() {
    try {
      await navigator.clipboard.writeText(praiseText);
    } catch {
      const field = document.createElement("textarea");
      field.value = praiseText;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      field.remove();
    }
    setCopiedPraise(true);
    window.setTimeout(() => setCopiedPraise(false), 1800);
  }

  function randomizePraise() {
    const currentIndex = PRAISE_TEMPLATES.indexOf(praiseText);
    let nextIndex = Math.floor(Math.random() * PRAISE_TEMPLATES.length);
    if (nextIndex === currentIndex) nextIndex = (nextIndex + 1) % PRAISE_TEMPLATES.length;
    setPraiseText(PRAISE_TEMPLATES[nextIndex]);
    setCopiedPraise(false);
    setPraiseGenerationNote("已随机换一句，还可以继续编辑");
  }

  function contextualPraise() {
    const issueCount = defectIssues.length;
    const detail = issueCount
      ? `在还原度达到 ${fidelity.toFixed(1)}% 的同时，只留下 ${issueCount} 个可继续打磨的小点，整体完成度已经非常高。`
      : `本轮对比没有留下待确认问题，${pair.label} 的关键结构、节奏和视觉细节都稳稳对齐。`;
    const issueHint = report?.issues.slice(0, 2).map((item) => item.title).join("、");
    return `🎉 必须认真夸夸这次实现！${detail}${issueHint ? `尤其是在处理「${issueHint}」这些细节时，能看出开发准确 get 到了设计意图。` : "这份对细节的尊重和交付质量真的很让人安心。"} 辛苦啦，给你一个大大的赞！👏✨🚀`;
  }

  function generatePraiseFromResults() {
    setIsGeneratingPraise(true);
    setCopiedPraise(false);
    window.setTimeout(() => {
      setPraiseText(contextualPraise());
      setPraiseGenerationNote("已根据还原度与问题清单生成，无需 AI Key");
      setIsGeneratingPraise(false);
    }, 180);
  }

  // `anchor` is a viewport point to hold still while the scale changes: a wheel or pinch passes the
  // cursor, the toolbar and keyboard pass nothing and get the middle of the viewport. Rather than
  // predicting the new scroll offset — which was wrong, because the stage's own padding does not
  // scale with the artwork — record where the anchor sits inside the extent as a fraction, and
  // resolve it against the real geometry once the new size is laid out.
  // Buttons and keys move to the next clean tenth, so a continuous wheel gesture that left the zoom
  // at 137% still snaps back onto 140% / 130% rather than carrying the remainder forever.
  function steppedZoom(direction) {
    const current = zoomRef.current;
    const stepped = direction > 0 ? Math.floor(current * 10 + 1e-6) + 1 : Math.ceil(current * 10 - 1e-6) - 1;
    return stepped / 10;
  }

  function changeZoom(next, anchor) {
    const target = Math.min(ZOOM_MAX, Math.max(multiCanvas ? .03 : ZOOM_MIN, Math.round(next * 1000) / 1000));
    const stage = canvasStageRef.current, current = zoomRef.current;
    // Anchor against the zoom surface, which scales by exactly the zoom factor. The extent is the
    // wrong reference: its width is the stage's own width plus scaling padding, so a fraction of it
    // is not a fixed point on the artwork and the cursor slid sideways as the scale changed. With no
    // evidence loaded there is no surface, and the extent is then the only thing to hold.
    const surface = zoomAnchorElement(stage);
    if (stage && surface && current && target !== current) {
      const bounds = stage.getBoundingClientRect(), box = surface.getBoundingClientRect();
      const pointX = anchor ? anchor.x - bounds.left : stage.clientWidth / 2;
      const pointY = anchor ? anchor.y - bounds.top : stage.clientHeight / 2;
      pendingScrollRef.current = box.width && box.height ? {
        fractionX: (bounds.left + pointX - box.left) / box.width,
        fractionY: (bounds.top + pointY - box.top) / box.height,
        pointX, pointY,
      } : null;
    }
    // Advance the ref now, not in the commit effect. A wheel or trackpad gesture fires many events
    // inside a single frame, and every one of them would otherwise read the same pre-gesture zoom
    // and collapse the whole gesture into one step.
    zoomRef.current = target;
    setZoom(target);
  }

  // Scale so both evidence frames fit the visible stage, then centre on them. Measured from the
  // artwork's real layout at the current zoom rather than from the source pixel sizes, so it stays
  // correct whatever the stage padding and captions occupy, and it re-fits after a panel opens.
  function fitToCanvas({defer = false} = {}) {
    if (multiCanvas) { setCanvasNavigation({all:true}); return; }
    const apply = () => {
      const stage = canvasStageRef.current;
      const surface = stage?.querySelector(".zoom-surface") || zoomAnchorElement(stage);
      if (!stage || !surface) return;
      const box = surface.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const current = zoomRef.current || 1;
      // Undo the current zoom to get the artwork's intrinsic size, then leave a small margin so the
      // frames do not touch the stage edges.
      const naturalWidth = box.width / current, naturalHeight = box.height / current;
      const available = visibleCanvasBox(stage);
      if (available.width <= 0 || available.height <= 0) return;
      const target = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN,
        Math.min(available.width / naturalWidth, available.height / naturalHeight)));
      // Scale only. Positioning is left to the existing centring path, which runs when the evidence
      // sources change and is the behaviour the workbench has always had; adding a second centring
      // here fought that one and made the result depend on which finished last.
      changeZoom(target);
    };
    // On restore the evidence images are decoded but the DOM has not laid them out yet, so measuring
    // on a fixed delay read a surface that was still growing and produced a ~1.0 "fit" that fitted
    // nothing. Wait for the geometry to stop changing instead of guessing how long that takes.
    if (!defer) { apply(); return; }
    // Height stability alone was not enough: two reads 60ms apart can both land on the same
    // intermediate height while the evidence images are still decoding, and fitting to that produced
    // a "fit" of ~100% that fitted nothing. Require the images themselves to be laid out first.
    let previous = "", attempts = 0;
    const settle = () => {
      attempts += 1;
      const stage = canvasStageRef.current;
      // A collapsed or not-yet-laid-out viewport reports a tiny stage, and fitting to that bakes in a
      // zoom that is wrong as soon as the window has its real size. Gate on the measurement itself
      // rather than on `document.visibilityState`, which some embedded views report as hidden the
      // whole time they are on screen — that gate blocked the fit permanently.
      if (!window.innerWidth || !stage || stage.clientWidth < 240 || stage.clientHeight < 240) {
        if (attempts < 40) window.setTimeout(settle, 60);
        return;
      }
      const surface = stage.querySelector(".zoom-surface") || zoomAnchorElement(stage);
      const images = [...(stage?.querySelectorAll(".annotated-frame img, .overlay-frame img") || [])];
      const ready = images.length > 0
        && images.every((image) => image.complete && image.naturalWidth > 0 && image.clientHeight > 0);
      // Track the visible width as well as the artwork height. Restoring a record opens the issue
      // rail at the same time, and its width animates over ~180ms; fitting mid-animation subtracted
      // only part of the rail and left the second frame partly under it.
      const height = surface?.getBoundingClientRect().height || 0;
      const width = visibleCanvasBox(stage).width;
      const signature = `${Math.round(height)}x${Math.round(width)}`;
      if (ready && height > 0 && width > 0 && signature === previous) { apply(); return; }
      previous = ready ? signature : "";
      if (attempts < 40) window.setTimeout(settle, 60);
    };
    window.setTimeout(settle, 60);
  }

  function touchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX, dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  function handleCanvasTouchStart(event) {
    const stage = canvasStageRef.current;
    if (!stage) return;
    if (event.touches.length === 2) {
      gestureRef.current = {mode: "pinch", distance: touchDistance(event.touches), zoom};
    } else if (event.touches.length === 1) {
      gestureRef.current = {mode: "pan", x: event.touches[0].clientX, y: event.touches[0].clientY, left: stage.scrollLeft, top: stage.scrollTop};
    }
  }

  function handleCanvasTouchMove(event) {
    const stage = canvasStageRef.current, gesture = gestureRef.current;
    if (!stage || !gesture) return;
    event.preventDefault();
    if (event.touches.length === 2 && gesture.mode === "pinch") {
      const midX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
      const midY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
      changeZoom(gesture.zoom * (touchDistance(event.touches) / gesture.distance), {x: midX, y: midY});
    } else if (event.touches.length === 1 && gesture.mode === "pan") {
      stage.scrollLeft = gesture.left - (event.touches[0].clientX - gesture.x);
      stage.scrollTop = gesture.top - (event.touches[0].clientY - gesture.y);
    }
  }

  function handleCanvasPointerDown(event) {
    const stage=canvasStageRef.current;
    if(!stage || event.shiftKey || event.pointerType==="touch" || event.button!==0)return;
    if(!panMode && event.target.closest(".annotated-frame, .overlay-frame"))return;
    if(event.target.closest("button, input, textarea, label"))return;
    pointerPanRef.current={pointerId:event.pointerId,x:event.clientX,y:event.clientY,left:stage.scrollLeft,top:stage.scrollTop,dragging:false};
  }

  function handleCanvasPointerMove(event) {
    const stage=canvasStageRef.current,pan=pointerPanRef.current;
    if(!stage || !pan || pan.pointerId!==event.pointerId)return;
    if(!event.buttons){endCanvasPointer(event);return;}
    if(!pan.dragging){
      if(Math.hypot(event.clientX-pan.x,event.clientY-pan.y)<5)return;
      pan.dragging=true;
      stage.setPointerCapture?.(event.pointerId);
      setIsCanvasDragging(true);
    }
    event.preventDefault();
    stage.scrollLeft=pan.left-(event.clientX-pan.x);
    stage.scrollTop=pan.top-(event.clientY-pan.y);
    if(showMinimap)syncCanvasView();
  }

  function endCanvasPointer(event) {
    const stage=canvasStageRef.current,pan=pointerPanRef.current;
    if(!pan || (event.pointerId!==undefined && pan.pointerId!==event.pointerId))return;
    if(stage?.hasPointerCapture?.(pan.pointerId))stage.releasePointerCapture(pan.pointerId);
    pointerPanRef.current=null;
    setIsCanvasDragging(false);
  }
  useEffect(()=>{
    const clear=()=>{const stage=canvasStageRef.current,pan=pointerPanRef.current;if(pan&&stage?.hasPointerCapture?.(pan.pointerId))stage.releasePointerCapture(pan.pointerId);pointerPanRef.current=null;setIsCanvasDragging(false);};
    window.addEventListener("pointerup",clear);window.addEventListener("pointercancel",clear);window.addEventListener("blur",clear);
    return()=>{window.removeEventListener("pointerup",clear);window.removeEventListener("pointercancel",clear);window.removeEventListener("blur",clear);};
  },[]);

  function startIssueMove(event, item, index, side) {
    const source = side === "left" ? left : right, location = issueLocation(item, side);
    // Let the event through untouched while Space is held; the stage handler turns it into a pan.
    if (panMode) return;
    if (!source || !location || event.button !== 0 || event.target.closest(".resize-handle")) return;
    event.preventDefault();
    event.stopPropagation();
    const frame = event.currentTarget.closest(".annotated-frame"), bounds = frame?.getBoundingClientRect();
    if (!bounds?.width || !bounds?.height) return;
    const moveHandler = (moveEvent) => moveIssue(moveEvent), endHandler = (endEvent) => endIssueMove(endEvent);
    beginCoalescedEdit();
    issueMoveRef.current = {
      pointerId: event.pointerId,
      id: item.id,
      side,
      startX: event.clientX,
      startY: event.clientY,
      location: {...location},
      scaleX: source.width / bounds.width,
      scaleY: source.height / bounds.height,
      imageWidth: source.width,
      imageHeight: source.height,
      handle: event.currentTarget,
      moveHandler,
      endHandler,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    document.addEventListener("pointermove", moveHandler, {passive: false, capture: true});
    document.addEventListener("pointerup", endHandler, {passive: false, capture: true});
    document.addEventListener("pointercancel", endHandler, {passive: false, capture: true});
    setSelectedIssue(index);setIssueFilter("all");setIssueTypeFilter("all");setIssueSeverityFilter("all");setIssueRailCollapsed(false);setIssueJump(value=>value+1);
  }

  function moveIssue(event) {
    const move = issueMoveRef.current;
    if (!move || move.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = (event.clientX - move.startX) * move.scaleX, dy = (event.clientY - move.startY) * move.scaleY;
    const next = {
      ...move.location,
      x: Math.round(Math.max(0, Math.min(move.imageWidth - move.location.width, move.location.x + dx))),
      y: Math.round(Math.max(0, Math.min(move.imageHeight - move.location.height, move.location.y + dy))),
    };
    updateIssue(move.id, move.side === "left" ? {leftLocation: next} : {rightLocation: next, location: next});
  }

  function endIssueMove(event) {
    const move = issueMoveRef.current;
    if (!move || move.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    move.handle?.releasePointerCapture?.(event.pointerId);
    document.removeEventListener("pointermove", move.moveHandler, true);
    document.removeEventListener("pointerup", move.endHandler, true);
    document.removeEventListener("pointercancel", move.endHandler, true);
    issueMoveRef.current = null;
    endCoalescedEdit();
  }

  function startIssueResize(event, item, index, corner, side) {
    const source = side === "left" ? left : right, location = issueLocation(item, side);
    if (!source || !location) return;
    event.preventDefault();
    event.stopPropagation();
    const frame = event.currentTarget.closest(".annotated-frame"), bounds = frame?.getBoundingClientRect();
    if (!bounds?.width || !bounds?.height) return;
    const moveHandler = (moveEvent) => resizeIssue(moveEvent), endHandler = (endEvent) => endIssueResize(endEvent);
    beginCoalescedEdit();
    issueResizeRef.current = {
      pointerId: event.pointerId,
      id: item.id,
      side,
      corner,
      startX: event.clientX,
      startY: event.clientY,
      location: {...location},
      scaleX: source.width / bounds.width,
      scaleY: source.height / bounds.height,
      imageWidth: source.width,
      imageHeight: source.height,
      handle: event.currentTarget,
      moveHandler,
      endHandler,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    document.addEventListener("pointermove", moveHandler, {passive: false, capture: true});
    document.addEventListener("pointerup", endHandler, {passive: false, capture: true});
    document.addEventListener("pointercancel", endHandler, {passive: false, capture: true});
    setSelectedIssue(index);
  }

  function resizeIssue(event) {
    const resize = issueResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const minimum = 24, dx = (event.clientX - resize.startX) * resize.scaleX, dy = (event.clientY - resize.startY) * resize.scaleY;
    const original = resize.location, next = {...original};
    if (resize.corner.includes("e")) next.width = Math.max(minimum, Math.min(resize.imageWidth - original.x, original.width + dx));
    if (resize.corner.includes("s")) next.height = Math.max(minimum, Math.min(resize.imageHeight - original.y, original.height + dy));
    if (resize.corner.includes("w")) {
      next.x = Math.max(0, Math.min(original.x + original.width - minimum, original.x + dx));
      next.width = original.width + original.x - next.x;
    }
    if (resize.corner.includes("n")) {
      next.y = Math.max(0, Math.min(original.y + original.height - minimum, original.y + dy));
      next.height = original.height + original.y - next.y;
    }
    Object.keys(next).forEach((key) => { next[key] = Math.round(next[key]); });
    updateIssue(resize.id, resize.side === "left" ? {leftLocation: next} : {rightLocation: next, location: next});
  }

  function endIssueResize(event) {
    const resize = issueResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    resize.handle?.releasePointerCapture?.(event.pointerId);
    document.removeEventListener("pointermove", resize.moveHandler, true);
    document.removeEventListener("pointerup", resize.endHandler, true);
    document.removeEventListener("pointercancel", resize.endHandler, true);
    issueResizeRef.current = null;
    endCoalescedEdit();
  }

  function updateIssue(id, patch) {
    setReports((current) => {
      const active = current[pairKey];
      if (!active) return current;
      return {...current, [pairKey]: {...active, issues: active.issues.map((item) => item.id === id ? {...item, ...patch} : item)}};
    });
  }

  // The reviewer's override. A blocker means "these look like different screens", and sometimes that
  // IS the bug — the build routed to the wrong page. Only the reviewer can tell, so escalating is
  // their call, it is undoable like any other edit, and it never happens automatically.
  function startRailResize(event) {
    const rail = event.currentTarget.closest(".issue-rail");
    if (!rail || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX, startWidth = rail.getBoundingClientRect().width;
    const move = (moveEvent) => {
      // The rail is anchored to the right edge, so dragging left widens it.
      const next = Math.round(Math.min(RAIL_MAX_WIDTH, Math.max(RAIL_MIN_WIDTH, startWidth + (startX - moveEvent.clientX))));
      setRailWidth(next);
    };
    const end = () => {
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", end, true);
      document.removeEventListener("pointercancel", end, true);
      railResizeRef.current = null;
      document.body.classList.remove("is-resizing-rail");
    };
    railResizeRef.current = {move, end};
    document.body.classList.add("is-resizing-rail");
    document.addEventListener("pointermove", move, {capture: true});
    document.addEventListener("pointerup", end, {capture: true});
    document.addEventListener("pointercancel", end, {capture: true});
  }

  useEffect(() => {
    if (!railWidth) return;
    window.localStorage?.setItem("zymix-rail-width", String(railWidth));
  }, [railWidth]);

  function confirmBlockerAsDefect() {
    if (!blockerIssues.length) return;
    setReports((current) => {
      const active = current[pairKey];
      if (!active) return current;
      return {...current, [pairKey]: {...active, issues: active.issues.map((item) => item.kind === "blocker"
        ? {...item, kind: "implementation", severity: "P0", confirmedByReviewer: true}
        : item)}};
    });
    setSelectedIssue(0);
    setReviewNote("已确认为实现错误，这一屏的阻塞项转为 P0 缺陷");
  }

  function updateIgnoredIssue(ignoredKey, patch) {
    setIgnoredIssues((current) => ({
      ...current,
      [pairKey]: (current[pairKey] || []).map((item) => item.ignoredKey === ignoredKey ? {...item, ...patch} : item),
    }));
  }

  // Manual issues no longer wait on an AI run. The canvas shows both sources as soon as they are
  // uploaded, so a reviewer who has already spotted a defect can mark it up immediately; requiring a
  // report first meant the only way to record your own finding was to sit through the AI pass.
  function addIssue() {
    if (!left || !right) return;
    const base = report || {verdict: "REVIEW", issues: [], metrics: {ratio: null, groups: 0}};
    const prefix = base.issues[0]?.id.split("-")[0] || "DA";
    const nextIndex = base.issues.length;
    const leftLocation = defaultIssueLocation(left), rightLocation = defaultIssueLocation(right);
    const nextIssue = {
      id: `${prefix}-${String(nextIndex + 1).padStart(3, "0")}`,
      severity: "P2",
      category: "人工新增",
      title: "新增问题（请编辑具体差异）",
      summary: "由设计验收人员手动新增，请分别调整两侧框选范围并补充问题描述。",
      delta: "请切换设计稿与开发截图，确认两侧证据框均准确覆盖对应区域。",
      expected: "请填写设计稿中的预期表现。",
      actual: "请填写开发截图中的实际表现。",
      recommendation: "请填写开发需要执行的具体复刻要求。",
      verification: "在相同视口与状态下复测，并核对设计稿与开发截图的对应区域。",
      leftLocation,
      rightLocation,
      location: rightLocation,
      manual: true,
    };
    setReports((current) => {
      const existing = current[pairKey] || base;
      return {
        ...current,
        [pairKey]: {
          ...existing,
          verdict: "REVIEW",
          issues: [...existing.issues, nextIssue],
          metrics: {...existing.metrics, groups: nextIndex + 1},
        },
      };
    });
    setSelectedIssue(nextIndex);
    setIssueFilter("all");
    setView("annotated");
    setShowAnnotations(true);
  }

  async function fillManualIssueWithAi(item, event) {
    event?.stopPropagation?.();
    if (!item?.manual || !left || !right) return;
    if (!codexBridge || codexStatus !== "connected") {
      setAiIssueMessages((current) => ({...current, [item.id]: "AI 未连接，请从 Skill 启动工作台后重试"}));
      return;
    }
    const leftCrop = createAiIssueCrop(left, issueLocation(item, "left"));
    const rightCrop = createAiIssueCrop(right, issueLocation(item, "right"));
    if (!leftCrop || !rightCrop) {
      setAiIssueMessages((current) => ({...current, [item.id]: "请先在两侧画布框选对应区域"}));
      return;
    }
    setAiFillingIssueId(item.id);
    setAiIssueMessages((current) => ({...current, [item.id]: "正在识别两侧框选区域…"}));
    try {
      const result = await requestCodexIssueFill(codexBridge, {
        projectName,
        pairKey,
        evidenceLabels: {left: evidenceLabel(pair.left), right: evidenceLabel(pair.right)},
        leftCrop,
        rightCrop,
      });
      const recognized = result?.issue;
      if (!recognized) throw new Error("AI 未返回可用结果");
      updateIssue(item.id, {
        severity: ISSUE_SEVERITIES.includes(recognized.severity) ? recognized.severity : "P2",
        category: recognized.category || "人工新增",
        title: recognized.title || item.title,
        summary: recognized.title || item.summary,
        expected: recognized.expected || item.expected,
        actual: recognized.actual || item.actual,
        recommendation: recognized.recommendation || item.recommendation,
        delta: `设计稿：${recognized.expected || item.expected} 实现：${recognized.actual || item.actual}`,
        verification: "在相同逻辑视口复测该框选区域，确认实现与设计稿一致。",
        aiAssisted: true,
      });
      const seconds = Number(result.durationMs) ? ` · ${(Number(result.durationMs) / 1000).toFixed(1)} 秒` : "";
      const verdict = recognized.verdict === "MATCH" ? "未发现明确差异" : recognized.verdict === "UNCERTAIN" ? "已填写，建议人工确认" : "已自动填写";
      setAiIssueMessages((current) => ({...current, [item.id]: `${verdict}${seconds}`}));
    } catch (error) {
      setAiIssueMessages((current) => ({...current, [item.id]: `识别失败：${error?.message || "连接失败"}`}));
    } finally {
      setAiFillingIssueId("");
    }
  }

  function editGroupedIssue(screenId,item,changes) {
    setScreens(current=>current.map(screen=>{
      if(screen.id!==screenId)return screen;
      if(issueFilter==="ignored")return {...screen,ignoredIssues:{...screen.ignoredIssues,[pairKey]:(screen.ignoredIssues[pairKey]||[]).map(existing=>existing.ignoredKey===item.ignoredKey?{...existing,...changes}:existing)}};
      const report=screen.reports[pairKey];return {...screen,reports:{...screen.reports,[pairKey]:{...report,issues:report.issues.map(existing=>existing.id===item.id?{...existing,...changes}:existing)}}};
    }));
  }
  function toggleGroupedIssue(screenId,item) {
    setScreens(current=>current.map(screen=>{
      if(screen.id!==screenId)return screen;
      const report=screen.reports[pairKey]||{issues:[]},ignored=screen.ignoredIssues[pairKey]||[];
      if(issueFilter==="ignored"){
        const {ignoredKey,originalId,...fields}=item;const prefix=(originalId||item.id||"DA").split("-")[0];let n=report.issues.length+1;
        while(report.issues.some(existing=>existing.id===`${prefix}-${String(n).padStart(3,"0")}`))n++;
        const issues=[...report.issues,{...fields,id:`${prefix}-${String(n).padStart(3,"0")}`}];
        return {...screen,reports:{...screen.reports,[pairKey]:{...report,verdict:"REVIEW",issues,metrics:{...report.metrics,groups:issues.length}}},ignoredIssues:{...screen.ignoredIssues,[pairKey]:ignored.filter(existing=>existing.ignoredKey!==ignoredKey)}};
      }
      return {...screen,reports:{...screen.reports,[pairKey]:{...report,issues:report.issues.filter(existing=>existing.id!==item.id)}},ignoredIssues:{...screen.ignoredIssues,[pairKey]:[...ignored,{...item,originalId:item.id,ignoredKey:`${screenId}:${Date.now()}:${item.id}`}]}};
    }));
  }

  async function copyIssueToClipboard(item, sourceLeft=left, sourceRight=right) {
    const text = `${item.id} · ${item.severity} · ${item.title}\n\n设计预期：${item.expected||item.summary||""}\n\n实现现状：${item.actual||item.delta||""}\n\n复刻要求：${item.recommendation||item.delta||""}`;
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        await navigator.clipboard.writeText(text);setReviewNote("已复制问题文字；当前浏览器不支持复制配图");return;
      }
      const canvas=createIssuePdfPage(item,0,1,sourceLeft,sourceRight,pair,{projectName,designerName});
      const png=new Promise((resolve,reject)=>canvas.toBlob(blob=>{canvas.width=1;canvas.height=1;blob?resolve(blob):reject(new Error("配图生成失败"));},"image/png"));
      const html=`<article><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.id)} · ${escapeHtml(item.severity)}</p><p><b>设计预期</b><br>${escapeHtml(item.expected||item.summary||"")}</p><p><b>实现现状</b><br>${escapeHtml(item.actual||item.delta||"")}</p><p><b>复刻要求</b><br>${escapeHtml(item.recommendation||item.delta||"")}</p><p>设计稿</p><img src="${cropDataUrl(sourceLeft,issueLocation(item,"left"))}"><p>实现图</p><img src="${cropDataUrl(sourceRight,issueLocation(item,"right"))}"></article>`;
      await navigator.clipboard.write([new ClipboardItem({"text/plain":new Blob([text],{type:"text/plain"}),"text/html":new Blob([html],{type:"text/html"}),"image/png":png})]);
      setReviewNote("已复制问题和配图，可直接粘贴");
    } catch(error) {setReviewNote(`复制失败：${error.message || "请检查剪贴板权限"}`);}
  }

  function ignoreIssue(id, index) {
    if (!report) return;
    const ignoredItem = report.issues.find((item) => item.id === id);
    if (!ignoredItem) return;
    setIgnoredIssues((current) => {
      const list = current[pairKey] || [];
      return {...current, [pairKey]: [...list, {...ignoredItem, originalId: id, ignoredKey: `${pairKey}:${Date.now()}:${list.length}`} ]};
    });
    const remaining = report.issues.filter((item) => item.id !== id);
    const reindexed = remaining.map((item, itemIndex) => {
      const prefix = item.id.split("-")[0] || "DA";
      return {...item, id: `${prefix}-${String(itemIndex + 1).padStart(3, "0")}`};
    });
    setReports((current) => {
      const active = current[pairKey];
      if (!active) return current;
      return {...current, [pairKey]: {...active, issues: reindexed, metrics: {...active.metrics, groups: reindexed.length}}};
    });
    setConfirmedIssues((current) => {
      const next = {...current};
      report.issues.forEach((item) => { delete next[`${pairKey}:${item.id}`]; });
      remaining.forEach((item, itemIndex) => {
        if (current[`${pairKey}:${item.id}`]) next[`${pairKey}:${reindexed[itemIndex].id}`] = true;
      });
      return next;
    });
    setSelectedIssue((current) => {
      if (!reindexed.length) return 0;
      if (current > index) return current - 1;
      return Math.min(current, reindexed.length - 1);
    });
  }

  function restoreIgnoredIssueKeys(ignoredKeys) {
    if (!report || !ignoredKeys.length) return;
    const ignoredKeySet = new Set(ignoredKeys);
    const itemsToRestore = ignoredList.filter((item) => ignoredKeySet.has(item.ignoredKey));
    if (!itemsToRestore.length) return;
    const nextIndex = report.issues.length;
    const restoredItems = itemsToRestore.map((ignoredItem, offset) => {
      const prefix = ignoredItem.originalId?.split("-")[0] || report.issues[0]?.id.split("-")[0] || "DA";
      const {ignoredKey: removedKey, originalId, ...restoredFields} = ignoredItem;
      return {...restoredFields, id: `${prefix}-${String(nextIndex + offset + 1).padStart(3, "0")}`};
    });
    setReports((current) => {
      const active = current[pairKey];
      if (!active) return current;
      const issues = [...active.issues, ...restoredItems];
      return {...current, [pairKey]: {...active, verdict: "REVIEW", issues, metrics: {...active.metrics, groups: issues.length}}};
    });
    setIgnoredIssues((current) => ({...current, [pairKey]: (current[pairKey] || []).filter((item) => !ignoredKeySet.has(item.ignoredKey))}));
    setSelectedIssue(nextIndex);
    setIssueFilter("all");
    setView("annotated");
    setShowAnnotations(true);
  }

  function restoreIssue(ignoredKey) {
    restoreIgnoredIssueKeys([ignoredKey]);
  }

  // Every issue that has not been ignored counts. Inclusion used to be an explicit tick per card on
  // top of ignoring, which meant two ways to say the same thing — and a run already ticked them all,
  // so the checkbox only ever served to opt out of something ignoring already covers.
  // The single gate both exports go through. Blockers are excluded here so a "these are two
  // different screens" finding can never reach a developer as a bug report — the whole point of
  // separating them from defects.
  function selectedIssues() {
    return report?.issues || [];
  }

  // Replaces the former Markdown export. Markdown could only hand developers a coordinate string
  // ("x 32 · y 410 · 670×744px") and left them to imagine the region; a self-contained HTML file
  // carries the actual cropped evidence beside each issue while staying a single shareable file.
  function exportHtml() {
    if (!report) return;
    const selected = selectedIssues();
    if (!selected.length || !left || !right) return;
    const html = buildReportHtml([{name: activeScreen.name, left, right, issues: selected}]);
    downloadBlob(new Blob([html], {type: "text/html;charset=utf-8"}), `${safeExportName(projectName)}-设计验收问题清单_${exportStamp()}.html`);
  }

  // Archives the working session, not a rendered report: the reviewer opens a record to get their
  // workbench back — screens, evidence, issues, edits, ignored archive — and can carry on or re-export
  // from there. Images are stored as their data URLs because an HTMLImageElement cannot be persisted.
  async function recordHistory(finished) {
    const parts = (finished || []).filter((part) => part.left && part.right);
    if (!parts.length) return;
    // baseline travels with the source: the @1x logical size is needed to compare a later round.
    const keep = (source) => source && {src: source.src, width: source.width, height: source.height,
      name: source.name, origin: source.origin, baseline: source.baseline || null};
    const storedScreens = parts.map((part) => ({
      id: part.id,
      name: part.name,
      status: "done",
      reports: part.reports,
      confirmedIssues: part.confirmedIssues,
      // A fresh run has nothing ignored yet, but a re-review re-ignores whatever the reviewer had
      // ignored last round. Hardcoding `{}` here threw that away, so reopening the new round showed
      // issues the reviewer had already set aside as if they were new findings.
      ignoredIssues: part.ignoredIssues || {},
      sources: {design: keep(part.left), implementation: keep(part.right)},
    }));
    try {
      await saveHistory({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: Date.now(),
        // A re-review is recorded as its own round pointing back at the one it followed, so the
        // earlier evidence and judgements stay readable.
        reReviewOf: baselineRound?.recordId || null,
        round: baselineRound ? "re" : "first",
        projectName: projectName.trim() || "未命名项目",
        designerName: designerName.trim() || "设计师",
        screenCount: storedScreens.length,
        issueCount: parts.reduce((total, part) => total + part.issues.length, 0),
        screens: storedScreens,
      });
      setHistory(await listHistory());
    } catch (error) {
      console.error("[zymix] 保存走查记录失败", error);
      setReviewNote(`走查记录保存失败：${error?.message || error}`);
    }
  }

  // Builds the shareable report. Takes a list of screens so one review covering many screens produces
  // one document; the history record uses the same builder, which is why a saved review reads exactly
  // like the file handed to a developer.
  function buildReportHtml(parts, metadata = {}) {
    const title = metadata.projectName || projectName.trim() || "未命名项目";
    const leftLabel = evidenceLabel(pair.left), rightLabel = evidenceLabel(pair.right);
    const severityRank = {P0: "p0", P1: "p1", P2: "p2"};
    const multi = parts.length > 1;
    const totalIssues = parts.reduce((total, part) => total + part.issues.length, 0);
    let counter = 0;

    // Anchors are built from the screen and the issue id as exported, not from the running index, so
    // a link copied out of this document keeps pointing at the same issue.
    const slug = (value) => String(value).trim().replace(/[^\w\u4e00-\u9fa5-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "x";
    const screenAnchor = (part, index) => `screen-${index+1}-${slug(part.id || part.name)}`;
    const anchorFor = (part, partIndex, item) => `${screenAnchor(part,partIndex)}-${slug(item.id)}`;
    const toc = [];

    const issueSections = parts.flatMap((part, partIndex) => [
      `<h2 class="screen-heading" id="${screenAnchor(part,partIndex)}">${escapeHtml(part.id || "")} ${escapeHtml(part.name || `界面 ${partIndex + 1}`)}<small>${part.issues.length} 个问题</small></h2><p class="screen-status">${escapeHtml(part.status || "检测完成")}${part.error ? ` · ${escapeHtml(part.error)}` : ""}</p>`,
      ...part.issues.map((item) => {
        const index = counter++;
        const anchor = anchorFor(part, partIndex, item);
        toc.push({anchor, index, item, partIndex, screen: multi ? (part.name || `界面 ${partIndex + 1}`) : ""});
        const left = part.left, right = part.right;
      const leftCrop = cropDataUrl(left, issueLocation(item, "left"));
      const rightCrop = cropDataUrl(right, issueLocation(item, "right"));
      return `
  <article class="issue" id="${anchor}" tabindex="-1">
    <h2><span class="idx">${index + 1}</span><span class="sev ${severityRank[item.severity] || "p2"}">${escapeHtml(item.severity)}</span>
      <span class="cat">${escapeHtml(item.category)}</span><span class="iid">${escapeHtml(item.id)}</span>
      <a class="anchor-link" href="#${anchor}" aria-label="复制该问题的链接位置">#</a></h2>
    <p class="ititle">${escapeHtml(item.title)}</p>
    <div class="evidence">
      <figure><figcaption>${escapeHtml(leftLabel)}<small>${escapeHtml(formatBounds(issueLocation(item, "left"), left))}</small></figcaption>
        ${leftCrop ? `<img src="${leftCrop}" alt="${escapeHtml(item.id)} ${escapeHtml(leftLabel)}证据局部">` : ""}</figure>
      <figure><figcaption>${escapeHtml(rightLabel)}<small>${escapeHtml(formatBounds(issueLocation(item, "right"), right))}</small></figcaption>
        ${rightCrop ? `<img src="${rightCrop}" alt="${escapeHtml(item.id)} ${escapeHtml(rightLabel)}证据局部">` : ""}</figure>
    </div>
    <dl>
      <dt>设计预期</dt><dd>${escapeHtml(item.expected || item.summary)}</dd>
      <dt>实现现状</dt><dd>${escapeHtml(item.actual || item.delta)}</dd>
      <dt class="fix">复刻要求</dt><dd>${escapeHtml(item.recommendation || item.delta)}</dd>
      <dt>验证方式</dt><dd>${escapeHtml(item.verification || "在相同视口与状态下重新截图，并与设计基准复核。")}</dd>
    </dl>
  </article>`;
      }),
    ]).join("");

    const tocMarkup = parts.map((part,partIndex)=>{
      const entries=toc.filter(entry=>entry.partIndex===partIndex);
      return `<details class="toc-group"${partIndex===0?" open":""}><summary><span>${escapeHtml(part.id||"")} ${escapeHtml(part.name||`界面 ${partIndex+1}`)}</span><small>${entries.length}</small></summary><ol><li><a class="group-overview-link" href="#${screenAnchor(part,partIndex)}">组概览 · ${escapeHtml(part.status||"检测完成")}</a></li>${entries.map(entry=>`<li><a href="#${entry.anchor}"><span class="n">${entry.index+1}</span><span class="d ${severityRank[entry.item.severity]||"p2"}"></span><span class="t" title="${escapeHtml(entry.item.title)}">${escapeHtml(entry.item.title)}</span></a></li>`).join("")}</ol></details>`;
    }).join("");

    const overview = parts.map((part,index)=>`<section><h3>${escapeHtml(part.id || "")} ${escapeHtml(part.name)}</h3><div class="pair">${evidenceOverviewSources(part.sources || {design:part.left,implementation:part.right}).map(({kind,source})=>`<figure><figcaption>${escapeHtml(evidenceLabel(kind))}</figcaption><img src="${source.src}" alt="${escapeHtml(part.name)} ${escapeHtml(evidenceLabel(kind))}完整界面"></figure>`).join("")}</div></section>`).join("");

    const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · 设计验收问题清单</title>
<style>
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;padding:32px 20px 64px;background:#f6f6f7;color:#18181b;font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
.wrap{max-width:960px;margin:0 auto}
header.doc{padding:20px 22px;border-radius:12px;background:#fff;box-shadow:0 1px 3px #18181b14}
header.doc h1{margin:0 0 10px;font-size:20px}
header.doc ul{margin:0;padding:0;list-style:none;display:grid;gap:4px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));color:#52525b;font-size:13px}
details.full{margin:16px 0 0;padding:14px 18px;border-radius:12px;background:#fff;box-shadow:0 1px 3px #18181b14}
details.full summary{cursor:pointer;font-weight:600}
details.full .pair{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));margin-top:14px}
details.full img{width:100%;border:1px solid #e4e4e7;border-radius:8px}
figcaption{margin-bottom:6px;color:#52525b;font-size:12px;font-weight:600;display:flex;justify-content:space-between;gap:8px;align-items:baseline}
figcaption small{color:#8b8b93;font-weight:500}
figure{margin:0}
.issue{margin-top:16px;padding:18px 22px;border-radius:12px;background:#fff;box-shadow:0 1px 3px #18181b14}
.issue h2{display:flex;align-items:center;gap:8px;margin:0 0 8px;font-size:13px;flex-wrap:wrap}
.idx{display:grid;place-items:center;width:22px;height:22px;border-radius:999px;background:#18181b;color:#fff;font-size:11px}
.sev{padding:2px 8px;border-radius:999px;color:#fff;font-size:11px}
.sev.p0{background:#dc2626}.sev.p1{background:#ea580c}.sev.p2{background:#71717a}
.cat{padding:2px 8px;border-radius:999px;background:#f4f4f5;color:#52525b;font-size:11px}
.iid{color:#a1a1aa;font-size:11px;font-weight:500}
.ititle{margin:0 0 14px;font-size:16px;font-weight:650}
.evidence{display:grid;gap:16px;grid-template-columns:1fr 1fr;margin-bottom:16px}
.evidence img{width:100%;border:1px solid #e4e4e7;border-radius:8px;background:#fafafa}
dl{display:grid;gap:6px 14px;grid-template-columns:auto 1fr;margin:0}
dt{color:#71717a;font-size:12px;font-weight:600;white-space:nowrap}
dt.fix{color:#15803d}
dd{margin:0}
/* A long document needs somewhere to stand: the bar stays put, and every anchor target clears it. */
:root{--bar-h:52px}
html{scroll-behavior:smooth;scroll-padding-top:calc(var(--bar-h) + 16px)}
.topbar{position:fixed;top:0;left:0;right:0;z-index:20;height:var(--bar-h);display:flex;align-items:center;gap:12px;
  padding:0 20px;background:#fffffff2;backdrop-filter:blur(8px);border-bottom:1px solid #e4e4e7}
.topbar strong{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.topbar .count{margin-left:auto;color:#71717a;font-size:12px;white-space:nowrap}
body{padding-top:calc(var(--bar-h) + 24px)}
.layout{display:grid;gap:24px;grid-template-columns:232px minmax(0,1fr);align-items:start;max-width:1180px;margin:0 auto}
/* Sticky, self-scrolling, and offset by the bar so the first entry is never hidden under it. */
.toc{position:sticky;top:calc(var(--bar-h) + 16px);max-height:calc(100vh - var(--bar-h) - 32px);overflow:auto;
  padding:14px 8px 14px 14px;border-radius:12px;background:#fff;box-shadow:0 1px 3px #18181b14;scrollbar-width:thin}
.toc h2{margin:0 0 10px;color:#71717a;font-size:11px;font-weight:600;letter-spacing:.04em}
.toc ol{margin:0;padding:0;list-style:none;display:grid;gap:1px}
.toc .screen{margin:10px 0 4px;color:#a1a1aa;font-size:10px;font-weight:600}
.toc a{display:grid;grid-template-columns:auto auto 1fr;align-items:center;gap:6px;padding:6px 8px;border-radius:7px;
  color:#3f3f46;font-size:12px;text-decoration:none;border-left:2px solid transparent}
.toc a:hover{background:#f4f4f5}
.toc a .n{color:#a1a1aa;font-size:10px;font-variant-numeric:tabular-nums}
.toc a .d{width:6px;height:6px;border-radius:999px;background:#71717a}
.toc a .d.p0{background:#dc2626}.toc a .d.p1{background:#ea580c}.toc a .d.p2{background:#a1a1aa}
.toc a .t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.toc-group{margin:4px 0}
.toc-group>summary{display:flex;align-items:center;gap:6px;padding:9px 6px;cursor:pointer;list-style:none;font-weight:600;font-size:12px;border-radius:6px}
.toc-group>summary::-webkit-details-marker{display:none}
.toc-group>summary:before{content:"▸";color:#71717a;flex:none}
.toc-group[open]>summary:before{content:"▾"}
.toc-group>summary span{min-width:0;flex:1;overflow-wrap:anywhere}
.toc-group>summary small{color:#a1a1aa;font-weight:400}
.toc-group>summary:hover{background:#f4f4f5}
.toc-group:has(a.active)>summary{color:#1d4ed8}
.toc-group>ol{padding-left:12px;border-left:1px solid #e4e4e7;margin-left:10px}
.toc a.group-overview-link{display:block;font-size:11px;color:#71717a}
.toc a.active{background:#eff4ff;border-left-color:#2563eb;color:#1d4ed8;font-weight:600}
/* Scrolled-to card is marked as well, so the link and the document agree on where you are. */
.content{padding-bottom:70vh}
.issue.active{box-shadow:0 0 0 1px #2563eb,0 6px 18px #2563eb24}
.anchor-link{margin-left:auto;color:#d4d4d8;font-size:12px;text-decoration:none}
.anchor-link:hover{color:#2563eb}
.screen-heading{margin:24px 0 0;font-size:14px}
.screen-heading small{margin-left:8px;color:#a1a1aa;font-size:11px;font-weight:500}
/* Short, wide crops were squeezed into ~70px of height. A 16:9 frame gives them room to read while
   object-fit contain keeps every pixel of the evidence and its aspect ratio intact. */
.evidence img{aspect-ratio:16/9;object-fit:contain;object-position:center;padding:6px}
@media(max-width:960px){
  .layout{grid-template-columns:minmax(0,1fr)}
  .toc{position:static;max-height:none;margin-bottom:4px}
}
@media(max-width:720px){.evidence{grid-template-columns:1fr}dl{grid-template-columns:1fr}dt{margin-top:6px}}
@media print{
  body{background:#fff;padding:0}
  .issue,header.doc,details.full{box-shadow:none;border:1px solid #e4e4e7;break-inside:avoid}
  details.full,.topbar,.toc{display:none}
  .layout{grid-template-columns:1fr;max-width:none}
  .content{padding-bottom:0}
  html{scroll-padding-top:0}
}
</style></head><body>
<div class="topbar"><strong>${escapeHtml(title)} · 设计验收问题清单</strong><span class="count">${totalIssues} 项问题</span></div>
<div class="wrap"><div class="layout">
<nav class="toc" aria-label="问题目录">
  <h2>问题目录</h2>
  ${tocMarkup}
</nav>
<div class="content">
<header class="doc">
  <h1>${escapeHtml(title)} · 设计验收问题清单</h1>
  <ul>
    <li>设计师：${escapeHtml(designerName.trim() || "设计师")}</li>
    <li>对比关系：${escapeHtml(pair.label)}</li>
    <li>问题总数：${totalIssues} 项</li>${multi ? `\n    <li>界面数：${parts.length}</li>` : ""}
    <li>导出时间：${escapeHtml(new Date().toLocaleString("zh-CN"))}</li>
  </ul>
</header>
${overview ? `<details class="full"><summary>完整界面证据</summary>${overview}</details>` : ""}
${issueSections}
</div></div></div>
<script>
(function(){
  var links = Array.prototype.slice.call(document.querySelectorAll(".toc a[href^='#']"));
  var cards = links.map(function(a){ return document.getElementById(a.getAttribute("href").slice(1)); });
  function mark(id){
    links.forEach(function(a,i){
      var on = a.getAttribute("href") === "#" + id;
      a.classList.toggle("active", on);
      if (cards[i]) cards[i].classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
    });
  }
  // The bar covers the top of the viewport, so "current" is judged from just below it rather than
  // from the very top — otherwise the entry highlights while still hidden behind the bar.
  var bar = 52;
  function current(){
    var line = bar + 24, found = null;
    cards.forEach(function(card){
      if (card && card.getBoundingClientRect().top <= line) found = card;
    });
    return found || cards.find(function(c){ return c; }) || null;
  }
  var raf = 0;
  function onScroll(){
    if (raf) return;
    raf = requestAnimationFrame(function(){ raf = 0; var card = current(); if (card) mark(card.id); });
  }
  document.addEventListener("scroll", onScroll, {passive:true});
  window.addEventListener("resize", onScroll);
  // A URL that already carries a hash should land on that issue, cleared of the bar, and show as
  // current straight away.
  function applyHash(){
    var id = decodeURIComponent(location.hash.slice(1));
    if (!id) { onScroll(); return; }
    var target = document.getElementById(id);
    if (!target) { onScroll(); return; }
    var owner = links.find(function(a){return a.getAttribute("href")==="#"+id;});
    if(owner && owner.closest("details"))owner.closest("details").open=true;
    target.scrollIntoView();
    mark(id);
  }
  window.addEventListener("hashchange", applyHash);
  applyHash();
})();
</script>
</body></html>`;

    return html;
  }

  async function createPartsPdf(parts) {
    const pages=[];
    const encode = canvas => {
      pages.push({width:canvas.width,height:canvas.height,bytes:dataUrlBytes(canvas.toDataURL("image/jpeg",.9))});
      canvas.width=1;canvas.height=1;
    };
    for (const [index,part] of parts.entries()) {
      const metadata={projectName:`${projectName.trim() || "未命名项目"} / ${part.id} ${part.name}`,designerName:designerName.trim() || "设计师",statusLabel:part.status};
      encode(createOverviewPdfPage(part.sources,metadata,part.issues.length));
      for (let i=0;i<part.issues.length;i++) {
        if (part.left && part.right) encode(createIssuePdfPage(part.issues[i],i,part.issues.length,part.left,part.right,pair,metadata));
        if(i%4===0)await new Promise(resolve=>setTimeout(resolve,0));
      }
      setExportProgress(`正在生成 ${index+1}/${parts.length} 页面的报告`);
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    return buildImagePdf(pages);
  }

  async function exportBlob(parts) {
    if(exportFormat==="pdf") return createPartsPdf(parts);
    if(exportFormat==="json") return new Blob([JSON.stringify(structuredReport(parts,projectName,designerName),null,2)],{type:"application/json"});
    if(exportFormat==="md") return new Blob([markdownReport(parts,projectName)],{type:"text/markdown;charset=utf-8"});
    return new Blob([buildReportHtml(parts)],{type:"text/html;charset=utf-8"});
  }
  async function exportPngPages(parts) {
    const files=[];
    for(const [index,part] of parts.entries()) {
      const metadata={projectName:`${projectName} / ${part.id} ${part.name}`,designerName,statusLabel:part.status};
      const save=async(canvas,suffix)=>{const data=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));canvas.width=1;canvas.height=1;if(!data)throw new Error("图片生成失败");files.push({name:pageFileName(part,index,"png").replace(/\.png$/,`-${suffix}.png`),data});};
      await save(createOverviewPdfPage(part.sources,metadata,part.issues.length),"概览");
      for(const [i,item] of part.issues.entries()) if(part.left&&part.right)await save(createIssuePdfPage(item,i,part.issues.length,part.left,part.right,pair,metadata),`问题-${i+1}`);
      setExportProgress(`正在生成 ${index+1}/${parts.length} 组图片`);
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    return buildZip(files);
  }

  async function exportPageReports() {
    if(exportBusy)return;
    const scope=exportScope==="current"?[activeScreen]:exportScope==="selected"?selectedScreens:screens;
    const parts=collectExportParts(scope,pairKey,pair);
    setExportBusy(true);setExportProgress("正在整理页面与证据…");
    try {
      await new Promise(resolve=>setTimeout(resolve,0));
      const prefix=safeExportName(projectName || "设计验收");
      const stamp=exportStamp();
      if(exportFormat==="png") {
        downloadBlob(await exportPngPages(parts),`${prefix}-图片_${stamp}.zip`);
      } else if(exportMode==="separate") {
        const files=[];
        for(let i=0;i<parts.length;i++) {
          const part=parts[i];setExportProgress(`正在生成 ${i+1}/${parts.length} 个文件`);
          const data=await exportBlob([part]);
          files.push({name:pageFileName(part,i,exportFormat),data});
          await new Promise(resolve=>setTimeout(resolve,0));
        }
        downloadBlob(await buildZip(files),`${prefix}-按页面-${exportFormat}_${stamp}.zip`);
      } else {
        const blob=await exportBlob(parts);
        downloadBlob(blob,`${prefix}-合并报告_${stamp}.${exportFormat}`);
      }
      setExportOpen(false);setReviewNote(`已导出 ${parts.length} 个页面的${exportMode==="separate"?"独立文件（ZIP）":"合并报告"}`);
    } catch(error) { setExportProgress(`导出失败：${error.message || error}`); }
    finally {setExportBusy(false);}
  }

  function exportPdf() {
    const selected = selectedIssues();
    if (!selected.length || !left || !right) return;
    try {
      const metadata = {projectName: projectName.trim() || "未命名项目", designerName: designerName.trim() || "设计师"};
      const canvases = [
        createOverviewPdfPage(sources, metadata, selected.length),
        ...selected.map((item, index) => createIssuePdfPage(item, index, selected.length, left, right, pair, metadata)),
      ];
      const blob = buildImagePdf(canvases);
      window.__lastGeneratedPdf = blob;
      window.__lastPdfPreview = canvases[0]?.toDataURL("image/png");
      window.__lastPdfPages = canvases.map((canvas) => canvas.toDataURL("image/png"));
      window.__lastPdfError = "";
      downloadBlob(blob, `${safeExportName(projectName)}-设计验收问题清单_${exportStamp()}.pdf`);
    } catch (error) {
      window.__lastPdfError = error?.message || String(error);
      throw error;
    }
  }

  // Overlapping boxes cannot be resolved by paint order. The selected box is deliberately painted
  // above the rest so its resize handles stay reachable, which means a large selected box swallows
  // every click aimed at the smaller boxes inside it — the audit clicked box 7 and got VD-001. The
  // hit is resolved here instead: among the boxes containing the point, the smallest one is the one
  // the reviewer meant, and the gesture is handed to it so a drag moves that box and not the one that
  // happened to be on top.
  function resolveIssueHit(event, side, source) {
    if (panMode || event.button !== 0 || event.target.closest(".resize-handle")) return;
    const issues = report?.issues || [];
    if (issues.length < 2) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const px = (event.clientX - bounds.left) / bounds.width * source.width;
    const py = (event.clientY - bounds.top) / bounds.height * source.height;
    let best = -1, bestArea = Infinity;
    issues.forEach((item, index) => {
      const location = issueLocation(item, side);
      if (!location) return;
      if (px < location.x || px > location.x + location.width) return;
      if (py < location.y || py > location.y + location.height) return;
      const area = location.width * location.height;
      if (area < bestArea) { bestArea = area; best = index; }
    });
    if (best < 0) return;
    // The box the browser would have hit anyway. Leaving that case alone keeps the normal drag path
    // untouched instead of routing every gesture through here.
    const natural = event.target.closest(".issue-box");
    if (natural && Number(natural.dataset.issueIndex) === best) return;
    startIssueMove(event, issues[best], best, side);
    if (issueMoveRef.current) return;
    setSelectedIssue(best);
  }

  const processingCurrent = isAnalyzing || activeScreen.status === "running";

  function renderPassiveFrame(side, source, screen) {
    if (!source) return <div className="canvas-page-placeholder">缺少{side==="left"?"设计稿":"实现图"}</div>;
    const issues=screen.reports?.[pairKey]?.issues || [];
    return <figure className="annotation-panel" key={side}>
      <figcaption><span className={`evidence-kind evidence-kind-${side==="left"?"design":"implementation"}`}>{side==="left"?"设计稿":"实现图"}</span><span className="evidence-file-name" title={source.name}>{source.name}</span></figcaption>
      <div className={`annotated-frame ${screen.status==="running" ? "is-processing" : ""}`}>
        <img src={source.src} alt={`${screen.name} ${side==="left"?"设计稿":"实现图"}`} loading="eager" decoding="async" draggable="false" onClick={()=>selectCanvasGroup(screen.id)} />

        {showAnnotations && issues.map((item,index)=>{
          const location=issueLocation(item,side); if(!location)return null;
          return <button type="button" key={item.id} className="issue-box muted" aria-label={`${screen.id} 问题 ${index+1}：${item.title}`}
            style={{left:`${location.x/source.width*100}%`,top:`${location.y/source.height*100}%`,width:`${location.width/source.width*100}%`,height:`${location.height/source.height*100}%`}}
            onClick={()=>{navigateCanvas(screen.id,index);setIssueRailCollapsed(false);}}><span className="issue-number">{index+1}</span></button>;
        })}
      </div>
    </figure>;
  }

  function renderAnnotationFrame(side, source) {
    const label = evidenceLabel(side === "left" ? pair.left : pair.right);
    return (
      <figure className="annotation-panel" key={side}>
        {/* Tag plus filename: the tag says which side this is, the filename says which file, so a
            reviewer with several similar screens can tell the pair apart without opening intake. */}
        <figcaption>
          <span className="evidence-caption">
            <span className={`evidence-tag ${side === "left" ? "is-design" : "is-implementation"}`}>{side === "left" ? "设计稿" : "实现图"}</span>
            <span className="evidence-filename" title={source.name || ""}>{source.name || label}</span>
          </span>
          <span className="evidence-hint">直接拖动红框，四角缩放</span>
        </figcaption>
        <div className={`annotated-frame ${processingCurrent ? "is-processing" : ""}`} aria-busy={processingCurrent} onPointerDownCapture={(event) => resolveIssueHit(event, side, source)}>
          <img src={source.src} alt={`${label}框选证据`} draggable="false" onDragStart={(event) => event.preventDefault()} />
          {showAnnotations && report?.issues?.map((item, index) => {
            const location = issueLocation(item, side);
            if (!location) return null;
            return (
              <div
                key={item.id}
                data-issue-index={index}
                className={`issue-box ${selectedIssue === index ? "selected" : "muted"}`}
                style={{left: `${location.x / source.width * 100}%`, top: `${location.y / source.height * 100}%`, width: `${location.width / source.width * 100}%`, height: `${location.height / source.height * 100}%`}}
                role="button"
                tabIndex="0"
                aria-label={`选择问题 ${index + 1}：${item.title}，${label}框选`}
                onPointerDown={(event) => startIssueMove(event, item, index, side)}
                onClick={() => setSelectedIssue(index)}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedIssue(index); }}
              >
                <span className="issue-number">{index + 1}</span>
                {selectedIssue === index && ["nw", "ne", "sw", "se"].map((corner) => (
                  <button
                    key={corner}
                    type="button"
                    className={`resize-handle resize-${corner}`}
                    aria-label={`从${corner.toUpperCase()}角调整问题 ${index + 1} 的${label}框选范围`}
                    onPointerDown={(event) => startIssueResize(event, item, index, corner, side)}
                    onClick={(event) => event.stopPropagation()}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </figure>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          
          <span className="editable-meta project-meta">
            <span className="field-label">项目：</span>
            {editingProjectName ? (
              <Input
                autoFocus
                className="project-name-input"
                value={projectName}
                aria-label="编辑项目名称"
                onChange={(event) => setProjectName(event.target.value)}
                onBlur={() => setEditingProjectName(false)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") setEditingProjectName(false);
                }}
                placeholder="未命名项目"
              />
            ) : (
              <>
                <span className="meta-value project-name-value" title={projectName.trim() || "未命名项目"}>{projectName.trim() || "未命名项目"}</span>
                <Button type="button" variant="ghost" size="icon" className="meta-edit-button" aria-label="编辑项目名称" onClick={() => setEditingProjectName(true)}><Icon icon={PencilEdit01Icon} /></Button>
              </>
            )}
          </span>
          {/* Designer sits beside the project name in the same pill rather than in its own chip on
              the far right — both are review metadata and belong together. */}
          <span className="editable-meta designer-field">
            <span className="field-label">设计师：</span>
            {editingDesignerName ? (
              <Input
                autoFocus
                className="designer-name-input"
                value={designerName}
                aria-label="编辑设计师名称"
                onChange={(event) => setDesignerName(event.target.value)}
                onBlur={() => setEditingDesignerName(false)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") setEditingDesignerName(false);
                }}
                placeholder="设计师"
              />
            ) : (
              <>
                <span className="meta-value designer-name-value" title={designerName.trim() || "设计师"}>{designerName.trim() || "设计师"}</span>
                <Button type="button" variant="ghost" size="icon" className="meta-edit-button" aria-label="编辑设计师名称" onClick={() => setEditingDesignerName(true)}><Icon icon={PencilEdit01Icon} /></Button>
              </>
            )}
          </span>
        </div>
      </header>

      <div className={`editor-grid ${issueRailCollapsed ? "issue-collapsed" : ""}`}>
        {/* Permanent tool rail. It never collapses: it is the workbench's primary navigation, and
            each entry opens its panel on hover so the canvas keeps the rest of the window. */}
        <aside className="tool-rail" ref={toolRailRef}>
          <div className="rail-icon-bar" role="toolbar" aria-label="主功能">
            <button
              type="button"
              className={railPanel === "intake" ? "active" : ""}
              aria-label="添加设计稿或实现图"
              data-shortcut="U"
              aria-expanded={railPanel === "intake"}
              onClick={(event) => {
                if (railPanel === "intake" && railSticky) { setRailPanel(null); return; }
                requestIntake(event.currentTarget.getBoundingClientRect());
              }}
            ><Icon icon={PlusSignIcon} /></button>
            <button
              type="button"
              className={railPanel === "history" ? "active" : ""}
              aria-label="任务历史"
              data-shortcut="L"
              aria-expanded={railPanel === "history"}
              onMouseEnter={() => openRailPanel("history")}
              onFocus={() => openRailPanel("history")}
              onClick={() => { if (railPanel === "history" && railSticky) setRailPanel(null); else openRailPanel("history", true); }}
            ><Icon icon={HistoryIcon} />{history.length > 0 && <b>{history.length}</b>}</button>
          </div>

              {railPanel === "intake" && createPortal(
            <div className="intake-modal-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) setRailPanel(null); }}>
            <div ref={intakeModalRef} className="intake-modal-panel" role="dialog" aria-modal="true" aria-label="走查素材">
              <header className="intake-modal-header"><div><strong>走查素材</strong><span>添加设计稿与实现截图，支持批量导入</span></div><button type="button" aria-label="关闭走查素材" onClick={() => setRailPanel(null)}><Icon icon={Cancel01Icon} size={20} /></button></header>
              <div className="rail-flyout-scroll">
              {/* Batch-first intake. The old per-source cards are gone: one design plus one screenshot is
                  just a batch of one, and keeping both paths meant two ways to do the same thing. Drag,
                  paste, and Figma all live here now so nothing was lost with those cards. */}
              <section className="intake">
                
                <div className="intake-zones">
                  <DropZone kind="design" label="设计稿" count={batchDrafts?.designs?.length || 0}
                    active={activeSourceKind === "design"} onActivate={setActiveSourceKind} onFiles={onBatchFiles}
                    footer={(
                      <button type="button" ref={figmaTriggerRef} className="figma-entry" data-no-tip aria-expanded={figmaOpen}
                        onClick={() => {
                          const box = figmaTriggerRef.current?.getBoundingClientRect();
                          if (box) setFigmaAnchor({left: box.left, top: box.bottom + 8});
                          // Open, never toggle. A pointer dispatch that fires the handler twice would
                          // toggle straight back to closed, and a form popover should only ever be
                          // dismissed deliberately — via its ×, Escape, or a click outside.
                          setFigmaOpen(true);
                        }}>
                        {figmaNote ? "从 Figma 再导入" : "从 Figma 导入"}
                      </button>
                    )} />
                  <DropZone kind="implementation" label="实现截图" count={batchDrafts?.implementations?.length || 0}
                    active={activeSourceKind === "implementation"} onActivate={setActiveSourceKind} onFiles={onBatchFiles} />
                </div>
                {figmaOpen && (
                  <div className="figma-popover" role="dialog" aria-label="从 Figma 导入设计稿"
                    style={{left: figmaAnchor?.left ?? 0, top: figmaAnchor?.top ?? 0}}>
                    <div className="figma-popover-head">
                      <strong>从 Figma 导入设计稿</strong>
                      <button type="button" aria-label="关闭 Figma 导入" onClick={() => setFigmaOpen(false)}><Icon icon={Cancel01Icon} size={15} /></button>
                    </div>
                    <div className="figma-form">
                    <div className="textfield">
                      <Label htmlFor="figma-frame-url">Frame 链接</Label><Input id="figma-frame-url" value={figmaUrl} onChange={(event) => setFigmaUrl(event.target.value)} aria-invalid={Boolean(figmaError)} placeholder="https://figma.com/design/…" />
                    </div>
                    <div className="textfield">
                      <div className="token-label-row">
                        <Label htmlFor="figma-token">临时 Token（私有文件）</Label>
                        <span className="token-help">
                          <Button type="button" variant="outline" size="icon" className="token-help-trigger" aria-label="查看 Figma Token 获取方式" aria-describedby="figma-token-help">?</Button>
                          <span id="figma-token-help" className="token-help-popover" role="tooltip">
                            <strong>获取 Figma Token</strong>
                            <span>1. 在 Figma 文件浏览器打开左上角账号菜单 → Settings。</span>
                            <span>2. 进入 Security → Personal access tokens。</span>
                            <span>3. 选择 Generate new token，设置有效期和读取权限后生成。</span>
                            <span>Token 只显示一次，请立即复制；本工具仅用于本次请求。</span>
                            <a href="https://developers.figma.com/docs/rest-api/personal-access-tokens/" target="_blank" rel="noreferrer">查看 Figma 官方说明 ↗</a>
                          </span>
                        </span>
                      </div>
                      <Input id="figma-token" type="password" value={figmaToken} onChange={(event) => setFigmaToken(event.target.value)} aria-invalid={Boolean(figmaError)} autoComplete="off" placeholder="figd_…" />
                      <span data-slot="description">仅用于本次请求，不会保存。</span>{figmaError && <span data-slot="error-message" role="alert">{figmaError}</span>}
                    </div>
                    <Button variant="outline" size="sm" className="w-full figma-load-button" disabled={loadingFigma} onClick={loadFigma}>{loadingFigma && <Icon icon={Loading03Icon} className="animate-spin" />}加载 Figma</Button>
                    {figmaNote && (
                      <div className="figma-success">
                        {batchDrafts?.designs?.length > 0 && (
                          <div className="figma-thumbnail"><img src={batchDrafts.designs[0].src} alt="已导入的 Figma 界面预览" /></div>
                        )}
                        <div className="figma-success-copy">
                          <Badge variant="success">Figma 已导入</Badge>
                          <span>{figmaNote}</span>
                        </div>
                      </div>
                    )}
                    </div>
                  </div>
                )}
                {batchDrafts?.designs?.length > 0 && !batchDrafts?.implementations?.length && (
                  <p className="batch-hint pending">请再选择实现截图</p>
                )}
                {batchDrafts?.implementations?.length > 0 && !batchDrafts?.designs?.length && (
                  <p className="batch-hint pending">请再选择设计稿</p>
                )}
              </section>

              </div>
              <div className="rail-flyout-foot">
                <span className={`codex-connection is-${codexStatus}`}>{codexStatus === "connected" ? "AI 已连接" : codexStatus === "checking" ? "正在连接 AI…" : "AI 未连接"}</span>
                <span>素材仅在本地处理</span>
              </div>
            </div>
            </div>, document.body
          )}

                  {railPanel === "history" && (
            <div className="rail-flyout" role="region" aria-label="走查记录" onMouseEnter={() => openRailPanel("history")}>
              <div className="rail-flyout-head"><strong>走查记录</strong><span>点击回到当时的走查现场</span></div>
              <div className="rail-flyout-scroll">
                {history.length === 0 ? <p className="history-empty">完成一次走查后会自动留档。点击记录可回到当时的界面、标注和问题清单，继续修改或重新导出。</p> : history.map((record) => (
                  <div key={record.id} className="history-row">
                    <button type="button" className="history-open" onClick={() => openHistoryRecord(record.id)}>
                      <span className="history-name">{record.projectName}</span>
                      <span className="history-meta">{new Date(record.createdAt).toLocaleString("zh-CN")} · {record.screenCount} 个界面 · {record.issueCount} 个问题</span>
                    </button>
                    <span className="history-actions">
                      <button type="button" aria-label={`删除记录 ${record.projectName}`} onClick={() => removeHistoryRecord(record.id)}><Icon icon={Delete02Icon} size={15} /></button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
            </aside>

        <section className="canvas-column">
          <div
            ref={canvasStageRef}
            className={`canvas-stage ${panMode ? "can-pan" : ""} ${isCanvasDragging ? "is-dragging" : ""}`}
            /* The worksurface belongs to the canvas, so its grid scales with the zoom and pans with
               the content instead of sitting still behind it. */
            style={{"--dot-gap": `${(18 * zoom).toFixed(2)}px`, "--dot-radius": `${Math.max(.6, zoom).toFixed(2)}px`}}
            onTouchStart={handleCanvasTouchStart}
            onTouchMove={handleCanvasTouchMove}
            onTouchEnd={() => { gestureRef.current = null; }}
            /* Double-click anywhere on an empty canvas opens intake. It used to sit on the hint
               itself, which stopped working once the hint became a small block centred in the
               extent rather than a full-height panel — only the text was clickable. */
            onDoubleClick={hasEvidence ? undefined : openIntakeFromCanvas}
            onPointerDownCapture={beginGroupSelection}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={endCanvasPointer}
            onPointerCancel={endCanvasPointer}
          >
            {multiCanvas ? (
              <div className="canvas-extent multi-canvas-extent" style={{padding:"65vh 65vw",width:boardLayout.width*zoom,height:Math.max(boardLayout.height,retainedBoard.current?.height||0)*zoom}}>
                <div className="zoom-surface multi-canvas-surface" style={{width:boardLayout.width*zoom,height:Math.max(boardLayout.height,retainedBoard.current?.height||0)*zoom}}>
                  <div className="multi-canvas-board" style={{width:boardLayout.width,height:Math.max(boardLayout.height,retainedBoard.current?.height||0),transform:`scale(${zoom})`}}>
                    <button className="canvas-add-slot" style={{left:boardLayout.addSlot.x,top:boardLayout.addSlot.y,width:boardLayout.addSlot.width,height:boardLayout.addSlot.height}} onClick={()=>addCanvasGroup()}><Icon icon={PlusSignIcon} size={28}/>添加新组</button>
                    {boardLayout.groups.map(group=><CanvasPageGroup key={group.screen.id} group={group} active={group.screen.id===activeScreenId} stageRef={canvasStageRef} onSelect={event=>selectCanvasGroup(group.screen.id,event)} progress={phaseProgress(analysisPhase,aiElapsedMs)} selected={multiSelection?selectedGroupIds.includes(group.screen.id):group.screen.id===activeScreenId} actionsVisible={groupActionsVisible&&(!multiSelection||selectedGroupIds.includes(activeScreenId))} zoom={zoom} actionsDisabled={!canEditGroup(group.screen)} onReplace={(kind,file)=>replaceGroupSource(group.screen.id,kind,file)} onDelete={()=>deleteCanvasGroup(group.screen.id)} onReview={event=>reviewCanvasGroup(group.screen,event)} onCancelQueue={()=>cancelQueuedReview(group.screen.id)} queuePosition={waitingGroupIds.indexOf(group.screen.id)+1} reviewDisabled={runningGroupId.current===group.screen.id||isAnalyzing||codexStatus!=="connected"||!group.screen.sources.design||!group.screen.sources.implementation}>
                      {()=><><div className="canvas-page-state">{collectExportParts([group.screen],pairKey,pair)[0].status} · {group.screen.reports?.[pairKey]?.issues?.length || 0} 项问题</div>
                      <div className="dual-annotation-view">{group.screen.id===activeScreenId
                        ? <>{left && renderAnnotationFrame("left",left)}{right && renderAnnotationFrame("right",right)}</>
                        : <>{renderPassiveFrame("left",group.screen.sources[pair.left],group.screen)}{renderPassiveFrame("right",group.screen.sources[pair.right],group.screen)}</>}
                      </div></>}
                    </CanvasPageGroup>)}
                  </div>
                </div>
              </div>
            ) : !left || !right ? (
              <div className="canvas-extent" style={{padding: `${46 * zoom}vh ${46 * zoom}vw`}}>
              <div className="canvas-empty">
                <p className="canvas-empty-line">
                  <span className="hint-chip"><Icon icon={CursorMagicSelection01Icon} size={16} />双击</span>
                  <span className="hint-join">或</span>
                  <kbd>U</kbd>
                  <strong>导入设计稿与实现截图</strong>
                </p>
                <p className="canvas-empty-line is-secondary"><kbd>L</kbd><span>打开任务历史，继续上一次走查</span></p>
              </div>
              </div>
            ) : (
              /* A viewport-sized margin around the artwork on every side. Without it the scroll
                 container clamps to the frames, so the canvas could never be pushed aside to study
                 one edge on its own. */
              <div className="canvas-extent" style={{padding: `${46 * zoom}vh ${46 * zoom}vw`}}>
              <div className="zoom-surface" style={{width: `${zoom * 100}%`, maxWidth: `${((view === "annotated" || processingCurrent) ? 1500 : 750) * zoom}px`}}>
                {groupActionsVisible && !multiSelection && <CanvasGroupActions actionsDisabled={!canEditGroup(activeScreen)} onReplace={(kind,file)=>replaceGroupSource(activeScreenId,kind,file)} onDelete={()=>deleteCanvasGroup(activeScreenId)} onReview={event=>reviewCanvasGroup(activeScreen,event)} queuePosition={waitingGroupIds.indexOf(activeScreenId)+1} reviewDisabled={runningGroupId.current===activeScreenId||isAnalyzing||codexStatus!=="connected"||!hasEvidence}/>}
                {processingCurrent && <GroupProgress value={phaseProgress(analysisPhase,aiElapsedMs)}/>}
                {(view === "annotated" || processingCurrent) && <div className="dual-annotation-view">{renderAnnotationFrame("left", left)}{renderAnnotationFrame("right", right)}</div>}
                {view === "overlay" && !processingCurrent && (
                  <div className="overlay-frame" onClickCapture={(event) => {
                    // Same smallest-box-wins rule as the annotated view. There is no drag here, so a
                    // plain click is enough.
                    const issues = report?.issues || [];
                    if (issues.length < 2 || event.target.closest(".resize-handle")) return;
                    const bounds = event.currentTarget.getBoundingClientRect();
                    if (!bounds.width || !bounds.height) return;
                    const px = (event.clientX - bounds.left) / bounds.width * right.width;
                    const py = (event.clientY - bounds.top) / bounds.height * right.height;
                    let best = -1, bestArea = Infinity;
                    issues.forEach((item, index) => {
                      const location = issueLocation(item, "right");
                      if (!location) return;
                      if (px < location.x || px > location.x + location.width) return;
                      if (py < location.y || py > location.y + location.height) return;
                      const area = location.width * location.height;
                      if (area < bestArea) { bestArea = area; best = index; }
                    });
                    if (best < 0) return;
                    event.stopPropagation();
                    setSelectedIssue(best);
                  }}>
                    <img src={left.src} alt="叠加底图" draggable="false" onDragStart={(event) => event.preventDefault()} />
                    <img src={right.src} alt="叠加顶图" draggable="false" onDragStart={(event) => event.preventDefault()} style={{opacity: opacity / 100}} />
                    {/* Overlay used to drop every marker, so the reviewer could see the misalignment
                        but not which issue it belonged to. Use the implementation bounds, since the
                        top image is the implementation. `H` still hides them for a clean overlay. */}
                    {showAnnotations && report?.issues?.map((item, index) => {
                      const location = issueLocation(item, "right");
                      if (!location) return null;
                      return (
                        <div
                          key={item.id}
                          data-issue-index={index}
                          className={`issue-box overlay-box ${selectedIssue === index ? "selected" : "muted"}`}
                          style={{left: `${location.x / right.width * 100}%`, top: `${location.y / right.height * 100}%`, width: `${location.width / right.width * 100}%`, height: `${location.height / right.height * 100}%`}}
                          role="button"
                          tabIndex="0"
                          aria-label={`选择问题 ${index + 1}：${item.title}`}
                          onClick={() => setSelectedIssue(index)}
                          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedIssue(index); }}
                        ><span className="issue-number">{index + 1}</span></div>
                      );
                    })}
                  </div>
                )}
              </div>
              </div>
            )}
          </div>
          <div className="canvas-dock-row" ref={dockRowRef} style={{"--dock-shift": `${dockShift}px`}}>
          <div className="canvas-tool-dock dock-secondary" onPointerDown={(event) => event.stopPropagation()}>
            <span className="dock-record-actions">
              <Button variant="secondary" size="sm" aria-label="退回上一步" data-shortcut="⌘Z"
                disabled={!undoDepth} onClick={undoEdit}><Icon icon={ArrowTurnBackwardIcon} className="tool-icon" /></Button>
              <Button variant="secondary" size="sm" aria-label="前进下一步" data-shortcut="⇧⌘Z"
                disabled={!redoDepth} onClick={redoEdit}><Icon icon={ArrowTurnForwardIcon} className="tool-icon" /></Button>
              {/* Always rendered, disabled when there is nothing to save: a control that disappears
                  makes the dock reflow and hides the fact that saving exists at all. */}
              <Button variant="secondary" size="sm" data-shortcut="⌘S"
                aria-label={saveDisabledReason ? `无法保存：${saveDisabledReason}` : restoredRecord ? `保存到走查记录「${restoredRecord.projectName}」` : "保存当前走查记录"}
                aria-disabled={Boolean(saveDisabledReason)} className={saveDisabledReason ? "save-unavailable" : ""}
                onClick={saveRestoredRecord}><Icon icon={FloppyDiskIcon} className="tool-icon" /></Button>
            </span>
          </div>
          <div className="canvas-tool-dock" onPointerDown={(event) => event.stopPropagation()}>
            {/* Starting a review is the primary action, so it leads the dock in the accent colour
                instead of hiding inside a panel that can be closed. */}
            <Button variant="primary" size="sm" className="dock-run-action" data-shortcut="R"
              disabled={!hasScreens || batchRunning || isAnalyzing || codexStatus !== "connected"}
              onClick={(event) => {
                // A re-review is a new round, not a destructive rerun of this one.
                if (!hasCompletedReview || baselineRound) { runBatch(); return; }
                const bounds = event.currentTarget.getBoundingClientRect();
                setRerunPrompt({top: bounds.top - 12, left: bounds.left});
              }}>
              {batchRunning || isAnalyzing ? <Icon icon={Loading03Icon} className="animate-spin" size={15} /> : <Icon icon={AiSearch01Icon} size={15} />}
              {batchRunning ? `检测中 ${batchProgress.done}/${batchProgress.total}`
                : screens.length > 1 ? `开始验收 ${screens.length} 个界面` : "开始验收"}
            </Button>
            {batchRunning && <button type="button" className="dock-cancel" onClick={() => { batchCancelRef.current = true; }}>中止</button>}
            {/* Clicking 叠加 again toggles its popover; the tab itself reports no change when it is
                already active, so the second press is caught here. */}
            <div className="view-controls" ref={viewControlsRef}
              onClick={(event) => {
                if (view !== "overlay") return;
                if (event.target.closest('[aria-label="叠加"]')) setShowOpacity((current) => !current);
              }}>
              <HeroTabs value={view} onChange={setView} ariaLabel="对比方式" items={[{id: "annotated", label: "标注", icon: CursorRectangleSelection01Icon, shortcut: "A", disabled: !hasEvidence}, {id: "overlay", label: "叠加", icon: Layers01Icon, shortcut: "O", disabled: !hasEvidence}]} />
            </div>
            {/* Overlay carries annotations too now, so the show/hide control belongs in both views,
                and it reads as part of the view group rather than a stray switch at the far end. */}
            <div className="visibility-controls">
              <Button variant="secondary" size="sm" aria-label={showAnnotations ? "隐藏选框" : "显示选框"} data-shortcut="H" disabled={!hasEvidence} aria-pressed={showAnnotations} onClick={() => setShowAnnotations((current) => !current)}><VisibilityIcon hidden={!showAnnotations} /></Button>
            </div>
            <div className="zoom-controls" aria-label="画布缩放控件">
              <Button variant="secondary" size="sm" aria-label="缩小画布" data-shortcut="−" disabled={zoom <= ZOOM_MIN} onClick={() => changeZoom(steppedZoom(-1))}><ZoomIcon direction="out" /></Button>
              <Button variant="ghost" size="sm" aria-label="重置画布缩放" data-shortcut="0" onClick={() => changeZoom(1)}>{Math.round(zoom * 100)}%</Button>
              <Button variant="secondary" size="sm" aria-label="放大画布" data-shortcut="+" disabled={zoom >= ZOOM_MAX} onClick={() => changeZoom(steppedZoom(1))}><ZoomIcon direction="in" /></Button>
              {/* "Show me both images whole." Reset-to-100% is not that: on a @3x phone pair 100% is
                  far larger than the stage, which is how a restored record opened with both images
                  running off the top and bottom. */}
              <Button variant="secondary" size="sm" aria-label="适应画布（查看全图）" data-shortcut="F"
                disabled={!hasEvidence} onClick={() => fitToCanvas()}><FitIcon /></Button>
            </div>
            {/* The canvas can be pushed far off the artwork, so the map is a peer of the zoom
                controls: it answers "where am I" and puts you back. */}
            <Button variant="secondary" size="sm" className={`dock-map-toggle ${showMinimap ? "is-open" : ""}`}
              ref={minimapToggleRef}
              aria-label={showMinimap ? "关闭画布缩略图" : "查看画布缩略图"} data-shortcut="M"
              aria-pressed={showMinimap} aria-expanded={showMinimap} disabled={!canvasView}
              onClick={() => setShowMinimap((current) => !current)}><Icon icon={MapsIcon} className="tool-icon" /></Button>
          </div>
          {/* The issue list's own entry, in its own pill at the right end. The dock is right-aligned
              and steps aside when the panel opens, so the two never overlap. */}
          <div className="canvas-tool-dock dock-issues" onPointerDown={(event) => event.stopPropagation()}>
            <Button variant="secondary" size="sm" className={`dock-issues-toggle ${issueRailCollapsed ? "" : "is-open"}`}
              aria-label={issueRailCollapsed ? `展开问题清单（${confirmedCount} 个问题）` : "收起问题清单"}
              data-shortcut="I" aria-pressed={!issueRailCollapsed}
              onClick={() => setIssueRailCollapsed((current) => !current)}>
              <Icon icon={CheckListIcon} className="tool-icon" />
              {confirmedCount > 0 && <b className="dock-badge">{confirmedCount}</b>}
            </Button>
          </div>
          </div>
        </section>

        {/* Both states stay mounted. Unmounting the panel meant React tore down and rebuilt every issue
            card and evidence canvas at the exact moment the animation started, so the first frames were
            spent on that work instead of the transition — the stutter. Toggling visibility keeps the
            subtree alive, and `inert` keeps the hidden one out of focus order and hit testing. */}
        <aside className={`issue-rail ${issueRailCollapsed ? "is-collapsed" : ""}`} inert={issueRailCollapsed || undefined}
          style={railWidth ? {"--rail-width": `${railWidth}px`} : undefined}>
          {/* Drag handle on the rail's inner edge. The rail floats over the canvas, so widening it
              takes space from the canvas rather than reflowing the layout. */}
          <div className="rail-resize" role="separator" aria-orientation="vertical" aria-label="拖动调整问题清单宽度"
            onPointerDown={startRailResize} onDoubleClick={() => { setRailWidth(0); window.localStorage?.removeItem("zymix-rail-width"); }} />
          {/* Both rails float over the canvas and both collapse, so the reviewer can give the whole
              window to the comparison and bring either side back with one click. */}
          <div className="issue-rail-header">
            <div className="panel-title">
              <div className="panel-heading"><strong>问题清单</strong>{screens.length > 1 && <span className="issue-active-page" title={activeScreen.name}>{multiSelection?`已选 ${selectedScreens.length} 组`:`当前组 · ${activeScreen.id} ${activeScreen.name}`}</span>}</div>
              {/* The actions used to occupy a band of their own under an instructional sentence that
                  described what the cards already show. Sitting beside the title costs no vertical
                  space and keeps them where the reviewer is already looking. */}
              <div className="panel-actions">
                <Button className="add-issue-button" variant="secondary" size="sm" disabled={!left || !right || multiSelection} onClick={addIssue}>＋ 新增</Button>
              </div>
            </div>
            <HeroTabs value={issueFilter} onChange={(nextFilter) => { setIssueFilter(nextFilter); setIssueTypeFilter("all"); setIssueSeverityFilter("all"); }} ariaLabel="问题清单筛选" items={[{id: "all", label: `问题项 ${multiSelection?selectedIssueCount:confirmedCount}`}, {id: "ignored", label: `已忽略 ${multiSelection?selectedIgnoredCount:ignoredList.length}`}]} />
            {!multiSelection && issueTabSource.length > 0 && (
            <div className="issue-filter-panel">
              {ISSUE_TYPES.some((type) => issueTypeCounts[type] > 0) && (
                <div className="type-filter-row" aria-label="问题类型筛选">
                  <Button type="button" variant="outline" className="issue-filter-chip" aria-pressed={issueTypeFilter === "all"} onClick={() => setIssueTypeFilter("all")}>全部 <span>{issueTabSource.length}</span></Button>
                  {ISSUE_TYPES.filter((type) => issueTypeCounts[type] > 0).map((type) => <Button type="button" variant="outline" key={type} className="issue-filter-chip" aria-pressed={issueTypeFilter === type} onClick={() => setIssueTypeFilter(type)}>{type} <span>{issueTypeCounts[type]}</span></Button>)}
                  {/* Severity is a fixed three-value axis, so it belongs in a menu rather than as
                      four more chips competing with the type filter for the same row. */}
                  <span className="type-filter-spacer" />
                  <SeverityFilterMenu label="按优先级筛选" value={issueSeverityFilter} onChange={setIssueSeverityFilter}
                    options={[{id: "all", label: "全部优先级", count: issueTabSource.length, divide: false},
                      ...ISSUE_SEVERITIES.map((severity, index) => ({id: severity, label: severity, count: issueSeverityCounts[severity], divide: index === 0}))]} />
                </div>
              )}
            </div>
            )}
          </div>
          <div className="issue-list" ref={issueListRef}>
            {/* One slim line, and closable. The rail used to restate the reason, the advice and the
                raw error in a full-height red card — a second copy of what the canvas toast had just
                said, sitting exactly where the reviewer wants to start adding problems by hand. The
                dismissal is the same key as the toast, so acknowledging it once is enough. */}
            {!multiSelection && activeScreen.status === "failed" && !dismissedFailures[failureKey] && (
              <div className="issue-list-failed-note" role="status">
                <span>
                  <strong>AI 检测未成功</strong>：{activeFailure.title}。
                  {issueListState === "list" ? "下面是你手动记录的问题，不是 AI 的检测结果。" : "可以直接手动记录问题。"}
                </span>
                {activeFailure.retryable && (
                  <Button variant="secondary" size="sm" data-no-tip disabled={batchRunning} onClick={() => retryScreen(activeScreen.id)}>重试本屏</Button>
                )}
                <button type="button" className="issue-list-failed-close" data-no-tip aria-label="关闭检测失败提示"
                  onClick={() => setDismissedFailures((current) => ({...current, [failureKey]: true}))}>
                  <Icon icon={Cancel01Icon} size={13} />
                </button>
              </div>
            )}
            {multiSelection ? selectedScreens.map(screen=>{
              const items=issueFilter==="ignored"?(screen.ignoredIssues[pairKey]||[]):(screen.reports[pairKey]?.issues||[]);
              return <section className="selected-group-issues" key={screen.id} aria-label={`${screen.id} 的问题`}><h3>{screen.id} · {screen.name}<small>{items.length} 项</small></h3>{!items.length&&<p className="empty-list">本组{issueFilter==="ignored"?"没有已忽略问题":"暂无问题记录"}</p>}{items.map((item,index)=><article data-screen-id={screen.id} data-issue-index={index} className={`issue-card ${issueFilter==="ignored"?"ignored":activeScreenId===screen.id&&selectedIssue===index?"selected":""}`} key={item.ignoredKey||item.id||index} onClick={()=>{if(issueFilter!=="ignored")navigateCanvas(screen.id,index);}}>
                <div className="issue-card-head">
                  <div className="issue-meta"><span>{item.id}</span><Badge variant={item.severity==="P0"?"destructive":item.severity==="P1"?"warning":"secondary"}>{item.severity}</Badge><Badge variant="secondary">{issueFilter==="ignored"?"已忽略":normalizedIssueType(item)}</Badge></div>
                  <div className="issue-card-actions">
                    {issueFilter!=="ignored"&&<Button variant="ghost" size="sm" aria-label={`复制剪贴板 ${screen.id} ${item.id}`} onClick={event=>{event.stopPropagation();copyIssueToClipboard(item,screen.sources[pair.left],screen.sources[pair.right]);}}>复制剪贴板</Button>}
                    <Button variant="ghost" size="sm" aria-label={`${issueFilter==="ignored"?"恢复":"忽略"} ${screen.id} ${item.id}`} onClick={event=>{event.stopPropagation();toggleGroupedIssue(screen.id,item);}}>{issueFilter==="ignored"?"恢复问题":"忽略"}</Button>
                  </div>
                </div>
                <IssueTitleField value={item.title} ariaLabel={`${screen.id} ${item.id} 问题标题`} onClick={event=>event.stopPropagation()} onChange={value=>editGroupedIssue(screen.id,item,{title:value})}/>
                <RegionComparison left={screen.sources[pair.left]} right={screen.sources[pair.right]} item={item} pair={pair} onEnlarge={value=>setEnlargedIssue({...value,_left:screen.sources[pair.left],_right:screen.sources[pair.right]})}/>
                <div className="issue-facts">
                  <label className="issue-edit-field"><b>设计预期</b><IssueTextarea value={item.expected||item.summary} onClick={event=>event.stopPropagation()} onChange={event=>editGroupedIssue(screen.id,item,{expected:event.target.value})}/></label>
                  <label className="issue-edit-field"><b>实现现状</b><IssueTextarea value={item.actual||item.delta} onClick={event=>event.stopPropagation()} onChange={event=>editGroupedIssue(screen.id,item,{actual:event.target.value})}/></label>
                  <label className="issue-edit-field fix"><b>复刻要求</b><IssueTextarea value={item.recommendation||item.delta} onClick={event=>event.stopPropagation()} onChange={event=>editGroupedIssue(screen.id,item,{recommendation:event.target.value})}/></label>
                </div>
                <small className="location"><span>{evidenceLabel(pair.left)}：{formatBounds(issueLocation(item,"left"),screen.sources[pair.left])}</span><span>{evidenceLabel(pair.right)}：{formatBounds(issueLocation(item,"right"),screen.sources[pair.right])}</span></small>
              </article>)}</section>;
            }) : <>
            {roundDiff && (() => {
              const screen = roundDiff.screens.find((item) => item.id === activeScreenId) || null;
              const totals = roundDiff.totals;
              return (
                <div className="round-summary" role="status">
                  <div className="round-summary-head">
                    <strong>复验结果</strong>
                    <span>对比 {new Date(roundDiff.createdAt).toLocaleDateString("zh-CN")} 那一轮的 {totals.previous} 个问题</span>
                  </div>
                  <div className="round-stats">
                    <span className="round-stat fixed"><b>{totals.fixed}</b>已修复</span>
                    <span className="round-stat carried"><b>{totals.carried}</b>仍存在</span>
                    <span className="round-stat added"><b>{totals.added}</b>新增</span>
                  </div>
                  {screen && screen.fixed.length > 0 && (
                    <details className="round-fixed">
                      <summary>本屏已修复 {screen.fixed.length} 项</summary>
                      <ul>{screen.fixed.map((item) => (
                        <li key={item.id}><s>{item.title}</s><small>{item.category} · {item.severity}</small></li>
                      ))}</ul>
                    </details>
                  )}
                </div>
              );
            })()}
            {showPraise && (
              <article className="praise-card">
                <div className="praise-icon" aria-hidden="true">🎉</div>
                <div className="praise-content">
                  <div className="praise-heading"><Badge variant="success">还原度 {fidelity.toFixed(1)}%</Badge><strong>这次值得好好夸夸开发</strong></div>
                  <Textarea className="praise-editor" value={praiseText} aria-label="编辑夸夸文案" onChange={(event) => { setPraiseText(event.target.value); setCopiedPraise(false); setPraiseGenerationNote("文案已编辑，可以直接复制"); }} />
                  <div className="praise-generation-note" aria-live="polite">{isGeneratingPraise ? "正在阅读当前页面数据…" : praiseGenerationNote}</div>
                  <div className="praise-actions">
                    <Button variant="ghost" size="sm" onClick={randomizePraise}>🎲 随机生成</Button>
                    <Button variant="secondary" size="sm" disabled={isGeneratingPraise} onClick={generatePraiseFromResults}>{isGeneratingPraise && <Icon icon={Loading03Icon} className="animate-spin" />}✨ 根据验收结果生成</Button>
                    <Button variant="primary" size="sm" onClick={copyPraise}>{copiedPraise ? "已复制 ✓" : "复制夸夸"}</Button>
                  </div>
                </div>
              </article>
            )}
            {issueFilter === "ignored" ? (!ignoredList.length ? <div className="empty-list">还没有忽略任何问题</div> : !filteredIgnoredIssues.length ? <div className="empty-list">当前筛选下没有已忽略问题</div> : filteredIgnoredIssues.map((item, ignoredIndex) => (
              <article key={item.ignoredKey} className="issue-card ignored">
                <div className="issue-card-head">
                  <div className="issue-meta"><span>{`IGN-${String(ignoredIndex + 1).padStart(3, "0")}`}</span><Badge variant="secondary">已忽略</Badge><small>原 {item.originalId}</small></div>
                  <div className="issue-card-actions">
                    <Button className="restore-button" variant="ghost" size="sm" aria-label={`恢复原问题 ${item.originalId}`} onClick={() => restoreIssue(item.ignoredKey)}>恢复问题</Button>
                  </div>
                </div>
                <IssueTitleField value={item.title} ariaLabel={`${item.originalId} 已忽略问题标题`} onChange={(value) => updateIgnoredIssue(item.ignoredKey, {title: value})} />
                <RegionComparison left={left} right={right} item={item} pair={pair} onEnlarge={setEnlargedIssue} />
                <div className="issue-facts">
                  <label className="issue-edit-field"><b>设计预期</b><IssueTextarea value={item.expected || item.summary} onChange={(event) => updateIgnoredIssue(item.ignoredKey, {expected: event.target.value})} /></label>
                  <label className="issue-edit-field"><b>实现现状</b><IssueTextarea value={item.actual || item.delta} onChange={(event) => updateIgnoredIssue(item.ignoredKey, {actual: event.target.value})} /></label>
                  <label className="issue-edit-field fix"><b>复刻要求</b><IssueTextarea value={item.recommendation || item.delta} onChange={(event) => updateIgnoredIssue(item.ignoredKey, {recommendation: event.target.value})} /></label>
                </div>
                {(issueLocation(item, "left") || issueLocation(item, "right")) && <small className="location"><span>{evidenceLabel(pair.left)}：{formatBounds(issueLocation(item, "left"), left)}</span><span>{evidenceLabel(pair.right)}：{formatBounds(issueLocation(item, "right"), right)}</span></small>}
              </article>
              )).concat(
                <p className="list-note" key="ignored-note">已忽略的问题不参与画布标注、计数和导出。</p>
              )) : issueListState === "restoring" ? (
                <div className="empty-list is-idle" role="status">
                  <strong>正在恢复走查现场</strong>
                  <span>正在解码这条记录里的截图与标注。</span>
                </div>
              ) : issueListState === "empty" ? (
                <div className="empty-list is-idle">
                  <strong>还没有导入素材</strong>
                  <span>双击画布或按 U 导入设计稿与实现截图，按 L 打开走查记录。</span>
                  <span className="empty-list-note">这里为空是因为还没有素材，不代表没有问题。</span>
                </div>
              ) : issueListState === "staging" ? (
                <div className="empty-list is-idle">
                  <strong>素材还没配齐</strong>
                  <span>
                    已选 {batchDrafts.designs?.length || 0} 张设计稿、{batchDrafts.implementations?.length || 0} 张实现截图。
                    {batchDrafts.designs?.length ? "" : "还需要设计稿。"}{batchDrafts.implementations?.length ? "" : "还需要实现截图。"}
                    两侧都齐了才会进入配对确认。
                  </span>
                  <span className="empty-list-note">这里为空是因为素材不全，不代表没有问题。</span>
                </div>
              ) : issueListState === "running" ? (
                <div className="empty-list is-idle" role="status">
                  <strong>正在检测这一屏</strong>
                  <span>结果会在完成后直接出现在这里。</span>
                </div>
              ) : issueListState === "failed" ? (
                /* The reason lives in the banner above (and in the 总览 card's 技术详情). What is left
                   to say here is only what this empty list means and what the reviewer can do next. */
                <div className="empty-list is-idle">
                  <strong>这一屏 AI 没检测成功</strong>
                  <span>可以直接用「＋ 新增」手动记录问题，导出照样带上。</span>
                  <span className="empty-list-note">这里为空是因为 AI 没有结果，不代表没有问题。</span>
                </div>
              ) : issueListState === "unchecked" ? (
                <div className="empty-list is-idle">
                  <strong>还没有开始检测</strong>
                  <span>点击画布下方的「开始验收」，或按 R。</span>
                  <span className="empty-list-note">这里为空是因为还没有检测，不代表没有问题。</span>
                </div>
              ) : (issueListState === "clean" ? (
                /* Reached only when this pair was actually checked and came back with nothing. The
                   wording stays the model's finding, not a sign-off: the reviewer still has to look. */
                <div className="empty-list is-clean">
                  <strong>AI 没有发现差异</strong>
                  <span>本屏检测已完成，未发现与设计稿的差异。</span>
                  <span className="empty-list-note">这是 AI 的结论，不等于验收通过，请你再确认一遍。</span>
                </div>
              ) : !filteredIssueEntries.length ? <div className="empty-list">当前筛选下没有问题</div> : filteredIssueEntries.map(({item, index}) => (
              <article key={item.id} data-screen-id={activeScreenId} data-issue-index={index} className={`issue-card ${selectedIssue === index ? "selected" : ""}`} onClick={() => setSelectedIssue(index)}>
                <div className="issue-card-head">
                  {/* The badge shows the same normalized type the filter row counts, so the two can
                      never name the same issue differently. A non-canonical category the model
                      volunteered is kept as a subtitle rather than silently dropped. */}
                  <div className="issue-meta"><span>{item.id}</span><Badge variant={item.severity === "P0" ? "destructive" : item.severity === "P1" ? "warning" : "secondary"}>{item.severity}</Badge><Badge variant="secondary">{normalizedIssueType(item)}</Badge>
                    {item.category && item.category !== normalizedIssueType(item) && <small className="issue-subtype">{item.category}</small>}</div>
                  <div className="issue-card-actions">
                    <Button variant="ghost" size="sm" aria-label={`复制剪贴板 ${item.id}`} onClick={event=>{event.stopPropagation();copyIssueToClipboard(item);}}>复制剪贴板</Button>
                    <Button className="ignore-button" variant="ghost" size="sm" aria-label={`忽略 ${item.id}`} onClick={(event) => {event.stopPropagation(); ignoreIssue(item.id, index);}}>忽略</Button>
                  </div>
                </div>
                <IssueTitleField value={item.title} ariaLabel={`${item.id} 问题标题`} onClick={(event) => event.stopPropagation()} onChange={(value) => updateIssue(item.id, {title: value})} />
                <RegionComparison left={left} right={right} item={item} pair={pair} onEnlarge={setEnlargedIssue} />
                <div className="issue-facts">
                  <label className="issue-edit-field"><b>设计预期</b><IssueTextarea value={item.expected || item.summary} onClick={(event) => event.stopPropagation()} onChange={(event) => updateIssue(item.id, {expected: event.target.value})} /></label>
                  <label className="issue-edit-field"><b>实现现状</b><IssueTextarea value={item.actual || item.delta} onClick={(event) => event.stopPropagation()} onChange={(event) => updateIssue(item.id, {actual: event.target.value})} /></label>
                  <label className="issue-edit-field fix"><b>复刻要求</b><IssueTextarea value={item.recommendation || item.delta} onClick={(event) => event.stopPropagation()} onChange={(event) => updateIssue(item.id, {recommendation: event.target.value})} /></label>
                </div>
                {(issueLocation(item, "left") || issueLocation(item, "right")) && <small className="location"><span>{evidenceLabel(pair.left)}：{formatBounds(issueLocation(item, "left"), left)}</span><span>{evidenceLabel(pair.right)}：{formatBounds(issueLocation(item, "right"), right)}</span></small>}
                {item.manual && <div className="manual-ai-actions" onClick={(event) => event.stopPropagation()}>
                  <small aria-live="polite">{aiIssueMessages[item.id] || "调整两侧框选后，可让 AI 快速判断并填写"}</small>
                  <Button className="manual-ai-fill-button" variant="secondary" size="sm" disabled={Boolean(aiFillingIssueId) || codexStatus !== "connected"} aria-label={`AI 识别并填写 ${item.id}`} onClick={() => fillManualIssueWithAi(item)}>{aiFillingIssueId === item.id && <Icon icon={Loading03Icon} className="animate-spin" />}✨ AI 识别填写</Button>
                </div>}
              </article>
            )))}</>}

          </div>
          <div className="export-bar">
            {/* Under a filter the total alone was misleading: P1 showed two cards while the bar still
                read 共 8 项, so it was unclear whether the export would carry two or eight. The
                filtered count leads, the export total follows, and the two are never conflated. */}
            <div className="export-summary">
              {issueFilter !== "ignored" && (issueTypeFilter !== "all" || issueSeverityFilter !== "all")
                ? (<><strong>当前筛选 {filteredIssueEntries.length} 项</strong><span>本屏共 {confirmedCount} 项，导出全部未忽略问题</span></>)
                : (<><strong>共 {multiSelection?selectedIssueCount:confirmedCount} 项问题</strong><span>已忽略的问题不导出</span></>)}
            </div>
            <Button ref={exportTriggerRef} variant="primary" size="sm" aria-haspopup="menu" aria-expanded={Boolean(exportMenu)} disabled={!hasScreens} onClick={event=>{const r=event.currentTarget.getBoundingClientRect();setExportMenu(exportMenu?null:{right:window.innerWidth-r.right,bottom:window.innerHeight-r.top+8});}}>导出 <span aria-hidden="true">⌃</span></Button>
          </div>
        </aside>
      </div>
      {/* Every status and failure message surfaces here. The dock is controls only — a message inline
          there squeezed the buttons and was easy to miss. */}
      {groupRerun && <section className="group-rerun-popover" role="dialog" aria-label="重新验收当前组" style={{left:groupRerun.left,top:groupRerun.top,transform:groupRerun.above?"translateY(-100%)":"none"}}>
        <strong>重新验收当前组？</strong><p>新结果将替换本组的问题和标注。</p>
        <div><Button variant="ghost" size="sm" onClick={()=>setGroupRerun(null)}>取消</Button><Button variant="primary" size="sm" disabled={isAnalyzing} onClick={()=>{const screen=screens.find(item=>item.id===groupRerun.id);setGroupRerun(null);if(screen&&!isAnalyzing)submitGroupReview(screen);}}>重新验收本组</Button></div>
      </section>}

      {newCanvasGroup && <div className="crop-lightbox" onClick={event=>{if(event.target===event.currentTarget)setNewCanvasGroup(null);}}><section className="intake-modal-panel new-canvas-group-dialog" role="dialog" aria-modal="true" aria-label="添加新组" onPaste={event=>{const file=[...event.clipboardData.items].find(item=>item.type.startsWith("image/"))?.getAsFile();if(file){event.preventDefault();event.stopPropagation();loadCanvasGroupImage(event.target.closest("[data-new-kind]")?.dataset.newKind||newCanvasKind,[file]);}}}>
        <header className="intake-modal-header"><div><strong>添加新组</strong><span>上传设计稿与实现截图，添加到当前画布</span></div><button type="button" aria-label="关闭添加新组" onClick={()=>setNewCanvasGroup(null)}><Icon icon={Cancel01Icon}/></button></header>
        <div className="new-group-zones">{[["design","设计稿"],["implementation","实现图"]].map(([kind,label])=><label key={kind} data-new-kind={kind} tabIndex={0} onFocus={()=>setNewCanvasKind(kind)} onMouseEnter={()=>setNewCanvasKind(kind)} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();loadCanvasGroupImage(kind,event.dataTransfer.files);}}><input type="file" aria-label={`新增${label}`} accept="image/png,image/jpeg,image/webp" onChange={event=>{loadCanvasGroupImage(kind,event.target.files);event.target.value="";}}/>{newCanvasGroup.sources[kind]?<img src={newCanvasGroup.sources[kind].src} alt={label}/>:<Icon icon={PlusSignIcon} size={24}/>}<strong>{label}</strong><small>点击上传、拖入或粘贴</small></label>)}</div>
        {newCanvasGroup.error && <p role="status">{newCanvasGroup.error}</p>}<footer className="new-group-footer"><Button variant="primary" disabled={newCanvasGroup.loading||!newCanvasGroup.sources.design||!newCanvasGroup.sources.implementation} onClick={commitCanvasGroup}>添加到画布</Button></footer>
      </section></div>}
      {selectionRect && createPortal(<div className="canvas-selection-rect" style={selectionRect}/>,document.body)}
      {exportMenu && <>
        <div className="export-menu-dismiss" onClick={()=>setExportMenu(null)}/>
        <div className="export-format-menu" role="menu" aria-label="导出格式" style={exportMenu}>
          {["png","pdf","html","json","md"].map(format=><button key={format} role="menuitem" onClick={()=>{setExportFormat(format);if(format==="png")setExportMode("separate");setExportScope(multiSelection?"selected":screens.length>1?"all":"current");setExportMenu(null);setExportProgress("");setExportOpen(true);}}><div>{({png:"图片（PNG）",pdf:"PDF",html:"HTML",json:"JSON",md:"Markdown"})[format]}<small>{({png:"逐页图片，打包下载",pdf:"便于打印和分享",html:"可浏览、可跳转的问题报告",json:"结构化问题与坐标数据",md:"适合文档交接的文字报告"})[format]}</small></div></button>)}
        </div>
      </>}
      {exportOpen && <div className="crop-lightbox" onClick={event=>{if(event.target===event.currentTarget && !exportBusy)setExportOpen(false);}}>
        <section className="page-export-dialog" role="dialog" aria-modal="true" aria-label={`导出为 ${exportFormat.toUpperCase()}`}>
          <header><strong>导出为 {exportFormat.toUpperCase()}</strong><button type="button" aria-label="关闭导出配置" disabled={exportBusy} onClick={()=>setExportOpen(false)}><Icon icon={Cancel01Icon}/></button></header>
          <div className="export-config-body">
            <div className="export-source-preview" aria-label="导出素材预览">
              {(exportScope==="current"?[activeScreen]:exportScope==="selected"?selectedScreens:screens).map(screen=><div className="export-preview-group" key={screen.id}><strong>{screen.id} · {screen.name}</strong><div>{[pair.left,pair.right].map(side=>screen.sources[side]&&<img key={side} src={screen.sources[side].src} alt={`${screen.name} ${side===pair.left?"设计稿":"实现图"}`}/>)}</div></div>)}
            </div>
            <div className="export-config-options">
              <fieldset disabled={exportBusy}><legend>导出范围</legend>{multiSelection&&<label><input type="radio" name="export-scope" checked={exportScope==="selected"} onChange={()=>setExportScope("selected")}/>选中组（{selectedScreens.length}）</label>}<label><input type="radio" name="export-scope" checked={exportScope==="current"} onChange={()=>setExportScope("current")}/>当前组</label><label><input type="radio" name="export-scope" checked={exportScope==="all"} onChange={()=>setExportScope("all")}/>全部组（{screens.length}）</label></fieldset>
              <fieldset disabled={exportBusy || exportFormat==="png"}><legend>文件组织</legend><label><input type="radio" name="export-mode" checked={exportMode==="merged"} onChange={()=>setExportMode("merged")}/>合并为一份文件</label><label><input type="radio" name="export-mode" checked={exportMode==="separate"} onChange={()=>setExportMode("separate")}/>每组一个文件（ZIP）</label></fieldset>
              <p>{({pdf:"PDF · A4 白底，按页面与问题分页。",html:"HTML · 包含页面目录、问题详情和图片证据。",png:"PNG · 每组概览和每项问题各一张图片，打包为 ZIP。",json:"JSON · 包含问题、坐标和素材尺寸，不嵌入原图。",md:"Markdown · 包含问题描述与坐标，不嵌入原图。"})[exportFormat]}</p>
              <p>导出所选组的全部未忽略问题。未检测、失败和无问题组保留状态说明。</p>
              <div role="status">{exportProgress}</div>
            </div>
          </div>
          <footer><Button variant="secondary" disabled={exportBusy} onClick={()=>setExportOpen(false)}>取消</Button><Button variant="primary" disabled={exportBusy} onClick={exportPageReports}>{exportBusy?"正在导出…":"开始导出"}</Button></footer>
        </section>
      </div>}
      {leavePrompt && (
        <>
          <div className="popconfirm-scrim" onClick={() => setLeavePrompt(null)} />
          <div className="popconfirm" role="dialog" aria-label="开始新一轮走查"
            style={{top: `${leavePrompt.top}px`, left: `${leavePrompt.left}px`}}>
            <strong>开始新一轮走查？</strong>
            <p>当前正在查看走查记录「{restoredRecord?.projectName}」{restoredDirty ? "，且有未保存的修改" : ""}。继续将不保存当前状态。</p>
            <div className="popconfirm-actions">
              <Button variant="ghost" size="sm" onClick={() => setLeavePrompt(null)}>取消</Button>
              <Button variant="primary" size="sm" onClick={confirmLeaveRecord}>开始新一轮</Button>
            </div>
          </div>
        </>
      )}
      {/* Anchored over the 叠加 button in the page-level layer. Inline in the dock it stretched the
          toolbar by a third the moment overlay was selected, and shrank it again on the way out. */}
      {view === "overlay" && showOpacity && (() => {
        const anchor = viewControlsRef.current?.querySelector('[aria-label="叠加"]')?.getBoundingClientRect();
        const centre = anchor ? anchor.left + anchor.width / 2 : window.innerWidth / 2;
        return (
          <div className="opacity-popover" role="group" aria-label="叠加透明度控件" style={{
            left: `${Math.max(124, Math.min(window.innerWidth - 124, centre))}px`,
            bottom: `${anchor ? window.innerHeight - anchor.top + 14 : 80}px`,
          }}>
            <OpacityIcon />
            <input className="opacity-range" type="range" min="0" max="100" step="1" value={opacity} style={{"--opacity": `${opacity}%`}} onInput={(event) => setOpacity(Number(event.currentTarget.value))} onChange={(event) => setOpacity(Number(event.currentTarget.value))} aria-label="拖动调整实现图透明度" aria-valuetext={`${opacity}%`} />
            <span>{opacity}%</span>
          </div>
        );
      })()}
      {/* Rendered at the page level, like the tooltip layer. The canvas column is its own stacking
          context at z-index 1, so a panel anchored inside it slid underneath the issue rail. */}
      {showMinimap && canvasView && (() => {
        const scale = Math.min(190 / canvasView.scrollWidth, 140 / canvasView.scrollHeight);
        const mapWidth = canvasView.scrollWidth * scale, mapHeight = canvasView.scrollHeight * scale;
        const anchor = minimapToggleRef.current?.getBoundingClientRect();
        const centre = anchor ? anchor.left + anchor.width / 2 : window.innerWidth / 2;
        const half = mapWidth / 2 + 6;
        return (
          <div className="canvas-minimap" role="dialog" aria-label="画布缩略图" style={{
            left: `${Math.max(half + 8, Math.min(window.innerWidth - half - 8, centre))}px`,
            bottom: `${anchor ? window.innerHeight - anchor.top + 12 : 80}px`,
          }}>
            <div
              className="canvas-minimap-surface"
              style={{width: `${mapWidth}px`, height: `${mapHeight}px`}}
              role="button"
              tabIndex="0"
              aria-label="点击或拖动定位画布"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture?.(event.pointerId);
                navigateFromMinimap(event, scale);
              }}
              onPointerMove={(event) => { if (event.buttons === 1) navigateFromMinimap(event, scale); }}
              onPointerUp={(event) => event.currentTarget.releasePointerCapture?.(event.pointerId)}
            >
              {canvasView.frames.map((frame) => (
                <div key={frame.key} className="canvas-minimap-frame" style={{
                  left: `${frame.x * scale}px`, top: `${frame.y * scale}px`,
                  width: `${Math.max(2, frame.width * scale)}px`, height: `${Math.max(2, frame.height * scale)}px`,
                }} />
              ))}
              <div className="canvas-minimap-viewport" style={{
                left: `${canvasView.left * scale}px`, top: `${canvasView.top * scale}px`,
                width: `${canvasView.clientWidth * scale}px`, height: `${canvasView.clientHeight * scale}px`,
              }} />
            </div>
          </div>
        );
      })()}
      {rerunPrompt && (
        <>
          <div className="popconfirm-scrim" onClick={() => setRerunPrompt(null)} />
          <div className="popconfirm popconfirm-above" role="dialog" aria-label="重新验收"
            style={{top: `${rerunPrompt.top}px`, left: `${rerunPrompt.left}px`}}>
            <strong>重新进行 AI 验收？</strong>
            <p>当前 {completedIssueTotal} 个问题以及对它们的修改、忽略和标注调整都会被清空，并重新向 AI 请求一次。</p>
            <div className="popconfirm-actions">
              <Button variant="ghost" size="sm" onClick={() => setRerunPrompt(null)}>取消</Button>
              <Button variant="primary" size="sm" onClick={() => { setRerunPrompt(null); runBatch(); }}>重新验收</Button>
            </div>
          </div>
        </>
      )}
      {/* One failure surface. The per-screen error used to render as a second red banner over the
          canvas, so a failed run shouted twice; the retry it owned now rides on the toast, which
          clears itself rather than leaving a control to dismiss. */}
      {(queueAbortMessage || screenFailure || (reviewNote && !batchRunning && !isAnalyzing)) && (
        <div className={`toast ${queueAbortMessage || screenFailure ? "is-error" : ""}`}
          role={queueAbortMessage || screenFailure ? "alert" : "status"} aria-live="polite">
          <span title={queueAbortMessage ? queueAbort.advice : screenFailure ? `${activeFailure.advice}\n\n${activeScreen.error || ""}` : undefined}>
            {queueAbortMessage || screenFailure || reviewNote}
          </span>
          {/* No retry offered here on purpose: an account-level refusal cannot be cleared from this
              screen, and a retry button next to it just invites the one-by-one retrying that the
              queue was stopped to avoid. */}
          {!queueAbortMessage && screenFailure && activeFailure.retryable && (
            <Button variant="secondary" size="sm" data-no-tip disabled={batchRunning}
              onClick={() => retryScreen(activeScreen.id)}>重试本屏</Button>
          )}
          {(queueAbortMessage || screenFailure) && (
            <button type="button" data-no-tip aria-label="关闭失败提示"
              onClick={() => { if (queueAbortMessage) setQueueAbort(null);
                else setDismissedFailures((current) => ({...current, [failureKey]: true})); }}>
              <Icon icon={Cancel01Icon} size={13} />
            </button>
          )}
        </div>
      )}
      {buttonTip && (
        <div className={`global-button-tip ${buttonTip.below ? "below" : ""}`} role="tooltip" style={{left: buttonTip.x, top: buttonTip.y}}>
          <span>{buttonTip.label}</span>
          {buttonTip.shortcut && <kbd className="tip-key">{buttonTip.shortcut}</kbd>}
        </div>
      )}
      {/* Project overview. The strip answers "which screen am I on"; this answers "is this review
          finished, and where is the damage". Coverage comes first because a problem count on its own
          is not a verdict — an unchecked or failed screen reporting zero problems reads as a pass. */}
      {overviewOpen && screens.length > 1 && (
        <div className="overview-layer" role="dialog" aria-modal="true" aria-label="界面总览">
          <div className="overview-panel">
            <header className="overview-head">
              <div className="overview-verdict">
                <strong className={`overview-state ${coverage.verdict}`}>
                  {coverage.verdict === "incomplete" ? "验收未完成"
                    : coverage.verdict === "blocking" ? "存在阻塞问题"
                    : coverage.verdict === "review" ? "待确认"
                    : coverage.verdict === "passed" ? "全部通过" : "尚未开始"}
                </strong>
                <span className="overview-coverage">
                  已检测 <b>{coverage.checked}</b>/{coverage.total} 个界面
                  {coverage.failed > 0 && <em>· 失败 {coverage.failed}</em>}
                  {coverage.pending > 0 && <em>· 未检测 {coverage.pending}</em>}
                  {coverage.blocked > 0 && <em>· 配对阻塞 {coverage.blocked}</em>}
                  {coverage.running > 0 && <em>· 检测中 {coverage.running}</em>}
                  {coverage.issues > 0 && <i>· 共 {coverage.issues} 个问题，其中 {coverage.blockingIssues} 个阻塞</i>}
                </span>
              </div>
              <div className="overview-head-actions">
                {coverage.retryable > 0 && (
                  <Button variant="secondary" size="sm" disabled={batchRunning || codexStatus !== "connected"} onClick={retryUnfinished}>
                    <Icon icon={ArrowReloadHorizontalIcon} size={14} />
                    重试未完成 {coverage.retryable} 屏
                  </Button>
                )}
                <button type="button" className="overview-close" aria-label="关闭总览" onClick={() => setOverviewOpen(false)}>
                  <Icon icon={Cancel01Icon} size={16} />
                </button>
              </div>
            </header>
            <div className="overview-filters" role="tablist" aria-label="按状态筛选界面">
              {[
                {key: "all", label: "全部", count: coverage.total},
                {key: "attention", label: "需处理", count: coverage.failed + coverage.pending + coverage.blocked + coverage.blocking},
                {key: "blocking", label: "有阻塞", count: coverage.blocking + coverage.blocked},
                {key: "failed", label: "失败", count: coverage.failed},

                {key: "pending", label: "未检测", count: coverage.pending},
                {key: "clean", label: "已通过", count: coverage.clean},
              ].filter((tab) => tab.key === "all" || tab.count > 0).map((tab) => (
                <button key={tab.key} type="button" role="tab" aria-selected={overviewFilter === tab.key}
                  className={`overview-filter ${overviewFilter === tab.key ? "active" : ""}`}
                  onClick={() => setOverviewFilter(tab.key)}>
                  {tab.label}<span>{tab.count}</span>
                </button>
              ))}
            </div>
            <div className="overview-grid">
              {screenSummaries
                .filter((item) => overviewFilter === "all" ? true
                  : overviewFilter === "attention" ? item.state === "failed" || item.state === "pending" || item.state === "blocked" || item.state === "blocking"
                  : overviewFilter === "blocking" ? item.state === "blocking" || item.state === "blocked"
                  : item.state === overviewFilter)
                .map((item) => {
                  const preview = item.screen.sources?.implementation || item.screen.sources?.design;
                  const others = screenSummaries.filter((other) => other.id !== item.id && other.screen.sources?.implementation);
                  return (
                    <article key={item.id} className={`overview-card state-${item.state} ${item.id === activeScreenId ? "current" : ""}`}>
                      <button type="button" className="overview-card-open"
                        onClick={() => navigateCanvas(item.id)}>
                        <span className="overview-thumb">
                          {/* `.src` is the data URL; `.image` is the decoded HTMLImageElement the
                              canvas work uses and stringifies to "[object HTMLImageElement]". */}
                          {preview?.src ? <img src={preview.src} alt="" /> : <span className="overview-thumb-empty">缺图</span>}
                        </span>
                        <span className="overview-card-title">
                          <b>{item.id}</b>
                          <span className="overview-card-name" title={item.name}>{item.name}</span>
                        </span>
                        <span className="overview-card-state">
                          {item.state === "running" ? <em className="running">检测中</em>
                            : item.state === "failed" ? <em className="failed">{item.failure.title}</em>
                            : item.state === "blocked" ? <em className="failed">两侧不是同一个界面</em>
                            : item.state === "pending" ? <em className="pending">未检测</em>
                            : item.state === "clean" ? <em className="clean">已通过</em>
                            : (<>
                                {item.counts.P0 > 0 && <em className="p0">P0 {item.counts.P0}</em>}
                                {item.counts.P1 > 0 && <em className="p1">P1 {item.counts.P1}</em>}
                                {item.counts.P2 > 0 && <em className="p2">P2 {item.counts.P2}</em>}
                                {item.ignored.length > 0 && <em className="ignored">已忽略 {item.ignored.length}</em>}
                              </>)}
                        </span>
                        {(item.state === "blocking" || item.state === "blocked") && <span className="overview-block-reason">{item.state === "blocked" ? `配对阻塞：${item.blockers[0]?.title || "两侧无法对应，需更换素材"}` : `存在 ${item.blocking} 项 P0/P1 问题：${item.issues.find(issue=>issue.severity==="P0")?.title || item.issues.find(issue=>issue.severity==="P1")?.title || "需处理后验收"}`}</span>}
                      </button>
                      {/* Failure recovery, on the card. A structural mismatch and a model capacity
                          error both used to read 失败, which sent reviewers to retry a pair that can
                          never pass. Each kind now offers only the step that can actually help. */}
                      {item.state === "failed" && (
                        <div className="overview-recover">
                          <p>{item.failure.advice}</p>
                          <div className="overview-recover-actions">
                            {item.failure.retryable && (
                              <Button variant="secondary" size="sm" disabled={batchRunning || codexStatus !== "connected"}
                                onClick={() => retryScreen(item.id)}>仅重试本屏</Button>
                            )}
                            {item.failure.kind === "pairing" && others.length > 0 && (
                              <label className="overview-swap">
                                <span>换实现图</span>
                                <select value="" onChange={(event) => { if (event.target.value) swapScreenSource("implementation", item.id, event.target.value); }}>
                                  <option value="">与哪个界面交换…</option>
                                  {others.map((other) => (
                                    <option key={other.id} value={other.id}>{other.id} · {other.screen.sources.implementation.name}</option>
                                  ))}
                                </select>
                              </label>
                            )}
                          </div>
                          {item.screen.error && (
                            <details className="overview-detail">
                              <summary>技术详情</summary>
                              <code>{item.screen.error}</code>
                            </details>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
            </div>
          </div>
        </div>
      )}
      {/* Only once BOTH sides are present. Opening on the first selection covered the rail that holds
          the other picker, so the reviewer could neither add screenshots nor confirm (0 pairs) — a
          dead end whose only exit was 取消. The dialog also carries its own pickers so either side can
          be amended without closing it. */}
      {batchDrafts && (batchDrafts.rows || (batchDrafts.designs.length > 0 && batchDrafts.implementations.length > 0)) && !singleObviousPair && (
        <div className="crop-lightbox" role="dialog" aria-modal="true" aria-label="确认界面配对">
          <div className="crop-lightbox-panel pairing-panel">
            {(() => {
              const skipped = batchDrafts.skipped || {};
              const rows = sortPairRows(batchPairs.map((entry) => ({entry, quality: pairQuality(entry), key: pairKeyOf(entry)}))
                .map((row) => ({...row, skipped: Boolean(skipped[row.key])})));
              const ready = rows.filter((row) => !row.skipped && row.quality.state === "ready");
              const needsWork = rows.filter((row) => !row.skipped && row.quality.state !== "ready");
              const skippedRows = rows.filter((row) => row.skipped);
              // Exception-first. The matcher already decided the confident ones; asking the reviewer
              // to scroll 21 rows to find the 2 it was unsure about is work the tool should absorb.
              const visible = pairFilter === "all" ? rows : pairFilter === "ready" ? ready : pairFilter === "ignored" ? skippedRows : needsWork;
              const runnableRows = rows.filter(row => canRunPair(row.entry, row.quality, row.skipped));
              const runnable = runnableRows.length;
              const willSkip = rows.length - runnable;
              const brokenCount = rows.filter((row) => !row.skipped && row.quality.state === "broken").length;
              return (<>
                <header className="pairing-header">
                  <div>
                    <strong>确认界面配对</strong>

                  </div>
                  <button type="button" className="pairing-close" aria-label="关闭配对确认" onClick={() => setDiscardPairs(true)}>
                    <Icon icon={Cancel01Icon} size={18} />
                  </button>
                </header>
                <div className="pairing-toolbar">
                  <div className="pairing-line-tabs" role="tablist" aria-label="配对状态筛选">{[["all","全部",rows.length],["pending","待配对",needsWork.length],["ready","已配对",ready.length],["ignored","已忽略",skippedRows.length]].map(([id,label,count],index)=><button key={id} type="button" role="tab" aria-selected={pairFilter===id} tabIndex={pairFilter===id?0:-1} onClick={()=>{pairTabTouched.current=true;setPairFilter(id);}} onKeyDown={event=>{if(event.key==="ArrowRight"||event.key==="ArrowLeft"){event.preventDefault();const next=(index+(event.key==="ArrowRight"?1:3))%4;pairTabTouched.current=true;setPairFilter(["all","pending","ready","ignored"][next]);event.currentTarget.parentElement.children[next].focus();}}}>{label}<span>{count}</span></button>)}</div>
                  <div className="pairing-add-actions"><Button variant="secondary" size="sm" onClick={addDraftGroup}>＋ 新增一组</Button></div>
                </div>
                {/* Offered before the rows, because it changes what the rows are. Pairing one long
                    design against N screenshots can only ever review one screenful of it. */}
                {stitchCandidate && (
                  <div className={`stitch-offer ${stitchState?.status === "failed" ? "is-failed" : ""}`}>
                    <div className="stitch-offer-copy">
                      <strong>这是一张长图设计稿和 {stitchCandidate.shots.length} 张连续截图</strong>
                      {stitchState?.status === "failed"
                        ? <span>{stitchState.reason}</span>
                        : <span>
                            设计稿高 {stitchCandidate.design.height}px，单张截图只有 {stitchCandidate.shots[0].height}px。
                            直接配对只能核对第一屏，其余 {stitchCandidate.shots.length - 1} 张会被丢下；
                            滚动截图之间重复的部分也会在每一屏上重复报错。
                          </span>}
                    </div>
                    <Button variant="primary" size="sm" disabled={stitchState?.status === "working"} onClick={runStitch}>
                      {stitchState?.status === "working" ? "正在识别重叠…"
                        : stitchState?.status === "failed" ? "重新识别" : "自动去重拼接"}
                    </Button>
                  </div>
                )}
                {stitchState?.status === "done" && (
                  <p className="stitch-result">
                    已按滚动顺序拼接成一张 {stitchState.plan.width}×{stitchState.height}px 的长图，
                    去掉了 {stitchState.plan.duplicate}px 重复内容
                    （接缝重叠 {stitchState.plan.seams.map((seam) => `${seam.overlap}px`).join(" / ")}）。
                  </p>
                )}
                <p className="pairing-scope-note">待配对包含不匹配和待确认；已配对包含自动匹配和人工指定。{skippedRows.length > 0 && `已忽略 ${skippedRows.length} 组，可在已忽略中恢复。`}</p>
                <div className="pairing-list" ref={pairingListRef}>
                  {!visible.length && <div className="pairing-filter-empty">{pairFilter === "ignored" ? "暂无已忽略的配对。" : pairFilter === "ready" ? "暂无已配对的界面，请先处理待配对项。" : "没有待配对项，可切换到已配对查看。"}</div>}
                  {visible.map(({entry, quality, key, skipped: isSkipped}) => {
                    const complete = entry.design && entry.implementation;
                    const confirmed = entry.confirmed || quality.label === "自动确认";
                    return (
                      <div key={key} data-pair-key={key} tabIndex={-1} className={`pairing-row state-${quality.state} ${isSkipped ? "is-skipped" : ""}`}>
                        <div className="pairing-row-head">
                          <span className="pairing-row-number">配对 {rows.findIndex((row) => row.key === key) + 1}</span>
                          <span className="pairing-row-actions">
                            {complete && !isSkipped && quality.state !== "broken" && (
                              <Button variant={confirmed ? "ghost" : "secondary"} size="sm" onClick={() => setDraftConfirmation(entry,!confirmed)}>{confirmed ? "撤销确认" : "确认配对"}</Button>
                            )}
                            {complete && (
                              <Button variant="ghost" size="sm" onClick={() => setPairPreview(entry)}>对比预览</Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => toggleSkipPair(entry)}>
                              {isSkipped ? "恢复该组" : "忽略该组"}
                            </Button>
                          </span>
                        </div>
                        <div className="pairing-row-body">
                          <figure>
                            {entry.design ? (
                              <PairSourceHover source={entry.design} onUpload={files=>uploadDraftSource(entry,"design",files)} onUnpair={()=>chooseDraftSource(entry,"design",null)}/>
                            ) : (
                              <label className="pairing-missing" tabIndex={0} data-pair-side="design" data-no-tip>
                                <input type="file" accept="image/png,image/jpeg,image/webp"
                                  onChange={(event) => { uploadDraftSource(entry,"design", event.target.files); event.target.value = ""; }} />
                                <span>新增设计稿</span>
                                <small>点击上传 · ⌘/Ctrl + V 粘贴</small>
                              </label>
                            )}
                            <figcaption>
                              {/* The design side is selectable too. Without it a reviewer could see the
                                  right design sitting one row below and had no way to bring it here. */}
                              {batchDrafts.designs.length > 0 ? (
                                <ThumbPicker
                                  label={`为这一组更换设计稿（当前 ${entry.design?.name || "未选择"}）`}
                                  options={batchDrafts.designs}
                                  counterpart={entry.implementation}
                                  value={entry.design?.name || ""}
                                  onChange={(name) => chooseDraftSource(entry,"design",batchDrafts.designs.find(item => item.name === name))}
                                />
                              ) : (<span className="pairing-file">{entry.design?.name || "—"}</span>)}
                              {entry.design && <small>{entry.design.width}×{entry.design.height}</small>}
                            </figcaption>
                          </figure>
                          <div className="pairing-link">
                            <span className="pairing-link-line" aria-hidden="true" />
                            <button type="button" className={`pairing-match ${quality.state}`}
                              aria-label={`匹配说明：${isSkipped ? "此组已忽略，可恢复后继续配对。" : quality.reason || (complete ? "两侧画面结构相近，可进入检测；匹配度不代表验收通过。" : "请在缺失的一侧添加图片后继续配对。")}`}>
                              {complete && <b>{quality.match}%</b>}<span>{isSkipped ? "已忽略" : quality.label}</span>
                            </button>
                            <span className="pairing-link-line" aria-hidden="true" />
                          </div>
                          <figure>
                            {entry.implementation ? (
                              <PairSourceHover source={entry.implementation} onUpload={files=>uploadDraftSource(entry,"implementation",files)} onUnpair={()=>chooseDraftSource(entry,"implementation",null)}/>
                            ) : (
                              <label className="pairing-missing" tabIndex={0} data-pair-side="implementation" data-no-tip>
                                <input type="file" accept="image/png,image/jpeg,image/webp"
                                  onChange={(event) => { uploadDraftSource(entry,"implementation", event.target.files); event.target.value = ""; }} />
                                <span>新增实现图</span>
                                <small>点击上传 · ⌘/Ctrl + V 粘贴</small>
                              </label>
                            )}
                            <figcaption>
                              {batchDrafts.implementations.length > 0 ? (
                                <ThumbPicker
                                  label={`为 ${entry.design?.name || "新配对组"} 选择实现截图`}
                                  options={batchDrafts.implementations}
                                  counterpart={entry.design}
                                  value={entry.implementation?.name || ""}
                                  onChange={(name) => chooseDraftSource(entry,"implementation",batchDrafts.implementations.find(item => item.name === name))}
                                />
                              ) : (<span className="pairing-file">{entry.implementation?.name || "—"}</span>)}
                              {entry.implementation && <small>{entry.implementation.width}×{entry.implementation.height}</small>}
                            </figcaption>

                          </figure>
                        </div>

                      </div>
                    );
                  })}
                </div>
                <footer className="pairing-footer">
                  <div>
                    <Button variant="secondary" size="sm" disabled={!runnable} onClick={()=>{const built=commitBatch();if(built)setReviewNote(`已导入 ${built.length} 组图片，尚未检测`);}}>仅导入图片</Button>
                    <Button variant="primary" size="sm" disabled={!runnable}
                      onClick={() => { const built = commitBatch(); if (built) runBatch(built); }}>开始检测 {runnable} 组</Button>
                  </div>
                </footer>
              </>);
            })()}
          </div>
          {discardPairs && (
            <div className="pairing-discard" role="dialog" aria-modal="true" aria-label="放弃本次配对"
              onClick={(event) => { if (event.target === event.currentTarget) setDiscardPairs(false); }}>
              <div className="popconfirm pairing-discard-box">
                <strong>放弃这次配对？</strong>
                <p>已导入的 {(batchDrafts.designs?.length || 0) + (batchDrafts.implementations?.length || 0)} 张图片会被清空，自动配对结果和你的手动调整都不会保留。</p>
                <div className="popconfirm-actions">
                  <Button variant="secondary" size="sm" autoFocus onClick={() => setDiscardPairs(false)}>继续配对</Button>
                  <Button variant="ghost" size="sm" onClick={() => { setDiscardPairs(false); setBatchDrafts(null); }}>放弃并关闭</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Thumbnails in the pairing list are ~90px tall — far too small to tell two similar screens
          apart, which is exactly the judgement that step asks for. This shows both at full height. */}
      {pairPreview && (
        <div className="crop-lightbox" role="dialog" aria-modal="true" aria-label="配对对比预览" onClick={() => setPairPreview(null)}>
          <div className="crop-lightbox-panel pair-preview" onClick={(event) => event.stopPropagation()}>
            {/* A viewer, nothing more. Confirming used to live here as well, which put the same
                decision in two places and asked the reviewer to commit from inside a dialog they
                opened just to look; the row in the list already owns that action. */}
            <header>
              <div><strong>对比预览</strong></div>
              <Button variant="secondary" size="sm" aria-label="关闭对比预览" onClick={() => setPairPreview(null)}>关闭</Button>
            </header>
            <div className="pair-preview-body">
              <figure>
                <figcaption><span className="evidence-tag is-design">设计稿</span><span>{pairPreview.design?.name}</span></figcaption>
                <img src={pairPreview.design?.src} alt="设计稿全图" draggable="false" onDragStart={(event) => event.preventDefault()} />
                <small>{pairPreview.design?.width}×{pairPreview.design?.height}</small>
              </figure>
              <figure>
                <figcaption><span className="evidence-tag is-implementation">实现图</span><span>{pairPreview.implementation?.name}</span></figcaption>
                <img src={pairPreview.implementation?.src} alt="实现截图全图" draggable="false" onDragStart={(event) => event.preventDefault()} />
                <small>{pairPreview.implementation?.width}×{pairPreview.implementation?.height}</small>
              </figure>
            </div>
          </div>
        </div>
      )}
      {enlargedIssue && left && right && (
        <div className="crop-lightbox" role="dialog" aria-modal="true" aria-label={`${enlargedIssue.id} 证据局部放大`} onClick={() => setEnlargedIssue(null)}>
          <div className="crop-lightbox-panel" onClick={(event) => event.stopPropagation()}>
            <header>
              <div><strong>{enlargedIssue.id}</strong><span>{enlargedIssue.title}</span></div>
              <Button variant="secondary" size="sm" aria-label="关闭放大视图" onClick={() => setEnlargedIssue(null)}>关闭</Button>
            </header>
            <div className="crop-lightbox-pair">
              <figure><figcaption>{pair.label.split(" ↔ ")[0]}</figcaption>
                <ExactRegionCrop source={enlargedIssue._left || left} location={issueLocation(enlargedIssue, "left")} label={`${enlargedIssue.id} 的左侧证据局部放大`} />
              </figure>
              <figure><figcaption>{pair.label.split(" ↔ ")[1]}</figcaption>
                <ExactRegionCrop source={enlargedIssue._right || right} location={issueLocation(enlargedIssue, "right")} label={`${enlargedIssue.id} 的右侧证据局部放大`} />
              </figure>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
