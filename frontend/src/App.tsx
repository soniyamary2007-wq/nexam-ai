import SnapshotReview from './pages/SnapshotReview';
import StudentReport from './pages/StudentReport';
import { Navigate, Route, Routes } from "react-router-dom";

import Register from "./pages/Register";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Exam from "./pages/Exam";
import FacultyDashboard from "./pages/FacultyDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import CreateExam from "./pages/CreateExam";
import Home from "./pages/Home";
import ExamRecordings from './pages/ExamRecordings';

import "./App.css";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/exam/:examId" element={<Exam />} />
      <Route path="/faculty" element={<FacultyDashboard />} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/create-exam" element={<CreateExam />} />
      <Route path="*" element={<Navigate to="/" replace />} />
      <Route path="/student-report" element={<StudentReport />} />
      <Route path="/faculty/exam/:examId/snapshots" element={<SnapshotReview />} />
      <Route path="/exam-recordings/:examId" element={<ExamRecordings />} />
    </Routes>
  );
}

export default App;