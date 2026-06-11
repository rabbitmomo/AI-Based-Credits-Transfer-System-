import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Container, Form, Button, Alert } from 'react-bootstrap';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { buildSupabaseProfile, resolveRoleRoute } from '../lib/authProfile';
import '../styles/Login.css';

const RegisterPage = () => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('pelajar');
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
          peranan: role,
        },
      },
    });

    setLoading(false);

    if (signUpError) {
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
        peranan: role,
      };

      login(userData);

      setSuccess('Pendaftaran berjaya. Anda kini telah log masuk.');

      navigate(resolveRoleRoute(userData.peranan));
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
                <i className="bi bi-shield-lock me-2"></i>Peranan
              </Form.Label>
              <Form.Select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="form-control-login"
                required
              >
                <option value="pelajar">Pelajar</option>
                <option value="ketua_program">Ketua Program</option>
                <option value="pentadbir">Pentadbir</option>
              </Form.Select>
              <small className="text-muted d-block mt-2">
                Peranan ini akan disimpan dalam metadata akaun Supabase dan digunakan semasa log masuk.
              </small>
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
                : role === 'ketua_program'
                  ? 'Daftar Akaun Ketua Program'
                  : role === 'pentadbir'
                    ? 'Daftar Akaun Pentadbir'
                    : 'Daftar Akaun Pelajar'}
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
