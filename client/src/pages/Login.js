import React, { useState } from 'react';
import { Form, Button, Alert } from 'react-bootstrap';
import { login } from '../services/api';

function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(password);
      onLogin();
    }
    catch (err) {
      setError(err.message);
      setPassword('');
    }
    finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 340 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src={`${process.env.PUBLIC_URL}/logo192.png`} alt="" style={{ width: 96, height: 96, borderRadius: 20 }} />
          <h1 style={{ marginTop: 16, marginBottom: 0, fontWeight: 'bold' }}>Budgett</h1>
        </div>
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3" controlId="login-password">
            <Form.Label>Password</Form.Label>
            <Form.Control
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </Form.Group>
          {error && <Alert variant="danger" className="py-2">{error}</Alert>}
          <Button type="submit" className="w-100" disabled={submitting || !password}>
            {submitting ? 'Logging in...' : 'Log in'}
          </Button>
        </Form>
      </div>
    </div>
  );
}

export default Login;
