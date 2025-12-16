/* -------------- FULL FILE REWRITTEN WITH FIXED-WIDTH TABLE -------------- */

import React, { useState, useRef, useEffect } from "react";
import {
  Box, Paper, Typography, TextField, Button, Grid,
  Stack, Avatar, IconButton, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow,
  Alert, LinearProgress, Chip, Drawer, MenuItem,
  Select, FormControl, InputLabel, Tooltip, Checkbox, Switch,
  useMediaQuery, useTheme
} from "@mui/material";

import {
  CameraAlt, Delete, Save, PersonAdd, Settings,
  Close, Business, AccessTime, HomeWork,
  Face, TurnRight, TurnLeft, SentimentSatisfiedAlt, ArrowUpward
} from "@mui/icons-material";
import axios from "axios";

const API_URL = "http://localhost:5000";

const DEPARTMENTS = ["Engineering", "Human Resources", "Sales", "Marketing", "Finance", "Operations", "Legal", "Unassigned"];
const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const DEFAULT_DAY_CONFIG = { active: false, start: "09:00", end: "17:00", is_remote: false };

// 6-step face registration system
const CAPTURE_STEPS = [
  { label: "Frontal Neutral", instruction: "Look straight at the camera. Relax your face.", icon: <Face /> },
  { label: "Frontal Smile", instruction: "Look straight and smile naturally!", icon: <SentimentSatisfiedAlt /> },
  { label: "Turn Left", instruction: "Turn your head slightly LEFT.", icon: <TurnLeft /> },
  { label: "Turn Right", instruction: "Turn your head slightly RIGHT.", icon: <TurnRight /> },
  { label: "Chin Up", instruction: "Tilt your chin up slightly.", icon: <ArrowUpward /> },
  { label: "Final Frontal", instruction: "Look straight ahead again.", icon: <Face /> },
];
const REQUIRED_IMAGES = CAPTURE_STEPS.length;

