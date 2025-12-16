import React, { useState } from "react";
import { 
  Box, 
  CssBaseline, 
  Typography, 
  AppBar, 
  Toolbar, 
  Container,
  Paper,
  IconButton,
  useMediaQuery,
  useTheme,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  Stack,
  GlobalStyles // <-- CRITICAL IMPORT FOR THE FIX
} from "@mui/material";
import { 
  FaceRetouchingNatural, 
  Assessment,
  Dashboard as DashboardIcon,
  Menu as MenuIcon,
  FileDownload as FileDownloadIcon,
  PersonAdd, // Icon import for Registration
  Psychology
} from "@mui/icons-material";
import { createTheme, ThemeProvider, alpha } from "@mui/material/styles";

// Components
import CameraFeeds from "./CameraFeeds.jsx";
import AttendanceModal from "./AttendanceModal.jsx";
import AttendancePanel from "./AttendancePanel.jsx";
import RegistrationPanel from "./RegistrationPanel.jsx";
import ExportPanel from "./ExportPanel.jsx";
// 1. Define Theme
const customTheme = createTheme({
  palette: {
    primary: { main: '#2563eb', light: '#60a5fa', dark: '#1e40af' },
    secondary: { main: '#10b981' },
    background: { default: '#f3f4f6', paper: '#ffffff' },
    text: { primary: '#111827', secondary: '#6b7280' }
  },
  shape: { borderRadius: 16 },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h5: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.05), 0px 10px 15px -5px rgba(0, 0, 0, 0.04)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          boxShadow: 'none',
          '&:hover': { boxShadow: 'none' },
        }
      }
    }
  },
});

const SIDEBAR_WIDTH = 280;
const APPBAR_HEIGHT_DESKTOP = 80;
const APPBAR_HEIGHT_MOBILE = 64; // Adjusted to match your previous code's intent

