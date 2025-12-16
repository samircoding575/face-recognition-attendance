import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import {
  Box, Card, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, FormControl, Select, MenuItem, InputLabel,
  Stack, Avatar, LinearProgress, IconButton, Tooltip, Dialog, DialogTitle,
  DialogContent, DialogActions, Button, TextField, Grid, Divider, Paper
} from "@mui/material";
import {
  History, EventBusy, FilterAlt, CheckCircle, Edit, Delete, Groups, Person, Coffee
} from "@mui/icons-material";

// --- HELPERS ---
const formatTime = (isoString) => {
  if (!isoString) return "--:--";
  return new Date(isoString).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Beirut'
  });
};

const toInputFormat = (isoString) => {
  if (!isoString) return "";
  const date = new Date(isoString);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date - offset).toISOString().slice(0, 16);
};

const AttendancePanel = () => {
  const [logs, setLogs] = useState([]);
  const [selectedDept, setSelectedDept] = useState("All");
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [currentEdit, setCurrentEdit] = useState(null);
  const [formData, setFormData] = useState({
    check_in: "", break_in: "", break_out: "", check_out: ""
  });

  const fetchLogs = async () => {
    try {
      const response = await axios.get("http://localhost:5000/attendance/today");
      if (response.data.status === "success") setLogs(response.data.logs);
    } catch (err) { console.error("Fetch error:", err); }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  // --- STATS CALCULATIONS ---
  const stats = useMemo(() => ({
    total: logs.length,
    onBreak: logs.filter(l => l.break_in && !l.break_out).length,
    completed: logs.filter(l => l.check_out).length
  }), [logs]);

  const departments = useMemo(() => {
    const depts = new Set(logs.map(log => log.department));
    return ["All", ...Array.from(depts).filter(Boolean).sort()];
  }, [logs]);

  const filteredLogs = useMemo(() => {
    if (selectedDept === "All") return logs;
    return logs.filter(log => log.department === selectedDept);
  }, [logs, selectedDept]);

  // --- HANDLERS ---
  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete record for ${name}?`)) return;
    setLoading(true);
    try {
      await axios.delete(`http://localhost:5000/attendance/${id}`);
      fetchLogs();
    } catch (err) { alert("Failed to delete."); }
    finally { setLoading(false); }
  };

  const handleEditClick = (log) => {
    setCurrentEdit(log);
    setFormData({
      check_in: toInputFormat(log.check_in),
      break_in: toInputFormat(log.break_in),
      break_out: toInputFormat(log.break_out),
      check_out: toInputFormat(log.check_out)
    });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    setLoading(true);
    try {
      const payload = Object.fromEntries(
        Object.entries(formData).map(([k, v]) => [k, v ? new Date(v).toISOString() : null])
      );
      await axios.put(`http://localhost:5000/attendance/${currentEdit.id}`, payload);
      setEditOpen(false);
      fetchLogs();
    } catch (err) { alert("Update failed."); }
    finally { setLoading(false); }
  };

  return (
    <Card elevation={0} sx={{ borderRadius: 4, border: '1px solid #E0E4EC', bgcolor: '#F8FAFC', overflow: 'hidden' }}>
      
      {/* 1. TOP HEADER SECTION */}
      <Box sx={{ p: 3, bgcolor: 'white', borderBottom: '1px solid #EDF2F7' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Avatar sx={{ bgcolor: '#4F46E5', borderRadius: 2, width: 48, height: 48 }}>
              <History fontSize="medium" />
            </Avatar>
            <Box>
              <Typography variant="h5" fontWeight={800} color="#1E293B">Attendance Monitor</Typography>
              <Typography variant="body2" color="text.secondary">Real-time terminal tracking • Beirut Time</Typography>
            </Box>
          </Stack>

          <FormControl size="small" sx={{ minWidth: 100 }}>
            <InputLabel>Filter Department</InputLabel>
            <Select
              value={selectedDept}
              label="Filter Department"
              onChange={(e) => setSelectedDept(e.target.value)}
              startAdornment={<FilterAlt sx={{ fontSize: 18, mr: 1, color: 'action.active' }} />}
              sx={{ borderRadius: 2, bgcolor: '#F1F5F9' }}
            >
              {departments.map(dept => <MenuItem key={dept} value={dept}>{dept}</MenuItem>)}
            </Select>
          </FormControl>
        </Stack>
      </Box>

      {/* 2. STATS SUMMARY BAR */}
      <Box sx={{ px: 3, py: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 120, borderRadius: 3, border: '1px dashed #CBD5E1' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Groups sx={{ color: '#4F46E5' }} />
            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>PRESENT</Typography>
              <Typography variant="h6" fontWeight={700}>{stats.total}</Typography>
            </Box>
          </Stack>
        </Paper>
        <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 120, borderRadius: 3, border: '1px dashed #CBD5E1' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Coffee sx={{ color: '#F59E0B' }} />
            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>ON BREAK</Typography>
              <Typography variant="h6" fontWeight={700}>{stats.onBreak}</Typography>
            </Box>
          </Stack>
        </Paper>
        <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 120, borderRadius: 3, border: '1px dashed #CBD5E1' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <CheckCircle sx={{ color: '#10B981' }} />
            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>FINISHED</Typography>
              <Typography variant="h6" fontWeight={700}>{stats.completed}</Typography>
            </Box>
          </Stack>
        </Paper>
      </Box>

      {loading && <LinearProgress color="primary" sx={{ height: 2 }} />}

      {/* 3. MAIN TABLE CONTAINER */}
      <TableContainer sx={{ maxHeight: 600, bgcolor: 'white' }}>
        <Table stickyHeader size="medium">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, bgcolor: '#F8FAFC' }}>EMPLOYEE</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700, bgcolor: '#F8FAFC' }}>CLOCK IN</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700, bgcolor: '#F8FAFC' }}>BREAK</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700, bgcolor: '#F8FAFC' }}>CLOCK OUT</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, bgcolor: '#F8FAFC', pr: 4 }}>ACTIONS</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 10 }}>
                  <EventBusy sx={{ fontSize: 48, color: '#CBD5E1', mb: 1 }} />
                  <Typography color="text.secondary">No activity logs for today yet.</Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredLogs.map((log) => (
                <TableRow key={log.id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                  <TableCell>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Avatar sx={{ width: 40, height: 40, bgcolor: '#E0E7FF', color: '#4338CA', fontWeight: 700, fontSize: 16 }}>
                        {log.name ? log.name[0].toUpperCase() : <Person />}
                      </Avatar>
                      <Box>
                        <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#1E293B', textTransform: 'capitalize' }}>{log.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{log.department}</Typography>
                      </Box>
                    </Stack>
                  </TableCell>

                  <TableCell align="center">
                    {log.check_in ? (
                      <Chip label={formatTime(log.check_in)} color="success" variant="outlined" size="small"
                        sx={{ fontWeight: 700, borderRadius: '6px', border: '1px solid #10B981', color: '#059669', bgcolor: '#ECFDF5' }} 
                      />
                    ) : <Typography variant="caption" color="text.disabled">--:--</Typography>}
                  </TableCell>

                  <TableCell align="center">
                    <Stack direction="row" spacing={1} justifyContent="center" alignItems="center">
                      {log.break_in ? (
                        <Tooltip title="Break Started">
                          <Chip label={formatTime(log.break_in)} size="small" sx={{ bgcolor: '#FFFBEB', color: '#B45309', fontWeight: 600, border: '1px solid #FCD34D' }} />
                        </Tooltip>
                      ) : <Typography variant="caption" color="text.disabled">--</Typography>}
                      {log.break_in && <Typography color="text.disabled">→</Typography>}
                      {log.break_out ? (
                        <Tooltip title="Break Ended">
                          <Chip label={formatTime(log.break_out)} size="small" sx={{ bgcolor: '#EFF6FF', color: '#1D4ED8', fontWeight: 600, border: '1px solid #93C5FD' }} />
                        </Tooltip>
                      ) : log.break_in ? <Chip label="..." size="small" variant="outlined" /> : null}
                    </Stack>
                  </TableCell>

                  <TableCell align="center">
                    {log.check_out ? (
                      <Chip label={formatTime(log.check_out)} color="error" variant="outlined" size="small"
                        sx={{ fontWeight: 700, borderRadius: '6px', border: '1px solid #EF4444', color: '#DC2626', bgcolor: '#FEF2F2' }} 
                      />
                    ) : <Typography variant="caption" color="text.disabled">--:--</Typography>}
                  </TableCell>

                  <TableCell align="right" sx={{ pr: 3 }}>
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Tooltip title="Modify Record">
                        <IconButton size="small" onClick={() => handleEditClick(log)} sx={{ color: '#6366F1', bgcolor: '#F5F3FF', '&:hover': { bgcolor: '#EDE9FE' } }}>
                          <Edit fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete Permanently">
                        <IconButton size="small" onClick={() => handleDelete(log.id, log.name)} sx={{ color: '#EF4444', bgcolor: '#FEF2F2', '&:hover': { bgcolor: '#FEE2E2' } }}>
                          <Delete fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* 4. MODIFIED EDIT DIALOG */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 4, p: 1 } }}>
        <DialogTitle sx={{ fontWeight: 800, color: '#1E293B' }}>Update Attendance Record</DialogTitle>
        <Divider />
        <DialogContent sx={{ mt: 2 }}>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <TextField label="Check In Time" type="datetime-local" fullWidth InputLabelProps={{ shrink: true }}
                value={formData.check_in} onChange={e => setFormData({...formData, check_in: e.target.value})}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Check Out Time" type="datetime-local" fullWidth InputLabelProps={{ shrink: true }}
                value={formData.check_out} onChange={e => setFormData({...formData, check_out: e.target.value})}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Break Start" type="datetime-local" fullWidth InputLabelProps={{ shrink: true }}
                value={formData.break_in} onChange={e => setFormData({...formData, break_in: e.target.value})}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Break End" type="datetime-local" fullWidth InputLabelProps={{ shrink: true }}
                value={formData.break_out} onChange={e => setFormData({...formData, break_out: e.target.value})}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setEditOpen(false)} sx={{ color: '#64748B', fontWeight: 700 }}>Cancel</Button>
          <Button onClick={handleSaveEdit} variant="contained" sx={{ bgcolor: '#4F46E5', borderRadius: 2, px: 4, fontWeight: 700, '&:hover': { bgcolor: '#4338CA' } }}>
            Save Updates
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default AttendancePanel;