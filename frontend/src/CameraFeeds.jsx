import React, { useRef, useEffect, useState } from "react";
import * as faceapi from "face-api.js";
import {
  Box,
  Button,
  Typography,
  Card,
  CardContent,
  Stack,
  Snackbar,
  Alert,
  CircularProgress,
  Fade,
  Tabs,
  Tab,
  Switch,
  FormControlLabel
} from "@mui/material";
import {
  CheckCircle,
  ExitToApp,
  VideocamOff,
  Error,
  CenterFocusWeak,
  TouchApp,
  FreeBreakfast,
  MotionPhotosAuto,
  Commute,
  Info,
  WifiOff
} from "@mui/icons-material";
import axios from "axios";

faceapi.tf.setBackend("webgl");

const QUOTES = {
  neutral: ["Scanning for personality...", "Have you tried turning it off and on again?", "Resting face detected."],
  happy: ["Access Granted! Looking sharp.", "That smile could power the server.", "Keep shining!"],
  sad: ["Error 404: Happiness not found.", "Cheer up!", "Sending virtual hug..."],
  angry: ["Who hurt you?", "Deep breaths.", "Calm down, it's just a clock."],
  surprised: ["Whoa! Easy there.", "Surprise! You're on camera."],
  disgusted: ["Not impressed?", "I judge code, not faces."]
};

const lerp = (a, b, f) => a + (b - a) * f;

