"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, ImagePlus, ScanLine, StopCircle, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type BarcodeDetectorLike = { detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string }>> };
type BarcodeDetectorConstructor = new (options?: { formats: string[] }) => BarcodeDetectorLike;
type BarcodeWindow = Window & { BarcodeDetector?: BarcodeDetectorConstructor };
type ScannedPayload = { jobCode?: string; qrToken?: string };

function readPayload(value: string): ScannedPayload {
  try {
    const parsed = JSON.parse(value) as { jobCode?: unknown; qrToken?: unknown };
    if (typeof parsed.jobCode === "string" && typeof parsed.qrToken === "string") return { jobCode: parsed.jobCode, qrToken: parsed.qrToken };
  } catch {
    // Older QR codes contain only the token; the owner can enter the job code below.
  }
  return { qrToken: value };
}

export default function Scanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [jobCode, setJobCode] = useState("");
  const [qrToken, setQrToken] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "gcash">("cash");
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const detectorAvailable = typeof window !== "undefined" && "BarcodeDetector" in window;

  useEffect(() => () => stopCamera(), []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }

  async function loadCameras() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access is not available in this browser.");
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((track) => track.stop());
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput");
    setCameras(devices);
    if (!cameraId && devices[0]) setCameraId(devices[0].deviceId);
  }

  async function scanCamera() {
    setError("");
    setMessage("");
    if (!detectorAvailable) {
      setError("Live QR scanning is not supported by this browser. Use an external camera to capture a QR image, or enter the token manually.");
      return;
    }
    try {
      if (!cameras.length) await loadCameras();
      const stream = await navigator.mediaDevices.getUserMedia({ video: cameraId ? { deviceId: { exact: cameraId } } : { facingMode: "environment" } });
      streamRef.current = stream;
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setScanning(true);
      const detector = new (window as BarcodeWindow).BarcodeDetector!({ formats: ["qr_code"] });
      const read = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const results = await detector.detect(videoRef.current);
          if (results[0]?.rawValue) {
            const payload = readPayload(results[0].rawValue);
            if (payload.jobCode) setJobCode(payload.jobCode);
            if (payload.qrToken) setQrToken(payload.qrToken);
            stopCamera();
            setMessage("QR code captured. Select the payment method and confirm payment.");
            return;
          }
        } catch {
          // Keep the camera running while a frame is not ready to decode.
        }
        window.requestAnimationFrame(() => void read());
      };
      void read();
    } catch (cameraError) {
      stopCamera();
      setError(cameraError instanceof Error ? cameraError.message : "Could not open the selected camera.");
    }
  }

  async function scanImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    if (!detectorAvailable) {
      setError("This browser cannot decode QR images. Use live camera scanning or enter the token manually.");
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const detector = new (window as BarcodeWindow).BarcodeDetector!({ formats: ["qr_code"] });
      const results = await detector.detect(bitmap);
      bitmap.close();
      if (!results[0]?.rawValue) throw new Error("No QR code was found in that image.");
      const payload = readPayload(results[0].rawValue);
      if (payload.jobCode) setJobCode(payload.jobCode);
      if (payload.qrToken) setQrToken(payload.qrToken);
      setMessage("QR image captured. Select the payment method and confirm payment.");
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Could not read that QR image.");
    }
  }

  async function confirmPayment() {
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/owner/payments/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobCode, qrToken, paymentMethod }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not confirm payment.");
      setMessage(`Payment confirmed for ${body.jobCode}. The order is now in the paid queue.`);
      setJobCode("");
      setQrToken("");
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : "Could not confirm payment.");
    }
  }

  return <section className="scanner-panel">
    <Card className="scanner-card">
      <CardHeader className="scanner-card-header"><div><CardTitle className="scanner-card-title"><ScanLine /> Scan a customer QR</CardTitle><CardDescription>Use the built-in camera or upload a QR image from an external camera.</CardDescription></div><Badge variant={scanning ? "default" : "secondary"} className="scanner-status-badge">{scanning ? <><span className="scanner-live-dot" /> Camera active</> : "Ready to scan"}</Badge></CardHeader>
      <CardContent className="scanner-controls">
      <div className="scanner-video-wrap"><video ref={videoRef} muted playsInline aria-label="QR scanner camera preview" /><div className="scanner-frame" />{!scanning && <span className="scanner-placeholder">Camera preview</span>}</div>
      <div className="scanner-actions">
        <p>Use this device camera or choose an external USB camera connected to this computer.</p>
        {!detectorAvailable && <p className="scanner-warning">Live decoding requires a supported browser such as Chrome or Edge.</p>}
        <label className="scanner-field">Camera<select value={cameraId} onChange={(event) => setCameraId(event.target.value)} onFocus={() => { if (!cameras.length) void loadCameras().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not list cameras.")); }}><option value="">Default camera</option>{cameras.map((camera, index) => <option key={camera.deviceId} value={camera.deviceId}>{camera.label || `Camera ${index + 1}`}</option>)}</select></label>
        <div className="scanner-button-row">{scanning ? <Button type="button" variant="outline" onClick={stopCamera}><StopCircle /> Stop camera</Button> : <Button type="button" onClick={() => void scanCamera()}><Camera /> Open camera</Button>}<label className="scanner-upload-button"><ImagePlus /> Upload QR image<input type="file" accept="image/*" onChange={(event) => void scanImage(event)} /></label></div>
      </div>
      </CardContent>
    </Card>
    <Card className="scanner-card scanner-confirm">
      <CardHeader className="scanner-card-header"><div><CardTitle className="scanner-card-title"><WalletCards /> Confirm payment</CardTitle><CardDescription>Confirm the payment method after scanning. Older QR codes may require the job code below.</CardDescription></div></CardHeader>
      <CardContent>
      <div className="scanner-fields"><label className="scanner-field">Job code<input value={jobCode} onChange={(event) => setJobCode(event.target.value)} placeholder="QP-..." /></label><label className="scanner-field">QR token<input value={qrToken} onChange={(event) => setQrToken(event.target.value)} placeholder="Scanned token" /></label><label className="scanner-field">Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as "cash" | "gcash")}><option value="cash">Cash</option><option value="gcash">GCash</option></select></label></div>
      {error && <p className="scanner-error" role="alert">{error}</p>}{message && <p className="scanner-success" role="status">{message}</p>}
      <Separator className="scanner-separator" />
      <Button type="button" disabled={!jobCode.trim() || !qrToken.trim()} onClick={() => void confirmPayment()}><CheckCircle2 /> Confirm payment and queue order</Button>
      </CardContent>
    </Card>
  </section>;
}
