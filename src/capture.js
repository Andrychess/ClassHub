const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const TARGET_WIDTH = 1280;
const TARGET_HEIGHT = 720;
const TARGET_FPS = 15;
const MIN_FRAME_INTERVAL_MS = Math.round(1000 / TARGET_FPS);
const JPEG_QUALITY = 0.62;

let captureTimer = null;
let mediaStream = null;
let frameLoopActive = false;
let sendingFrame = false;
let lastFrameSentAt = 0;
let canvasWidth = 0;
let canvasHeight = 0;

function stopCapture() {
  frameLoopActive = false;
  if (captureTimer) {
    clearInterval(captureTimer);
    captureTimer = null;
  }
  if (mediaStream) {
    for (const track of mediaStream.getTracks()) {
      track.stop();
    }
    mediaStream = null;
  }
}

function resizeCanvasIfNeeded() {
  if (!video.videoWidth || !video.videoHeight) {
    return false;
  }

  const scale = Math.min(TARGET_WIDTH / video.videoWidth, TARGET_HEIGHT / video.videoHeight, 1);
  const nextWidth = Math.max(1, Math.round(video.videoWidth * scale));
  const nextHeight = Math.max(1, Math.round(video.videoHeight * scale));

  if (nextWidth === canvasWidth && nextHeight === canvasHeight) {
    return true;
  }

  canvasWidth = nextWidth;
  canvasHeight = nextHeight;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  return true;
}

async function sendFrame(force = false) {
  if (sendingFrame || !video.videoWidth) {
    return;
  }

  const now = performance.now();
  if (!force && now - lastFrameSentAt < MIN_FRAME_INTERVAL_MS) {
    return;
  }

  if (!resizeCanvasIfNeeded()) {
    return;
  }

  sendingFrame = true;
  try {
    ctx.drawImage(video, 0, 0, canvasWidth, canvasHeight);

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
    });

    if (!blob) {
      return;
    }

    const buffer = await blob.arrayBuffer();
    window.captureApi.sendFrame(buffer);
    lastFrameSentAt = now;
  } finally {
    sendingFrame = false;
  }
}

function scheduleNextFrame() {
  if (!frameLoopActive || !mediaStream) {
    return;
  }

  if (typeof video.requestVideoFrameCallback === "function") {
    video.requestVideoFrameCallback(() => {
      sendFrame().finally(scheduleNextFrame);
    });
    return;
  }

  captureTimer = setInterval(() => {
    sendFrame().catch(() => {});
  }, MIN_FRAME_INTERVAL_MS);
}

async function startLegacyCapture(sourceId) {
  const modernConstraints = {
    audio: false,
    video: {
      chromeMediaSource: "desktop",
      chromeMediaSourceId: sourceId,
      maxWidth: TARGET_WIDTH,
      maxHeight: TARGET_HEIGHT,
      maxFrameRate: TARGET_FPS,
    },
  };

  try {
    return await navigator.mediaDevices.getUserMedia(modernConstraints);
  } catch {
    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: sourceId,
          maxWidth: TARGET_WIDTH,
          maxHeight: TARGET_HEIGHT,
          maxFrameRate: TARGET_FPS,
        },
      },
    });
  }
}

async function startCapture() {
  try {
    if (navigator.mediaDevices.getDisplayMedia) {
      mediaStream = await navigator.mediaDevices.getDisplayMedia({
        audio: false,
        video: {
          frameRate: { ideal: TARGET_FPS, max: TARGET_FPS + 5 },
          width: { ideal: TARGET_WIDTH, max: TARGET_WIDTH },
          height: { ideal: TARGET_HEIGHT, max: TARGET_HEIGHT },
        },
      });
    } else {
      const sourceId = await window.captureApi.getSourceId();
      if (!sourceId) {
        throw new Error("Экран для захвата не найден");
      }
      mediaStream = await startLegacyCapture(sourceId);
    }

    video.srcObject = mediaStream;
    await video.play();

    frameLoopActive = true;
    await sendFrame(true);
    scheduleNextFrame();
    window.captureApi.notifyReady();
  } catch (error) {
    stopCapture();
    window.captureApi.notifyError(error.message || "Не удалось захватить экран");
  }
}

window.addEventListener("beforeunload", stopCapture);
startCapture();
