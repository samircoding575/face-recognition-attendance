/* FULL FILE REWRITTEN – INSIGHT REMOVED – GANTT CHART FIXED */

import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import {
  Box, Card, Typography, Grid, Chip, Avatar, LinearProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Stack, IconButton, Paper, FormControl, Select, MenuItem, InputLabel,
  ToggleButton, ToggleButtonGroup, useMediaQuery, useTheme, Divider
} from "@mui/material";

import {
  EventAvailable, EventBusy, HomeWork, Schedule, Warning,
  ChevronLeft, ChevronRight, FilterAlt, DateRange, AccessTime,
  ThumbUp
} from "@mui/icons-material";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, CartesianGrid
} from "recharts";

import {
  format,
  addDays,
  subDays,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths
} from "date-fns";

const API_URL = "http://localhost:5000";

/* Format minutes into "1h 25m" */
const formatDuration = (totalMinutes) => {
  if (!totalMinutes || totalMinutes <= 0) return "0m";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const AttendanceDashboard = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  // ================================
  // STATE
  // ================================
  const [viewMode, setViewMode] = useState("day");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [rawRecords, setRawRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedDept, setSelectedDept] = useState("All");

  // ================================
  // DATA FETCH
  // ================================
  const fetchData = async () => {
    setLoading(true);

    let startStr, endStr;

    if (viewMode === "day") {
      startStr = format(selectedDate, "yyyy-MM-dd");
      endStr = startStr;
    } else {
      const start = startOfMonth(selectedDate);
      const end = endOfMonth(selectedDate);
      startStr = format(start, "yyyy-MM-dd");
      endStr = format(end, "yyyy-MM-dd");
    }

    try {
      const res = await axios.get(
        `${API_URL}/attendance/by_date?start_date=${startStr}&end_date=${endStr}`
      );
      if (res.data.status === "success") {
        setRawRecords(res.data.data || []);
      }
    } catch (err) {
      console.error("Fetch Error:", err);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [selectedDate, viewMode]);

  // ================================
  // MEMOIZED VALUES
  // ================================
  const departments = useMemo(() => {
    const depts = new Set(rawRecords.map((r) => r.department));
    return ["All", ...Array.from(depts).filter(Boolean).sort()];
  }, [rawRecords]);

  const filteredRecords = useMemo(() => {
    return selectedDept === "All"
      ? rawRecords
      : rawRecords.filter((r) => r.department === selectedDept);
  }, [rawRecords, selectedDept]);

  const stats = useMemo(() => {
    const s = { present: 0, absent: 0, remote: 0, late: 0 };

    filteredRecords.forEach((r) => {
      if (r.status === "Present") s.present++;
      if (r.status === "Absent") s.absent++;
      if (r.status === "Remote") s.remote++;
      if (r.minutes_late > 0) s.late++;
    });

    return s;
  }, [filteredRecords]);

  // ================================
  // DATE HANDLING
  // ================================
  const handleDateChange = (dir) => {
    if (viewMode === "day") {
      setSelectedDate((p) => (dir === "next" ? addDays(p, 1) : subDays(p, 1)));
    } else {
      setSelectedDate((p) => (dir === "next" ? addMonths(p, 1) : subMonths(p, 1)));
    }
  };

  // ================================
  // STATUS CHIP UI
  // ================================
  const getStatusChip = (row) => {
    if (row.status === "Present") {
      if (row.minutes_late > 0) {
        return (
          <Chip
            icon={<Warning sx={{ fontSize: 14 }} />}
            label={`Late ${formatDuration(row.minutes_late)}`}
            size="small"
            color="warning"
            variant="outlined"
            sx={{ height: 24, fontSize: "0.7rem" }}
          />
        );
      }

      return (
        <Chip
          icon={<EventAvailable sx={{ fontSize: 14 }} />}
          label="On Time"
          size="small"
          color="success"
          sx={{ height: 24 }}
        />
      );
    }

    if (row.status === "Absent")
      return <Chip label="Absent" size="small" color="error" sx={{ height: 24 }} />;

    if (row.status === "Remote")
      return (
        <Chip
          icon={<HomeWork sx={{ fontSize: 14 }} />}
          label="Remote"
          size="small"
          variant="outlined"
          color="info"
          sx={{ height: 24 }}
        />
      );

    return <Chip size="small" label="N/A" />;
  };

  // ================================
  // RENDER UI
  // ================================
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3, p: isMobile ? 1 : 0 }}>

      {/* HEADER PANEL */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          borderRadius: 4,
          border: "1px solid #E2E8F0",
          bgcolor: "white",
        }}
      >
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={6}>
            <Typography variant="h6" fontWeight={800}>
              Analytics Engine
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {viewMode === "day"
                ? format(selectedDate, "EEE, MMM dd")
                : format(selectedDate, "MMMM yyyy")}
            </Typography>
          </Grid>

          <Grid item xs={12} md={6}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              justifyContent="flex-end"
              alignItems="center"
            >
              <ToggleButtonGroup
                value={viewMode}
                exclusive
                onChange={(e, v) => v && setViewMode(v)}
                size="small"
              >
                <ToggleButton value="day">Daily</ToggleButton>
                <ToggleButton value="month">Monthly</ToggleButton>
              </ToggleButtonGroup>

              <Stack direction="row" spacing={1} alignItems="center">
                <IconButton size="small" onClick={() => handleDateChange("prev")}>
                  <ChevronLeft />
                </IconButton>

                <Typography fontWeight={700} sx={{ minWidth: 70, textAlign: "center" }}>
                  {viewMode === "day"
                    ? format(selectedDate, "MMM dd")
                    : format(selectedDate, "MMM yyyy")}
                </Typography>

                <IconButton size="small" onClick={() => handleDateChange("next")}>
                  <ChevronRight />
                </IconButton>
              </Stack>

              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Department</InputLabel>
                <Select
                  value={selectedDept}
                  label="Department"
                  onChange={(e) => setSelectedDept(e.target.value)}
                  startAdornment={<FilterAlt fontSize="small" sx={{ mr: 1 }} />}
                >
                  {departments.map((dept) => (
                    <MenuItem key={dept} value={dept}>
                      {dept}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {/* STATS CARDS */}
      <Grid container spacing={3}>
        {[
          { label: "Present", value: stats.present, color: "#10B981", bg: "#ECFDF5" },
          { label: "Absent", value: stats.absent, color: "#EF4444", bg: "#FEF2F2" },
          { label: "Remote", value: stats.remote, color: "#6366F1", bg: "#EEF2FF" },
          { label: "Late", value: stats.late, color: "#F59E0B", bg: "#FFFBEB" },
        ].map((kpi, i) => (
          <Grid item xs={6} md={3} key={i}>
            <Card
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 4,
                border: "1px solid #E2E8F0",
                bgcolor: "white",
                position: "relative",
              }}
            >
              <Box
                sx={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "4px",
                  height: "100%",
                  bgcolor: kpi.color,
                }}
              />
              <Typography variant="caption" color="text.secondary" fontWeight={700}>
                {kpi.label.toUpperCase()}
              </Typography>
              <Typography variant="h4" fontWeight={900}>
                {kpi.value}
              </Typography>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* =============================== */}
      {/* GANTT-LIKE CHART (FULL WIDTH) */}
      {/* =============================== */}
      <Card elevation={0} sx={{ p: 3, borderRadius: 4, border: "1px solid #E2E8F0" }}>
        <Typography
          variant="subtitle1"
          fontWeight={800}
          sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1 }}
        >
          Lateness Breakdown
        </Typography>

        <Box sx={{ height: 350, width: "100%" }}>
          {filteredRecords.filter((r) => r.minutes_late > 0).length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={filteredRecords.filter((r) => r.minutes_late > 0)}
                layout="vertical"
                margin={{ left: 40, right: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} />
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={90}
                  tick={{ fontSize: 12, fontWeight: 700 }}
                />
                <Tooltip
                  formatter={(v) => [`${formatDuration(v)}`, "Lateness"]}
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid #E2E8F0",
                    background: "white",
                  }}
                />
                <Bar dataKey="minutes_late" radius={[4, 4, 4, 4]}>
                  {filteredRecords.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.minutes_late > 30 ? "#EF4444" : "#F59E0B"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Stack alignItems="center" justifyContent="center" sx={{ height: "100%" }}>
              <EventAvailable sx={{ fontSize: 48, color: "#CBD5E1" }} />
              <Typography color="text.secondary">
                No lateness detected in this period.
              </Typography>
            </Stack>
          )}
        </Box>
      </Card>

      {/* TABLE */}
      <Card elevation={0} sx={{ borderRadius: 4, border: "1px solid #E2E8F0" }}>
        <Box
          sx={{
            p: 3,
            borderBottom: "1px solid #F1F5F9",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <Typography variant="subtitle1" fontWeight={800}>
            Detailed Attendance Ledger
          </Typography>
          {loading && <LinearProgress sx={{ width: 100 }} />}
        </Box>

        <TableContainer sx={{ maxHeight: 500 }}>
          <Table stickyHeader size="medium">
            <TableHead>
              <TableRow>
                {viewMode === "month" && (
                  <TableCell sx={{ fontWeight: 700 }}>DATE</TableCell>
                )}
                <TableCell sx={{ fontWeight: 700 }}>EMPLOYEE</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>SHIFT</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>CHECK-IN</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>STATUS</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {filteredRecords.map((row) => (
                <TableRow key={row.id} hover>
                  {viewMode === "month" && (
                    <TableCell>{row.date.slice(5)}</TableCell>
                  )}

                  <TableCell>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Avatar
                        sx={{
                          width: 32,
                          height: 32,
                          fontSize: 14,
                          bgcolor: "#E0E7FF",
                          color: "#4338CA",
                        }}
                      >
                        {row.name[0]}
                      </Avatar>
                      <Typography fontWeight={700}>{row.name}</Typography>
                    </Stack>
                  </TableCell>

                  <TableCell>
                    <Typography variant="caption">{row.shift}</Typography>
                  </TableCell>

                  <TableCell>
                    <Typography fontWeight={800}>
                      {row.check_in
                        ? format(new Date(row.check_in), "hh:mm a")
                        : "--:--"}
                    </Typography>
                  </TableCell>

                  <TableCell>{getStatusChip(row)}</TableCell>
                </TableRow>
              ))}

              {!loading && filteredRecords.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    No records found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Box>
  );
};

export default AttendanceDashboard;
