import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import NavbarComponent from './components/Navbar';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import StudentDashboard from './pages/StudentDashboard';
import TransferCreditPage from './pages/TransferCreditPage';
import KPDashboard from './pages/KPDashboard';
import AdminDashboard from './pages/AdminDashboard';
import ProtectedRoute from './pages/ProtectedRoute';
import './App.css';

function App() {
  return (
    <Router>
      <AuthProvider>
        <NavbarComponent />
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/student-dashboard"
            element={
              <ProtectedRoute requiredRole="pelajar">
                <StudentDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student-dashboard/pemindahan-kredit"
            element={
              <ProtectedRoute requiredRole="pelajar">
                <TransferCreditPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/kp-dashboard"
            element={
              <ProtectedRoute requiredRole="ketua_program">
                <KPDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin-dashboard"
            element={
              <ProtectedRoute requiredRole="pentadbir">
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
