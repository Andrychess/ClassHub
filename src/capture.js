const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const TARGET_WIDTH = 960;
const TARGET_HEIGHT = 540;
const FRAME_INTERVAL_MS = 250;
const JPEG_QUALITY = 0.55;

let captureTimer = null;
let mediaStream = null;

function stopCapture() {
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

async function sendFrame() {
  if (!video.videoWidth) {
    return;
  }

  const scale = Math.min(TARGET_WIDTH / video.videoWidth, TARGET_HEIGHT / video.videoHeight);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
  });

  if (!blob) {
    return;
  }

  const buffer = await blob.arrayBuffer();
  window.captureApi.sendFrame(buffer);
}

async function startLegacyCapture(sourceId) {
  const modernConstraints = {
    audio: false,
    video: {
      chromeMediaSource: "desktop",
      chromeMediaSourceId: sourceId,
      maxWidth: 1920,
      maxHeight: 1080,
      maxFrameRate: 10,
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
          maxWidth: 1920,
          maxHeight: 1080,
          maxFrameRate: 10,
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
          frameRate: { ideal: 5, max: 10 },
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
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
    captureTimer = setInterval(() => {
      sendFrame().catch(() => {});
    }, FRAME_INTERVAL_MS);
    window.captureApi.notifyReady();
  } catch (error) {
    stopCapture();
    window.captureApi.notifyError(error.message || "Не удалось захватить экран");
  }
}

window.addEventListener("beforeunload", stopCapture);
startCapture();
