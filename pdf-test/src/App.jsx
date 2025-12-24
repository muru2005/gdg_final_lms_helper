import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import Home from "./Home"
import DataSync from './DataSync'
import Dashboard from "./Dashboard"
import Courses from "./Courses"
import FileBrowser from './components/FileBrowser'
import AIViewer from './AIViewer'
import {BrowserRouter,Routes,Route,useLocation,Navigate} from "react-router-dom"
import MainLayout from './MainLayout'
function AppWrapper() {
  return (
    <>
      <Routes>
        <Route path="/index.html" element={<Navigate to="/" replace />} />
        <Route path="/" element={<Home/>} />
        <Route path="/sync" element={<DataSync/>}/>
        <Route path="/files" element={<FileBrowser/>}/>
        <Route path="/ai" element={<AIViewer/>}/>
        
        
        <Route path="/main" element={<MainLayout/>}>
         
          <Route path="dashboard" element={
            <Dashboard/>
          } />
          <Route path="courses" element={<Courses/>} />
        </Route>
      </Routes>
    </>
  )
}
function App(){
  return (
   <BrowserRouter>
    <AppWrapper/> 
   </BrowserRouter>
  );
}
export default App