const CameraFeed = () => {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const autoCheckLock = useRef(false);

  const trackingData = useRef({
    x: 0, y: 0, w: 0, h: 0,
    targetX: 0, targetY: 0, targetW: 0, targetH: 0,
    alpha: 0,
    isDetected: false,
    lastUpdate: Date.now(),
    smileScore: 0,
    targetSmile: 0,
    dominantEmotion: "neutral",
    currentQuote: "",
    lastQuoteUpdate: 0,
    isRecognizing: false,
    label: ""
  });

  const [status, setStatus] = useState(null);
  const [cameraOn, setCameraOn] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [openSnackbar, setOpenSnackbar] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [tabValue, setTabValue] = useState(0);
  const [autoMode, setAutoMode] = useState(false);

  useEffect(() => {
    const loadModels = async () => {
      try {
        const URL = "/models";
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(URL),
          faceapi.nets.faceExpressionNet.loadFromUri(URL)
        ]);
        setModelsLoaded(true);
      } catch (err) { console.error("Model load failed:", err); }
    };
    loadModels();
  }, []);

  useEffect(() => {
    if (cameraOn) {
      navigator.mediaDevices
        .getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } })
        .then((stream) => { if (videoRef.current) videoRef.current.srcObject = stream; })
        .catch((err) => console.error("Camera error:", err));
    } else {
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }
      trackingData.current.isDetected = false;
      trackingData.current.alpha = 0;
    }
  }, [cameraOn]);

  useEffect(() => {
    if (!cameraOn || !modelsLoaded) return;
    let active = true;
    const vid = videoRef.current;

    const loop = async () => {
      if (!active || !vid || vid.paused || vid.ended || !cameraOn) return;
      if (vid.readyState === 4) {
        try {
          const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
          const det = await faceapi.detectSingleFace(vid, opts).withFaceLandmarks().withFaceExpressions();
          const trk = trackingData.current;

          if (det) {
            const dims = faceapi.matchDimensions(overlayRef.current, vid, true);
            const resized = faceapi.resizeResults(det, dims);
            const { x, y, width, height } = resized.detection.box;

            const shrinkW = 0.85; 
            const shrinkH = 0.95; 
            const newW = width * shrinkW;
            const newH = height * shrinkH;
            const newX = x + (width - newW) / 2;
            const newY = y - (height * 0.12);

            trk.targetX = newX; trk.targetY = newY; trk.targetW = newW; trk.targetH = newH;
            trk.isDetected = true;
            trk.lastUpdate = Date.now();

            const expr = det.expressions;
            const sorted = Object.entries(expr).sort((a, b) => b[1] - a[1]);
            trk.dominantEmotion = sorted[0][0];
            trk.targetSmile = expr.happy;

            if (Date.now() - trk.lastQuoteUpdate > 3000) {
              const list = QUOTES[trk.dominantEmotion] || QUOTES.neutral;
              trk.currentQuote = list[Math.floor(Math.random() * list.length)];
              trk.lastQuoteUpdate = Date.now();
            }

            if (autoMode && !autoCheckLock.current && expr.happy > 0.96) {
              autoCheckLock.current = true;
              trk.isRecognizing = true; 
              const snap = captureImage();
              performAction("auto", snap, true);
            }
          } else if (Date.now() - trk.lastUpdate > 500) {
            trk.isDetected = false;
            trk.label = ""; 
          }
        } catch (err) { console.error(err); }
      }
      if (active) requestAnimationFrame(loop);
    };
    loop();
    return () => (active = false);
  }, [cameraOn, modelsLoaded, autoMode]);

  useEffect(() => {
    let id;
    const cnv = overlayRef.current;
    const ctx = cnv?.getContext("2d");
    const render = () => {
      if (!ctx) { id = requestAnimationFrame(render); return; }
      ctx.clearRect(0, 0, cnv.width, cnv.height);
      if (!cameraOn) { id = requestAnimationFrame(render); return; }
      const t = trackingData.current;
      if (t.isDetected) {
        t.x = lerp(t.x, t.targetX, 0.2); t.y = lerp(t.y, t.targetY, 0.2);
        t.w = lerp(t.w, t.targetW, 0.2); t.h = lerp(t.h, t.targetH, 0.2);
        t.smileScore = lerp(t.smileScore, t.targetSmile, 0.1);
        t.alpha = lerp(t.alpha, 1, 0.15);
      } else { t.alpha = lerp(t.alpha, 0, 0.15); }
      if (t.alpha > 0.05) drawHUD(ctx, t);
      id = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(id);
  }, [cameraOn]);

  const captureImage = () => {
    const v = videoRef.current;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    return c.toDataURL("image/jpeg", 0.9);
  };

  const drawHUD = (ctx, t) => {
    const { x, y, w, h, dominantEmotion, currentQuote, smileScore, alpha, isRecognizing, label } = t;
    const col = dominantEmotion === "happy" ? "#00E676" : dominantEmotion === "angry" ? "#FF1744" : "#00E5FF";

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1;
    ctx.globalAlpha = alpha * 0.2;
    ctx.strokeRect(x, y, w, h);

    ctx.globalAlpha = alpha;
    ctx.lineWidth = 4;
    const cS = 25;
    ctx.beginPath(); ctx.moveTo(x + cS, y); ctx.lineTo(x, y); ctx.lineTo(x, y + cS); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w - cS, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + cS); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + h - cS); ctx.lineTo(x, y + h); ctx.lineTo(x + cS, y + h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w - cS, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - cS); ctx.stroke();

    ctx.font = "bold 14px 'Roboto Mono'";
    ctx.fillStyle = col;

    let headerText = dominantEmotion.toUpperCase();
    if (isRecognizing) headerText = "RECOGNIZING...";
    if (label) headerText = label.toUpperCase();
    
    ctx.fillText(headerText, x, y - 10);

    if (currentQuote) {
      ctx.font = "14px 'Inter'";
      ctx.fillStyle = "white";
      ctx.fillText(currentQuote, x, y + h + 25);
    }

    if (autoMode && !autoCheckLock.current) {
      const bW = w * 0.8, bH = 6, bX = x + (w - bW) / 2, bY = y + h + 45;
      ctx.fillStyle = "rgba(255,255,255,0.1)"; ctx.fillRect(bX, bY, bW, bH);
      ctx.fillStyle = col; ctx.fillRect(bX, bY, bW * smileScore, bH);
    }
    ctx.restore();
  };

  const handleResponse = (data) => {
    const trk = trackingData.current;
    trk.isRecognizing = false;
    
    if (data.status === "synced" || data.status === "offline") {
      const actionTxt = data.action === "checkin" ? "CHECKED IN" : "CHECKED OUT";
      trk.label = `${data.name} • ${actionTxt}`;
      setStatus({ text: `${data.message} (${data.name})`, severity: "success", icon: <CheckCircle /> });
    } else {
      trk.label = "UNKNOWN USER";
      setStatus({ text: data.message || "Error", severity: "error" });
    }
    setOpenSnackbar(true);
  };

  const performAction = async (action, img, isAuto = false) => {
    if (!videoRef.current) return;
    if (!isAuto) setProcessing(true);
    try {
      const res = await axios.post(`http://localhost:5000/${action}`, { image: img || captureImage() });
      handleResponse(res.data);
    } catch { setStatus({ text: "Connection Failed", severity: "error" }); setOpenSnackbar(true); }
    finally {
      setProcessing(false);
      if (isAuto) setTimeout(() => { autoCheckLock.current = false; trackingData.current.label = ""; }, 5000);
    }
  };

  return (
    <Card elevation={10} sx={{ borderRadius: 4, overflow: "hidden", bgcolor: "#121212", color: "white", border: "1px solid #333" }}>
      <Box sx={{ p: 2, display: "flex", justifyContent: "space-between", background: "#1e1e1e", borderBottom: "1px solid #333" }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <CenterFocusWeak sx={{ color: "#00E5FF" }} />
          <Box><Typography variant="subtitle1" fontWeight={800}>AI TERMINAL</Typography><Typography variant="caption" sx={{ color: "grey.500" }}>v2.1 • ONLINE</Typography></Box>
        </Stack>
        <Button variant="outlined" onClick={() => setCameraOn(!cameraOn)} color="inherit">{cameraOn ? "Power Off" : "Power On"}</Button>
      </Box>

      {/* FIX: Changed minHeight to height to force correct video aspect ratio calculation */}
      <CardContent sx={{ p: 0, bgcolor: "#000", position: "relative", height: 450, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Fade in={processing}>
          <Box sx={{ position: "absolute", inset: 0, bgcolor: "rgba(0,0,0,0.8)", zIndex: 10, display: "flex", justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
            <CircularProgress sx={{ color: "#00E5FF" }} /><Typography sx={{ mt: 2, color: "#00E5FF" }}>UPLOADING...</Typography>
          </Box>
        </Fade>
        <video 
          ref={videoRef} autoPlay muted playsInline 
          onLoadedMetadata={() => videoRef.current && overlayRef.current && faceapi.matchDimensions(overlayRef.current, videoRef.current)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: cameraOn ? "block" : "none" }} 
        />
        <canvas ref={overlayRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: 'none' }} />
        {!cameraOn && <Box sx={{ p: 10, textAlign: "center", color: "#555" }}><VideocamOff fontSize="large" /><Typography>TERMINAL STANDBY</Typography></Box>}
      </CardContent>

      <Box sx={{ bgcolor: "#1e1e1e" }}>
        <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} centered sx={{ "& .MuiTabs-indicator": { bgcolor: "#00E5FF" } }}>
          <Tab label="Manual" icon={<TouchApp />} iconPosition="start" />
          <Tab label="Break" icon={<FreeBreakfast />} iconPosition="start" />
          <Tab label="Gate" icon={<MotionPhotosAuto />} iconPosition="start" />
        </Tabs>

        {tabValue === 0 && (
          <Stack spacing={2} sx={{ p: 3 }}>
            <Stack direction="row" spacing={2}>
              <Button fullWidth variant="contained" color="success" onClick={() => performAction("checkin")}>Check In</Button>
              <Button fullWidth variant="contained" color="error" onClick={() => performAction("checkout")}>Check Out</Button>
            </Stack>
            <Button fullWidth variant="outlined" color="primary" onClick={() => performAction("switch_remote")} sx={{ borderStyle: "dashed", borderWidth: 2 }}>Leaving Office (Remote)</Button>
          </Stack>
        )}

        {tabValue === 1 && (
          <Stack direction="row" spacing={2} sx={{ p: 3 }}>
            <Button fullWidth variant="contained" color="warning" onClick={() => performAction("breakin")}>Start Break</Button>
            <Button fullWidth variant="contained" color="info" onClick={() => performAction("breakout")}>End Break</Button>
          </Stack>
        )}

        {tabValue === 2 && (
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 3 }}>
            <Box><Typography variant="body1" sx={{ color: "#00E5FF" }}>Smart Gate</Typography><Typography variant="caption" sx={{ color: "grey.500" }}>Auto-check on smile.</Typography></Box>
            <FormControlLabel control={<Switch checked={autoMode} onChange={(e) => setAutoMode(e.target.checked)} />} label={autoMode ? "ON" : "OFF"} />
          </Stack>
        )}
      </Box>

      <Snackbar open={openSnackbar} autoHideDuration={4000} onClose={() => setOpenSnackbar(false)} anchorOrigin={{ vertical: "top", horizontal: "center" }}>
        {status && <Alert severity={status.severity} variant="filled">{status.text}</Alert>}
      </Snackbar>
    </Card>
  );
};

export default CameraFeed;