import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  Box, Card, CardHeader, Typography, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Button, FormControl,
  Select, MenuItem, InputLabel, TextField, Stack, Chip, LinearProgress,Fade,Alert
} from "@mui/material";
import { TableView, FilterAlt, Download, HomeWork, EventBusy } from "@mui/icons-material";
import * as XLSX from "xlsx";

const ExportPanel = () => {
  const [employees, setEmployees] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const [filters, setFilters] = useState({
    employee: "all",
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date().toISOString().split("T")[0]
  });
  useEffect(() => {
    fetchEmployees();
    handleFilter();
  }, []);

  const fetchEmployees = async () => {
    try {
      const res = await axios.get("http://localhost:5000/employees");
      if (res.data.status === "success") setEmployees(res.data.employees);
    } catch (err) { console.error("Load failed", err); }
  };

  const handleFilter = async () => {
    setLoading(true);
    try {
      const res = await axios.get("http://localhost:5000/attendance/filter", {
        params: {
          employee_name: filters.employee,
          start_date: filters.startDate,
          end_date: filters.endDate
        }
      });
      if (res.data.status === "success") setLogs(res.data.logs);
    } catch (err) { console.error("Filter failed", err); }
    setLoading(false);
  };

  const formatTime = (iso) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: 'Asia/Beirut' 
    });
  };

  const exportToExcel = () => {
    if (logs.length === 0) return;

    const exportData = logs.map((log) => ({
      "Staff Member": log.employee_name,
      "Date": log.date,
      "Clock In": log.check_in ? formatTime(log.check_in) : "—",
      "Clock Out": log.check_out ? formatTime(log.check_out) : "—",
      "Break Start": log.break_in ? formatTime(log.break_in) : "—",
      "Break End": log.break_out ? formatTime(log.break_out) : "—",
      "Worked Method": log.worked_method, 
      "Remote Status": log.is_remote_today ? "Yes" : "No",
      "Holiday/Off": log.is_off_today ? "Yes" : "No"
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [
        { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, 
        { wch: 12 }, { wch: 12 }, { wch: 25 }, { wch: 15 }, { wch: 15 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance Data");
    XLSX.writeFile(wb, `Attendance_Summary_${filters.startDate}_to_${filters.endDate}.xlsx`);
  };

  return (
    <Card elevation={0} sx={{ borderRadius: 4, border: "1px solid #E2E8F0" }}>
      <CardHeader
        title={<Typography variant="h6" fontWeight={800}>Data Export Center</Typography>}
        subheader="Generate comprehensive Excel reports for payroll and monitoring."
        sx={{ borderBottom: '1px solid #F1F5F9', p: 3 }}
      />
      <Box sx={{ p: 3, bgcolor: "#F8FAFC" }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 220, bgcolor: "white" }}>
            <InputLabel>Filter Employee</InputLabel>
            <Select
              value={filters.employee}
              label="Filter Employee"
              onChange={(e) => setFilters({ ...filters, employee: e.target.value })}
            >
              <MenuItem value="all">All Personnel</MenuItem>
              {employees.map((name, i) => <MenuItem key={i} value={name}>{name}</MenuItem>)}
            </Select>
          </FormControl>

          <TextField
            label="Start Date" type="date" size="small" focused
            sx={{ bgcolor: "white" }} value={filters.startDate}
            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
          />

          <TextField
            label="End Date" type="date" size="small" focused
            sx={{ bgcolor: "white" }} value={filters.endDate}
            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
          />

          <Button variant="contained" startIcon={<FilterAlt />} onClick={handleFilter} disabled={loading}>
            Run Filter
          </Button>
          
          <Button 
            variant="outlined" color="success" startIcon={<Download />} 
            onClick={exportToExcel} disabled={logs.length === 0}
            sx={{ ml: 'auto !important', fontWeight: 700 }}
          >
            Download Excel
          </Button>
        </Stack>
      </Box>

      {loading && <LinearProgress />}

      <TableContainer sx={{ maxHeight: 550 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 800, bgcolor: '#F8FAFC' }}>Member</TableCell>
              <TableCell sx={{ fontWeight: 800, bgcolor: '#F8FAFC' }}>Date</TableCell>
              <TableCell sx={{ fontWeight: 800, bgcolor: '#F8FAFC' }}>In</TableCell>
              <TableCell sx={{ fontWeight: 800, bgcolor: '#F8FAFC' }}>Out</TableCell>
              <TableCell sx={{ fontWeight: 800, bgcolor: '#F8FAFC' }}>Method</TableCell>
              {/* NEW COLUMNS */}
              <TableCell sx={{ fontWeight: 800, bgcolor: '#F8FAFC' }}>Remote Status</TableCell>
              <TableCell sx={{ fontWeight: 800, bgcolor: '#F8FAFC' }}>Day Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {logs.map((log, index) => (
              <TableRow key={index} hover>
                <TableCell sx={{ fontWeight: 600, textTransform: 'capitalize' }}>{log.employee_name}</TableCell>
                <TableCell>{log.date}</TableCell>
                <TableCell>{formatTime(log.check_in)}</TableCell>
                <TableCell>{formatTime(log.check_out)}</TableCell>
                <TableCell>
                   <Chip 
                    label={log.worked_method} 
                    size="small" 
                    variant="outlined" 
                    color={log.worked_method === 'Continued From Home' ? 'info' : log.worked_method === 'Absent' ? 'error' : 'default'} 
                   />
                </TableCell>
                {/* Remote Status Column */}
                <TableCell>
                  {log.is_remote_today ? (
                    <Chip icon={<HomeWork sx={{ fontSize: '14px !important' }} />} label="Remote" size="small" color="primary" sx={{ height: 24 }} />
                  ) : (
                    <Typography variant="caption" color="text.disabled">On-Site</Typography>
                  )}
                </TableCell>
                {/* Day Status Column */}
                <TableCell>
                  {log.is_off_today ? (
                    <Chip icon={<EventBusy sx={{ fontSize: '14px !important' }} />} label="Off Day" size="small" color="warning" sx={{ height: 24 }} />
                  ) : (
                    <Chip label="Working" size="small" variant="outlined" sx={{ height: 24, borderColor: '#CBD5E1', color: '#64748B' }} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
};

export default ExportPanel;