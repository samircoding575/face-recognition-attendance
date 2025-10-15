import React, { useRef, useEffect, useState } from "react";
import Button from "@mui/material/Button";
import { Check, ExitToApp } from "@mui/icons-material";
import axios from "axios";

const CameraFeed = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [status, setStatus] = useState("");
  const [recognizedName, setRecognizedName] = useState(""); // New state for the recognized user

  // 🔹 Start the live camera feed
  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        videoRef.current.srcObject = stream;
      })
      .catch((err) => console.error("Camera access error:", err));
  }, []);

  // 🔹 Capture a still image from the video feed
  const captureImage = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg"); // Returns Base64 encoded image
  };

  // 🔹 Generic function to handle Check In / Check Out
  const handleAction = async (action) => {
    const imageData = captureImage();
    try {
      const response = await axios.post(`http://localhost:5000/${action}`, { image: imageData });
      const name = response.data.name || "Unknown";
      setRecognizedName(name);
      setStatus(`✅ ${action === "checkin" ? "Checked In" : "Checked Out"} Successfully!`);
    } catch (error) {
      console.error(`${action} error:`, error);
      setRecognizedName("");
      setStatus(`❌ Failed to ${action === "checkin" ? "Check In" : "Check Out"}.`);
    }
  };

  return (
    <div style={{ textAlign: "center", marginTop: "20px" }}>
      <h2>Live Camera Feed</h2>
      <video ref={videoRef} autoPlay width="640" height="480" />

      <div style={{ marginTop: "20px" }}>
        <Button
          variant="contained"
          color="success"
          startIcon={<Check />}
          onClick={() => handleAction("checkin")}
          sx={{ marginRight: "10px" }}
        >
          Check In
        </Button>

        <Button
          variant="contained"
          color="error"
          startIcon={<ExitToApp />}
          onClick={() => handleAction("checkout")}
        >
          Check Out
        </Button>
      </div>

      {status && (
        <p style={{ marginTop: "20px", fontSize: "18px", color: recognizedName === "Unknown" ? "red" : "green" }}>
          {status} {recognizedName && recognizedName !== "Unknown" ? `- Hello, ${recognizedName}!` : ""}
        </p>
      )}

      {/* Hidden canvas used to capture frames */}
      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
};

export default CameraFeed;
