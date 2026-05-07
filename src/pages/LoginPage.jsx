import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Container, Row, Col, Form, Button, Alert } from 'react-bootstrap';
import '../styles/Login.css';

const LoginPage = () => {
  const [email, setEmail] = useState('a201794@siswa.ukm.edu.my');
  const [password, setPassword] = useState('Password10');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleLogin = (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('Sila masukkan emel dan kata laluan');
      return;
    }
    let role = 'pelajar';
    if (email.includes('kp')) {
      role = 'ketua_program';
    } else if (email.includes('admin')) {
      role = 'pentadbir';
    }

    const userData = {
      idPengguna: 'USR' + Date.now(),
      namaPengguna: email.split('@')[0],
      emel: email,
      peranan: role,
    };

    login(userData);
    if (role === 'pelajar') {
      navigate('/student-dashboard');
    } else if (role === 'ketua_program') {
      navigate('/kp-dashboard');
    } else {
      navigate('/admin-dashboard');
    }
  };

  return (
    <div className="login-container">
      <div className="login-wrapper">
        <div className="login-card">
          <div className="login-header">
            <div className="login-icon">
              <i className="bi bi-mortarboard"></i>
            </div>
            <h1>SISTEM PENILAIAN KESETARAAN KURSUS</h1>
            <p className="login-subtitle">Berasaskan Kecerdasan Buatan</p>
          </div>
          {error && (
            <Alert variant="danger" className="alert-dismissible fade show" role="alert">
              <i className="bi bi-exclamation-circle me-2"></i>
              {error}
            </Alert>
          )}
          <Form onSubmit={handleLogin} className="login-form">
            <Form.Group className="mb-4">
              <Form.Label className="form-label-login">
                <i className="bi bi-envelope me-2"></i>Emel
              </Form.Label>
              <Form.Control
                type="email"
                placeholder="Masukkan emel anda"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-control-login"
                required
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="form-label-login">
                <i className="bi bi-lock me-2"></i>Kata Laluan
              </Form.Label>
              <Form.Control
                type="password"
                placeholder="Masukkan kata laluan anda"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-control-login"
                required
              />
            </Form.Group>

            <Button variant="primary" type="submit" className="login-button w-100">
              <i className="bi bi-box-arrow-in-right me-2"></i>Log Masuk Sebagai Pelajar
            </Button>
          </Form>
          <div style={{ marginTop: '10px'}}>
            <Button 
              variant="info" 
              className="w-100"
              style={{ marginBottom: '8px' }}
              onClick={() => {
                const userData = {
                  idPengguna: 'KP001',
                  namaPengguna: 'kp-admin',
                  emel: 'kp@test.com',
                  peranan: 'ketua_program',
                };
                login(userData);
                navigate('/kp-dashboard');
              }}
            >
              <i className="bi bi-person-badge me-2"></i>Log Masuk Sebagai Ketua Program
            </Button>
            <Button 
              variant="secondary"
              className="w-100"
              onClick={() => {
                const userData = {
                  idPengguna: 'ADM001',
                  namaPengguna: 'admin-user',
                  emel: 'admin@test.com',
                  peranan: 'pentadbir',
                };
                login(userData);
                navigate('/admin-dashboard');
              }}
            >
              <i className="bi bi-shield-lock me-2"></i>Log Masuk Sebagai Pentadbir
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
