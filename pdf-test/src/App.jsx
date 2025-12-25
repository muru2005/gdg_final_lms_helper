import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import Home from "./Home";
import DataSync from './DataSync';
import Dashboard from "./Dashboard";
import Courses from "./Courses";
import AIViewer from './AIViewer';
import MainLayout from './MainLayout';

function AppWrapper() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/sync" element={<DataSync />} />
      
      {/* This is the only route needed for the Eye Button click */}
      <Route path="/ai" element={<AIViewer />} />
      
      <Route path="/main" element={<MainLayout />}>
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="courses" element={<Courses />} />
        <Route index element={<Navigate to="dashboard" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <HashRouter>
      <AppWrapper /> 
    </HashRouter>
  );
}

export default App;