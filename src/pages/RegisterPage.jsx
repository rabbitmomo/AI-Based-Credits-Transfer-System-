import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Container, Form, Button, Alert } from 'react-bootstrap';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { buildSupabaseProfile } from '../lib/authProfile';
import '../styles/Login.css';

const RegisterPage = () => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!fullName || !email || !password || !confirmPassword) {
      setError('Sila lengkapkan semua maklumat pendaftaran');
      return;
    }

    if (password !== confirmPassword) {
      setError('Kata laluan dan pengesahan kata laluan tidak sepadan');
      return;
    }

    setLoading(true);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    setLoading(false);

    if (signUpError) {
      const errorMessage = (signUpError.message || '').toLowerCase();
      const isEmailRateLimit =
        errorMessage.includes('email rate') ||
        errorMessage.includes('rate limit') ||
        errorMessage.includes('over_email_send_rate_limit');

      if (isEmailRateLimit) {
        setError('Supabase telah melebihi had penghantaran emel. Tunggu seketika, elakkan cuba daftar berulang kali, atau matikan email confirmation dalam Auth settings semasa ujian.');
        return;
      }

      setError(signUpError.message || 'Gagal mendaftar ke Supabase');
      return;
    }

    const authUser = data.session?.user || data.user || null;

    if (authUser) {
      const userData = buildSupabaseProfile(authUser) || {
        id: authUser.id,
        idPengguna: authUser.id,
        namaPengguna: fullName,
        emel: authUser.email || email,
      };

      login(userData);

      setSuccess('Pendaftaran berjaya. Anda kini telah log masuk.');

      navigate('/student-dashboard');
      return;
    }

    setSuccess('Pendaftaran berjaya. Sila semak emel anda untuk pengesahan sebelum log masuk.');
  };

  return (
    <div className="login-container">
      <div className="login-wrapper">
        <div className="login-card">
          <div className="login-header">
            <div className="login-icon">
              <i className="bi bi-person-plus"></i>
            </div>
            <h1>PENDAFTARAN AKAUN SUPABASE</h1>
            <p className="login-subtitle">Cipta akaun untuk log masuk ke sistem</p>
          </div>

          {error && (
            <Alert variant="danger" className="alert-dismissible fade show" role="alert">
              <i className="bi bi-exclamation-circle me-2"></i>
              {error}
            </Alert>
          )}

          {success && (
            <Alert variant="success" className="alert-dismissible fade show" role="alert">
              <i className="bi bi-check-circle me-2"></i>
              {success}
            </Alert>
          )}

          <Form onSubmit={handleRegister} className="login-form">
            <Form.Group className="mb-3">
              <Form.Label className="form-label-login">
                <i className="bi bi-person me-2"></i>Nama Penuh
              </Form.Label>
              <Form.Control
                type="text"
                placeholder="Nama penuh anda"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="form-control-login"
                required
              />
            </Form.Group>

            <Form.Group className="mb-3">
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
                placeholder="Buat kata laluan"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-control-login"
                required
              />
            </Form.Group>

            <Form.Group className="mb-4">
              <Form.Label className="form-label-login">
                <i className="bi bi-lock-fill me-2"></i>Sahkan Kata Laluan
              </Form.Label>
              <Form.Control
                type="password"
                placeholder="Ulang kata laluan"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="form-control-login"
                required
              />
            </Form.Group>

            <Button variant="primary" type="submit" className="login-button w-100" disabled={loading}>
              <i className="bi bi-person-plus me-2"></i>
              {loading
                ? 'Mendaftar...'
                : 'Daftar Akaun'}
            </Button>
          </Form>

          <div className="text-center mt-3">
            <span className="text-muted">Sudah ada akaun? </span>
            <Link to="/" className="text-decoration-none fw-semibold">
              Log masuk
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