export default function RegistrationPanel() {
  const [name, setName] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [capturedImages, setCapturedImages] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [regDepartment, setRegDepartment] = useState("Unassigned");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState("");

  const [profileData, setProfileData] = useState({
    department: "Unassigned",
    schedule: { job_type: "Full-Time", weekly: {} }
  });

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const currentStepIndex = capturedImages.length;
  const isComplete = currentStepIndex >= REQUIRED_IMAGES;
  const currentStep = isComplete ? null : CAPTURE_STEPS[currentStepIndex];

  useEffect(() => {
    fetchEmployees();
    startCamera();
    return () => stopCamera();
  }, []);

  const fetchEmployees = async () => {
    try {
      const res = await axios.get(`${API_URL}/get_employee`);
      const data = Array.isArray(res.data) ? res.data : (res.data.employees || []);
      setEmployees(data);
    } catch (err) {
      console.error("Failed to load employees", err);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) videoRef.current.srcObject = stream;
      streamRef.current = stream;
    } catch {
      setMessage({ type: "error", text: "Camera access denied." });
    }
  };

  const stopCamera = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
  };

  const captureImage = () => {
    if (capturedImages.length >= REQUIRED_IMAGES) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const image = canvas.toDataURL("image/jpeg");
    setCapturedImages(prev => [...prev, image]);
  };

  const clearImages = () => setCapturedImages([]);

  const handleRegister = async () => {
    if (!name || !ownerId || !isComplete) {
      setMessage({ type: "error", text: `Please complete all ${REQUIRED_IMAGES} photos.` });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      await axios.post(`${API_URL}/register_new_employee`, {
        name,
        ownerId,
        department: regDepartment,
        images: capturedImages
      });

      setMessage({ type: "success", text: "Employee Registered Successfully!" });
      setName("");
      setOwnerId("");
      setRegDepartment("Unassigned");
      setCapturedImages([]);
      fetchEmployees();
    } catch (err) {
      const errMsg = err.response?.data?.message || "Registration Failed";
      setMessage({ type: "error", text: errMsg });
    }

    setLoading(false);
  };

  const handleDelete = async (id, empName) => {
    if (!window.confirm(`Delete ${empName}?`)) return;
    try {
      await axios.post(`${API_URL}/delete_employee`, { id, name: empName });
      fetchEmployees();
    } catch {
      alert("Failed to delete.");
    }
  };

  // ----------------- Scheduler Drawer -----------------

  const handleOpenSettings = async (empName) => {
    setSelectedEmployee(empName);

    try {
      const res = await axios.get(`${API_URL}/schedule?name=${empName}`);

      const fetchedSchedule = res.data.schedule || {};
      const safeWeekly = fetchedSchedule.weekly || {};

      DAYS_OF_WEEK.forEach(day => {
        if (!safeWeekly[day]) {
          safeWeekly[day] = { ...DEFAULT_DAY_CONFIG };
          if (!["Saturday", "Sunday"].includes(day)) safeWeekly[day].active = true;
        }
      });

      setProfileData({
        department: res.data.department || "Unassigned",
        schedule: { ...fetchedSchedule, weekly: safeWeekly }
      });

      setDrawerOpen(true);
    } catch {
      setProfileData({ department: "Unassigned", schedule: { job_type: "Full-Time", weekly: {} } });
      setDrawerOpen(true);
    }
  };

  const handleSaveSettings = async () => {
    try {
      await axios.post(`${API_URL}/schedule`, {
        name: selectedEmployee,
        department: profileData.department,
        schedule: profileData.schedule
      });
      setDrawerOpen(false);
      fetchEmployees();
      alert("Schedule Saved!");
    } catch {
      alert("Save failed.");
    }
  };

  const updateDayConfig = (day, field, value) => {
    setProfileData(prev => {
      const weekly = prev.schedule.weekly || {};
      const currentDay = weekly[day] || { ...DEFAULT_DAY_CONFIG };
      return {
        ...prev,
        schedule: {
          ...prev.schedule,
          weekly: { ...weekly, [day]: { ...currentDay, [field]: value } }
        }
      };
    });
  };

  // -------------------------------------------------------------------
  // 🚀 FIX APPLIED HERE: employee table will NEVER expand page width
  // -------------------------------------------------------------------

  const TABLE_MAX_WIDTH = 500; // Compact fixed width

  return (
    <Box sx={{
      display: "grid",
      gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
      gap: 3,
      width: "100%",
      overflowX: "hidden",
      p: isMobile ? 1 : 0
    }}>

      {/* LEFT SIDE — Registration Workflow */}
      <Paper sx={{ p: isMobile ? 2 : 3, borderRadius: 3 }}>
        <Stack spacing={2}>

          <Typography variant="h6" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <PersonAdd color="primary" /> Register New Face
          </Typography>

          {message && <Alert severity={message.type}>{message.text}</Alert>}

          {/* Instructions + Steps */}
          <Paper
            variant="outlined"
            sx={{
              p: isMobile ? 1.5 : 2,
              bgcolor: isComplete ? "success.light" : "primary.light",
              color: "white",
              textAlign: "center",
              borderColor: "transparent"
            }}
          >
            {!isComplete ? (
              <Stack alignItems="center">
                <Typography variant="caption" sx={{ fontWeight: "bold" }}>
                  STEP {currentStepIndex + 1} OF {REQUIRED_IMAGES}
                </Typography>
                <Typography variant="h6" fontWeight="bold" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  {currentStep.icon} {currentStep.label}
                </Typography>
                <Typography variant="body2">{currentStep.instruction}</Typography>
              </Stack>
            ) : (
              <Stack direction="row" justifyContent="center" alignItems="center" gap={1}>
                <SentimentSatisfiedAlt />
                <Typography fontWeight="bold">All Photos Captured — Ready to Save!</Typography>
              </Stack>
            )}
          </Paper>

          <LinearProgress
            variant="determinate"
            value={(capturedImages.length / REQUIRED_IMAGES) * 100}
            sx={{ height: 8, borderRadius: 4 }}
            color={isComplete ? "success" : "primary"}
          />

          {/* Camera Feed */}
          <Box sx={{
            position: "relative",
            borderRadius: 2,
            overflow: "hidden",
            bgcolor: "#000"
          }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              style={{
                width: "100%",
                height: isMobile ? "200px" : "250px",
                objectFit: "cover"
              }}
            />
            <canvas ref={canvasRef} style={{ display: "none" }} />
          </Box>

          <Stack direction="row" spacing={1} justifyContent="center">
            <Button
              variant="contained"
              onClick={captureImage}
              disabled={isComplete}
              startIcon={isComplete ? <SentimentSatisfiedAlt /> : <CameraAlt />}
            >
              {isComplete ? "Done" : "Take Photo"}
            </Button>

            {capturedImages.length > 0 && (
              <Button color="error" onClick={clearImages}>Reset</Button>
            )}
          </Stack>

          {/* Preview Row */}
          <Stack direction="row" spacing={1} sx={{ overflowX: "auto" }}>
            {capturedImages.map((i, idx) => (
              <Avatar key={idx} src={i} variant="rounded" sx={{ width: 45, height: 45 }} />
            ))}
          </Stack>

          {/* Form Fields */}
          <TextField label="Full Name" value={name} onChange={e => setName(e.target.value)} fullWidth />
          <TextField label="Salesforce Owner ID" value={ownerId} onChange={e => setOwnerId(e.target.value)} fullWidth />

          <FormControl fullWidth>
            <InputLabel>Department</InputLabel>
            <Select value={regDepartment} label="Department" onChange={e => setRegDepartment(e.target.value)}>
              {DEPARTMENTS.map(d => <MenuItem key={d} value={d}>{d}</MenuItem>)}
            </Select>
          </FormControl>

          <Button
            variant="contained"
            color="success"
            onClick={handleRegister}
            disabled={!isComplete || loading}
            startIcon={<Save />}
          >
            {loading ? "Processing..." : "Save Employee"}
          </Button>
        </Stack>
      </Paper>

      {/* RIGHT SIDE — Employee List */}
      <Paper sx={{
        p: isMobile ? 2 : 3,
        borderRadius: 3,
        height: "100%",
        overflow: "hidden" // Prevents zoom bug
      }}>
        <Typography variant="h6" gutterBottom>
          Registered Employees ({employees.length})
        </Typography>

        {/* 🚀 FIX: Prevent page expansion — allow table scrolling only */}
        <TableContainer
          sx={{
            maxHeight: 600,
            overflowX: "auto",
            overflowY: "auto",
            width: "100%",
            borderRadius: 2,
            border: "1px solid rgba(0,0,0,0.1)"
          }}
        >
          <Table
            stickyHeader
            size="small"
            sx={{
              tableLayout: "fixed", // Prevent expansion
              minWidth: 400,
              width: "100%"
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: "bold", width: 160 }}>Name</TableCell>
                <TableCell sx={{ fontWeight: "bold", width: 100 }}>Dept</TableCell>
                <TableCell sx={{ textAlign: "right", width: 90 }}>Action</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {employees.map(emp => (
                <TableRow key={emp.id} hover>
                  <TableCell
                    sx={{
                      maxWidth: 160,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}
                  >
                    <Typography fontWeight={600}>{emp.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {emp.ownerId || "No ID"}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Chip label={emp.department || "Unassigned"} size="small" />
                  </TableCell>

                  <TableCell align="right">
                    <IconButton onClick={() => handleOpenSettings(emp.name)}><Settings /></IconButton>
                    <IconButton color="error" onClick={() => handleDelete(emp.id, emp.name)}><Delete /></IconButton>
                  </TableCell>
                </TableRow>
              ))}

              {employees.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} align="center">No employees found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Scheduler Drawer */}
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sx={{
          "& .MuiDrawer-paper": {
            width: isMobile ? "100vw" : 500,
            maxWidth: "100vw"
          }
        }}
      >
      
        <Box sx={{ width: '100%', bgcolor: "#f9fafb", height: "100%", display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <Box sx={{ p: isMobile ? 2 : 3, bgcolor: "white", borderBottom: "1px solid #eee", display: 'flex', justifyContent: 'space-between' }}>
                <Box>
                    <Typography variant={isMobile ? "subtitle1" : "h6"} fontWeight="bold">Schedule Management</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: isMobile ? '0.75rem' : '0.875rem' }}>Editing: {selectedEmployee}</Typography>
                </Box>
                <IconButton onClick={() => setDrawerOpen(false)}><Close /></IconButton>
            </Box>

            {/* Content Area */}
            <Box sx={{ p: isMobile ? 2 : 3, flexGrow: 1, overflowY: 'auto' }}>
                <Paper sx={{ p: 2, mb: 3 }} elevation={0} variant="outlined">
                    <Stack direction="row" gap={1} mb={2} alignItems="center">
                        <Business color="primary"/> <Typography fontWeight="bold">General</Typography>
                    </Stack>
                    <Grid container spacing={2}>
                        <Grid item xs={12} sm={6}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Department</InputLabel>
                                <Select 
                                    value={profileData.department} label="Department" 
                                    onChange={e => setProfileData({...profileData, department: e.target.value})}
                                >
                                    {DEPARTMENTS.map(d => <MenuItem key={d} value={d}>{d}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Job Type</InputLabel>
                                <Select 
                                    value={profileData.schedule.job_type} label="Job Type" 
                                    onChange={e => setProfileData(prev => ({...prev, schedule: {...prev.schedule, job_type: e.target.value}}))}
                                >
                                    <MenuItem value="Full-Time">Full-Time</MenuItem>
                                    <MenuItem value="Part-Time">Part-Time</MenuItem>
                                    <MenuItem value="Contractor">Contractor</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                    </Grid>
                </Paper>

                <Paper sx={{ p: 0, overflow: 'hidden' }} elevation={0} variant="outlined">
                    <Box sx={{ p: 2, bgcolor: "#f4f6f8", borderBottom: '1px solid #eee' }}>
                        <Stack direction="row" gap={1} alignItems="center">
                            <AccessTime color="primary"/> 
                            <Typography fontWeight="bold">Weekly Schedule Matrix</Typography>
                        </Stack>
                    </Box>
                    
                    {/* Schedule Table (CRITICAL: Reduced padding and sizes) */}
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ bgcolor: "#fff" }}>
                                <TableCell sx={{ p: isMobile ? 0.5 : 1, fontSize: isMobile ? '0.7rem' : '0.75rem' }}>Day</TableCell>
                                <TableCell align="center" sx={{ p: isMobile ? 0.5 : 1, fontSize: isMobile ? '0.7rem' : '0.75rem' }}>Active</TableCell>
                                <TableCell sx={{ p: isMobile ? 0.5 : 1, fontSize: isMobile ? '0.7rem' : '0.75rem' }}>Shift</TableCell>
                                <TableCell align="center" sx={{ p: isMobile ? 0.5 : 1, fontSize: isMobile ? '0.7rem' : '0.75rem' }}>Remote</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {DAYS_OF_WEEK.map(day => {
                                const weekly = profileData.schedule.weekly || {};
                                const dayConfig = weekly[day] || { ...DEFAULT_DAY_CONFIG };
                                const isActive = dayConfig.active;
                                return (
                                    <TableRow key={day} sx={{ opacity: isActive ? 1 : 0.5, bgcolor: isActive ? 'white' : '#fafafa' }}>
                                        <TableCell sx={{ fontWeight: 600, p: isMobile ? '4px 8px' : '6px 16px', fontSize: isMobile ? '0.8rem' : '0.875rem' }}>
                                            {isMobile ? day.substring(0,3) : day.substring(0,3)}
                                        </TableCell>
                                        <TableCell align="center" padding="none">
                                            <Switch size="small" checked={isActive} onChange={(e) => updateDayConfig(day, "active", e.target.checked)} />
                                        </TableCell>
                                        <TableCell sx={{ p: isMobile ? '4px 4px' : '6px 16px' }}> {/* Reduced padding around inputs */}
                                            <Stack spacing={0.5} direction="row">
                                                <TextField 
                                                    type="time" size="small" variant="standard" disabled={!isActive}
                                                    InputProps={{ 
                                                        disableUnderline: true, 
                                                        // CRITICAL FIX: Shrink input width 
                                                        style: { fontSize: isMobile ? 10 : 11, width: isMobile ? 55 : 60, padding: isMobile ? '2px 0' : '4px 0' } 
                                                    }}
                                                    value={dayConfig.start} onChange={(e) => updateDayConfig(day, "start", e.target.value)}
                                                />
                                                <TextField 
                                                    type="time" size="small" variant="standard" disabled={!isActive}
                                                    InputProps={{ 
                                                        disableUnderline: true, 
                                                        // CRITICAL FIX: Shrink input width 
                                                        style: { fontSize: isMobile ? 10 : 11, width: isMobile ? 55 : 60, padding: isMobile ? '2px 0' : '4px 0' }
                                                    }}
                                                    value={dayConfig.end} onChange={(e) => updateDayConfig(day, "end", e.target.value)}
                                                />
                                            </Stack>
                                        </TableCell>
                                        <TableCell align="center" padding="none">
                                            <Tooltip title="Remote?">
                                                <Checkbox 
                                                    size="small" disabled={!isActive} checked={dayConfig.is_remote}
                                                    icon={<HomeWork color="disabled" fontSize="small" />}
                                                    checkedIcon={<HomeWork color="secondary" fontSize="small" />}
                                                    onChange={(e) => updateDayConfig(day, "is_remote", e.target.checked)}
                                                />
                                            </Tooltip>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </Paper>
            </Box>
            {/* Footer */}
            <Box sx={{ p: isMobile ? 2 : 3, bgcolor: "white", borderTop: "1px solid #eee" }}>
                <Button variant="contained" fullWidth size="large" onClick={handleSaveSettings} startIcon={<Save />}>
                    Save Schedule Configuration
                </Button>
            </Box>
        </Box>
      </Drawer>
    </Box>
  );
}