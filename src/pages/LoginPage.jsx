import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Container, Row, Col, Form, Button, Alert } from 'react-bootstrap';
import { supabase } from '../lib/supabaseClient';
import { buildSupabaseProfile } from '../lib/authProfile';
import '../styles/Login.css';

const LoginPage = () => {
  const [email, setEmail] = useState('a201794@siswa.ukm.edu.my');
  const [password, setPassword] = useState('Password10');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('Sila masukkan emel dan kata laluan');
      return;
    }
    const signInResult = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInResult.error) {
      const isInvalidCredentials = /invalid login credentials/i.test(signInResult.error.message || '');
      setError(
        isInvalidCredentials
          ? 'Emel atau kata laluan tidak tepat. Pastikan akaun tersebut wujud dalam Supabase Auth dan cuba lagi.'
          : signInResult.error.message || 'Gagal log masuk ke Supabase'
      );
      return;
    }
    const authUser = signInResult.data?.user || null;
    if (!authUser) {
      setError('Sesi Supabase tidak diterima. Sila cuba lagi.');
      return;
    }
    await supabase.auth.refreshSession().catch(() => null);
    const userData = buildSupabaseProfile(authUser) || {
      id: authUser.id,
      idPengguna: authUser.id,
      namaPengguna: email.split('@')[0],
      emel: authUser.email || email,
    };
    login(userData);
    navigate('/student-dashboard');
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
          <div className="mt-3 d-grid gap-2">
            <div className="text-muted small text-center">
              Log masuk menggunakan akaun yang benar-benar wujud dalam Supabase Auth. Jika peranan sudah dikemas kini tetapi kata laluan salah, login tetap akan gagal.
            </div>
            <Button
              variant="info"
              className="w-100"
              onClick={async () => {
                const emailValue = 'kp@test.com';
                const passwordValue = 'admin123';
                const signInResult = await supabase.auth.signInWithPassword({
                  email: emailValue,
                  password: passwordValue,
                });

                if (signInResult.error) {
                  setError(signInResult.error.message || 'Akaun Ketua Program belum wujud. Sila daftar dahulu.');
                  return;
                }

                const authUser = signInResult.data?.user || null;
                if (!authUser) {
                  setError('Sesi Supabase tidak diterima.');
                  return;
                }
                await supabase.auth.refreshSession().catch(() => null);

                const userData = buildSupabaseProfile(authUser) || {
                  id: authUser.id,
                  idPengguna: authUser.id,
                  namaPengguna: 'kp-admin',
                    emel: authUser.email || emailValue,
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
              onClick={async () => {
                const emailValue = 'admin@test.com';
                const passwordValue = 'admin123';
                const signInResult = await supabase.auth.signInWithPassword({
                  email: emailValue,
                  password: passwordValue,
                });

                if (signInResult.error) {
                  setError(signInResult.error.message || 'Akaun Pentadbir belum wujud. Sila daftar dahulu.');
                  return;
                }

                const authUser = signInResult.data?.user || null;
                if (!authUser) {
                  setError('Sesi Supabase tidak diterima.');
                  return;
                }
                await supabase.auth.refreshSession().catch(() => null);

                const userData = buildSupabaseProfile(authUser) || {
                  id: authUser.id,
                  idPengguna: authUser.id,
                  namaPengguna: 'admin-user',
                  emel: authUser.email || emailValue,
                };
                login(userData);
                navigate('/admin-dashboard');
              }}
            >
              <i className="bi bi-shield-lock me-2"></i>Log Masuk Sebagai Pentadbir
            </Button>
            <div className="text-center mt-2">
              <span className="text-muted">Belum ada akaun? </span>
              <Link to="/register" className="text-decoration-none fw-semibold">
                Daftar di sini
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
