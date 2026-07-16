import { getSupabaseClient } from "../config/supabase.js";

const MIN_FACE_CONFIDENCE = 0.90;
const DEVICE_KEY = "ems_terms_device_id_v1";
const client = getSupabaseClient();
const token = new URLSearchParams(location.search).get("handoff") || "";
const el = (id) => document.getElementById(id);
const statusEl = el("status");
const camera = el("camera");
const preview = el("preview");
const startButton = el("startCamera");
const captureButton = el("capture");
const recaptureButton = el("recapture");
const completeButton = el("complete");
const termsAccepted = el("termsAccepted");
const photoConsent = el("photoConsent");
let detector;
let stream;
let evidenceDataUrl = "";
let confidence = 0;

function deviceId() {
  let value = localStorage.getItem(DEVICE_KEY);
  if (/^ems-device-v1:[0-9a-f-]{36}$/i.test(value || "")) return value;
  value = `ems-device-v1:${crypto.randomUUID()}`;
  localStorage.setItem(DEVICE_KEY, value);
  return value;
}

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
}

function updateComplete() {
  completeButton.disabled = !(evidenceDataUrl && confidence >= MIN_FACE_CONFIDENCE && termsAccepted.checked && photoConsent.checked);
}

async function loadDetector() {
  if (detector) return detector;
  const visionTasks = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs");
  const vision = await visionTasks.FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm");
  detector = await visionTasks.FaceDetector.createFromOptions(vision, {
    baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite" },
    runningMode: "IMAGE",
    minDetectionConfidence: MIN_FACE_CONFIDENCE,
    minSuppressionThreshold: 0.3
  });
  return detector;
}

async function validateLink() {
  if (!/^[0-9a-f]{64}$/i.test(token)) throw new Error("This mobile capture link is invalid.");
  const { data, error } = await client.rpc("get_terms_mobile_handoff", { p_handoff_token: token });
  if (error) throw error;
  if (data?.status !== "pending") throw new Error(data?.status === "completed" ? "This acceptance has already been completed." : "This mobile capture link has expired or is no longer available.");
  const expiry = data?.expires_at ? new Date(data.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "soon";
  el("termsSummary").textContent = `${data?.terms_title || "Current Terms and Conditions"} · Version ${data?.terms_version || "current"}. This secure handoff expires at ${expiry}.`;
  startButton.disabled = false;
  setStatus("Enable the front camera and follow the three capture steps.");
}

async function startCamera() {
  startButton.disabled = true;
  setStatus("Loading face detection and requesting front-camera permission…");
  try {
    [stream] = await Promise.all([
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } }, audio: false }),
      loadDetector()
    ]);
    camera.srcObject = stream;
    await camera.play();
    camera.style.display = "block";
    preview.style.display = "none";
    captureButton.disabled = false;
    setStatus("Camera ready. Keep one face centered, look straight ahead, and capture in good light.", "ok");
  } catch (error) {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    startButton.disabled = false;
    setStatus(`The camera could not start: ${error?.message || "check browser camera permission"}.`, "bad");
  }
}

function resetCapture() {
  evidenceDataUrl = "";
  confidence = 0;
  el("meterBar").style.width = "0%";
  el("confidenceValue").textContent = "Not captured";
  recaptureButton.hidden = true;
  updateComplete();
  startCamera();
}

function captureFace() {
  if (!camera.videoWidth || !camera.videoHeight || !detector) return;
  const width = Math.min(720, camera.videoWidth);
  const height = Math.round(width * camera.videoHeight / camera.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d", { alpha: false }).drawImage(camera, 0, 0, width, height);
  const detections = detector.detect(canvas)?.detections || [];
  if (detections.length !== 1) {
    setStatus(detections.length > 1 ? "More than one face was detected. Only the accepting person may be visible." : "No clear face was detected. Improve the light, face the camera, and try again.", "bad");
    return;
  }
  const detection = detections[0];
  confidence = Number(detection.categories?.[0]?.score || 0);
  const box = detection.boundingBox || {};
  const faceRatio = (Number(box.width || 0) * Number(box.height || 0)) / (width * height);
  const percentage = Math.round(confidence * 100);
  el("meterBar").style.width = `${Math.min(100, percentage)}%`;
  el("confidenceValue").textContent = `${percentage}%`;
  if (confidence < MIN_FACE_CONFIDENCE || faceRatio < 0.08) {
    evidenceDataUrl = "";
    updateComplete();
    setStatus(`Capture rejected at ${percentage}%. Move closer, improve the lighting, and recapture above 90%.`, "bad");
    return;
  }
  evidenceDataUrl = canvas.toDataURL("image/jpeg", 0.86);
  preview.src = evidenceDataUrl;
  preview.style.display = "block";
  camera.style.display = "none";
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  captureButton.disabled = true;
  recaptureButton.hidden = false;
  setStatus(`Clear single face confirmed at ${percentage}% confidence. Review the image and confirm both declarations.`, "ok");
  updateComplete();
}

async function completeAcceptance() {
  if (completeButton.disabled) return;
  completeButton.disabled = true;
  setStatus("Securing your acceptance evidence…");
  const match = evidenceDataUrl.match(/^data:(image\/jpeg);base64,(.+)$/);
  try {
    const { data, error } = await client.rpc("complete_terms_mobile_handoff", {
      p_handoff_token: token,
      p_evidence_mime_type: match?.[1] || null,
      p_evidence_base64: match?.[2] || null,
      p_photo_consent: photoConsent.checked,
      p_terms_accepted: termsAccepted.checked,
      p_face_detected: true,
      p_face_confidence: confidence,
      p_device_id: deviceId(),
      p_user_agent: navigator.userAgent || null
    });
    if (error) throw error;
    if (!data?.completed) throw new Error("Acceptance was not completed.");
    el("captureCard").innerHTML = `<div class="eyebrow">ACCEPTANCE SECURED</div><h1>Verification complete</h1><p class="muted">Your live-camera evidence, server-recorded IP address, and EMS mobile device ID were recorded. Return to the computer; it will continue automatically.</p><div class="status ok">This one-time link is now closed and cannot be reused.</div>`;
  } catch (error) {
    setStatus(error?.message || "Acceptance could not be completed. Generate a new QR code and try again.", "bad");
    updateComplete();
  }
}

startButton.addEventListener("click", startCamera);
captureButton.addEventListener("click", captureFace);
recaptureButton.addEventListener("click", resetCapture);
termsAccepted.addEventListener("change", updateComplete);
photoConsent.addEventListener("change", updateComplete);
completeButton.addEventListener("click", completeAcceptance);
addEventListener("pagehide", () => stream?.getTracks().forEach((track) => track.stop()));

validateLink().catch((error) => {
  startButton.disabled = true;
  captureButton.disabled = true;
  completeButton.disabled = true;
  setStatus(error?.message || "This mobile capture link is unavailable.", "bad");
});