function App() {
  const [activeTab, setActiveTab] = useState("live"); 
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const navItems = [
    { id: 'live', label: 'Live Dashboard', icon: <DashboardIcon /> },
    { id: 'reports', label: 'Analytics & Reports', icon: <Assessment /> },
    { id: 'export', label: 'Data Export', icon: <FileDownloadIcon /> },
    { id: 'register', label: 'Register Face', icon: <PersonAdd /> },
  ];

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ width: 40, height: 40, bgcolor: 'primary.main', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)' }}>
            <FaceRetouchingNatural sx={{ color: 'white' }} />
        </Box>
        <Typography variant="h6" color="text.primary">FaceSecure</Typography>
      </Box>
      <List sx={{ px: 2, flexGrow: 1 }}>
        <Typography variant="caption" sx={{ px: 2, mb: 1, display: 'block', color: 'text.secondary', fontWeight: 600 }}>MENU</Typography>
        {navItems.map((item) => (
          <ListItemButton
            key={item.id}
            selected={activeTab === item.id}
            onClick={() => { setActiveTab(item.id); if(isMobile) setMobileOpen(false); }}
            sx={{
              borderRadius: '12px', mb: 1, py: 1.5,
              color: activeTab === item.id ? 'primary.main' : 'text.secondary',
              bgcolor: activeTab === item.id ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
              '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
              '&.Mui-selected': { bgcolor: alpha(theme.palette.primary.main, 0.08), '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.12) } }
            }}
          >
            <ListItemIcon sx={{ minWidth: 40, color: 'inherit' }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: activeTab === item.id ? 600 : 500 }} />
          </ListItemButton>
        ))}
      </List>
      <Box sx={{ p: 2 }}>
        <Paper sx={{ p: 2, borderRadius: '12px', bgcolor: alpha(theme.palette.primary.main, 0.03), border: '1px solid', borderColor: 'divider' }}>
            <Stack direction="row" alignItems="center" spacing={2}>
                <Avatar sx={{ bgcolor: 'secondary.main', width: 36, height: 36, fontSize: '0.875rem' }}>HR</Avatar>
                <Box>
                    <Typography variant="subtitle2" sx={{ lineHeight: 1.2 }}>Admin User</Typography>
                    <Typography variant="caption" color="text.secondary">System Manager</Typography>
                </Box>
            </Stack>
        </Paper>
      </Box>
    </Box>
  );

  return (
    <ThemeProvider theme={customTheme}>
      <CssBaseline />
      
      {/* 🛑 FIX 1: GLOBAL STYLES FOR VIEWPORT BOUNDARIES 🛑
          This is the #1 fix to stop horizontal scrolling (zooming).
          It tells the browser not to show content outside the screen width.
      */}
<GlobalStyles styles={{
  'html, body': { 
      width: '100%', 
      height: '100%', 
      margin: 0, 
      padding: 0,
      overflowX: 'hidden',
  },
  // ADD THIS SECTION:
  '*::-webkit-scrollbar': {
    width: '6px',
    height: '6px', // Thickness of horizontal scrollbar
  },
  '*::-webkit-scrollbar-track': {
    background: 'transparent',
  },
  '*::-webkit-scrollbar-thumb': {
    backgroundColor: alpha(customTheme.palette.text.secondary, 0.2),
    borderRadius: '10px',
  },
  '*::-webkit-scrollbar-thumb:hover': {
    backgroundColor: customTheme.palette.primary.light,
  }
}} />

      <Box sx={{ display: 'flex', minHeight: '100vh', width: '100vw', overflow: 'hidden' }}>
        
        {/* AppBar */}
        <AppBar 
          position="fixed" 
          sx={{ 
            width: { md: `calc(100% - ${SIDEBAR_WIDTH}px)` },
            ml: { md: `${SIDEBAR_WIDTH}px` },
            bgcolor: alpha(theme.palette.background.default, 0.95), 
            backdropFilter: 'blur(12px)',
            boxShadow: 'none',
            borderBottom: '1px solid',
            borderColor: 'divider',
            color: 'text.primary',
            height: { xs: APPBAR_HEIGHT_MOBILE, md: APPBAR_HEIGHT_DESKTOP },
            zIndex: theme.zIndex.drawer + 1
          }}
        >
          <Toolbar sx={{ height: '100%' }}>
            <IconButton color="inherit" edge="start" onClick={handleDrawerToggle} sx={{ mr: 2, display: { md: 'none' } }}>
              <MenuIcon />
            </IconButton>
            <Box sx={{ flexGrow: 1 }}>
                <Typography variant="h5" color="text.primary" sx={{ fontSize: { xs: '1.1rem', md: '1.5rem' }, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {activeTab === 'live' && 'Dashboard Overview'}
                    {activeTab === 'reports' && 'Attendance Analytics'}
                    {activeTab === 'export' && 'Data Export'}
                    {activeTab === 'register' && 'Face Registration'}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>
                    {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </Typography>
            </Box>
          </Toolbar> 
        </AppBar>

        {/* Navigation */}
        <Box component="nav" sx={{ width: { md: SIDEBAR_WIDTH }, flexShrink: { md: 0 } }}>
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={handleDrawerToggle}
            ModalProps={{ keepMounted: true }}
            sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { boxSizing: 'border-box', width: SIDEBAR_WIDTH, border: 'none' } }}
          >
            {drawerContent}
          </Drawer>
          <Drawer
            variant="permanent"
            sx={{ display: { xs: 'none', md: 'block' }, '& .MuiDrawer-paper': { boxSizing: 'border-box', width: SIDEBAR_WIDTH, borderRight: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' } }}
            open
          >
            {drawerContent}
          </Drawer>
        </Box>

        {/* Main Content */}
        <Box 
          component="main" 
          sx={{ 
            flexGrow: 1, 
            p: { xs: 2, md: 4 }, 
            width: { xs: '100%', md: `calc(100% - ${SIDEBAR_WIDTH}px)` },
            // Adjust margin top based on AppBar height
            marginTop: { xs: `${APPBAR_HEIGHT_MOBILE}px`, md: `${APPBAR_HEIGHT_DESKTOP}px` }, 
            bgcolor: 'background.default',
            overflowX: 'hidden' // Ensure the main area doesn't allow scrolling
          }}
        >
          <Container maxWidth="xl" sx={{ p: 0 }}>
              <Box sx={{ animation: 'fadeIn 0.4s ease-out', '@keyframes fadeIn': { from: { opacity: 0, transform: 'translateY(10px)' }, to: { opacity: 1, transform: 'translateY(0)' } } }}>
                
                {/* --- TAB 1: LIVE DASHBOARD --- */}
                {activeTab === 'live' && (
                    <Box 
                        sx={{ 
                            display: 'grid', 
                            gridTemplateColumns: { xs: '1fr', lg: '1fr 400px' }, 
                            gap: 3 
                        }}
                    >
                        {/* 🛑 FIX 2: CAMERA CONTAINER RESPONSIVENESS 🛑
                           Set minWidth: 0 to ensure the grid item shrinks properly on small screens.
                           The inner CameraFeeds component must handle the video shrinking.
                        */}
                        <Box sx={{ 
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: 2, 
                            minWidth: 0, // CRITICAL: Allows flex/grid children to shrink below content size
                        }}>
                            <CameraFeeds />
                        </Box>
                        
                        {/* 🛑 FIX 3: ATTENDANCE PANEL CONTAINER RESPONSIVENESS 🛑
                           This box is constrained, and the inner AttendancePanel must handle its horizontal scroll.
                        */}
                        <Box 
                            sx={{ 
                                display: 'flex', 
                                flexDirection: 'column', 
                                gap: 2, 
                                width: { xs: '100%', lg: '400px' }, // Set fixed width on large, 100% on mobile
                                minWidth: 0, // CRITICAL: Allows grid item to shrink
                                flexShrink: 0
                            }}
                        >
                           <AttendancePanel />    
                        </Box>
                    </Box>
                )}

                {/* Other Tabs */}
                {activeTab === 'reports' && (<Paper sx={{ p: 0, overflow: 'hidden', bgcolor: 'transparent', boxShadow: 'none' }}><AttendanceModal /></Paper>)}
                {activeTab === 'export' && (<Box sx={{ maxWidth: '100%', overflow: 'hidden' }}><ExportPanel /></Box>)}
                {activeTab === 'register' && (<Box sx={{ animation: 'fadeIn 0.3s ease-in' }}><RegistrationPanel /></Box>)}
              </Box>
          </Container>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;