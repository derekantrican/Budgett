import React, { useState } from 'react';
import { Card, Form, Button, Alert } from 'react-bootstrap';
import { login, register } from '../services/api';

function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isRegister, setIsRegister] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const user = isRegister
        ? await register(username, password)
        : await login(username, password);
      onLogin(user);
    }
 catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="d-flex justify-content-center align-items-center vh-100">
      <Card style={{ width: '400px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
        <Card.Body>
          <Card.Title className="text-center mb-4" style={{ fontSize: '1.8em', fontWeight: 'bold' }}>Budgett</Card.Title>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
              <Form.Label>Username</Form.Label>
              <Form.Control
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Password</Form.Label>
              <Form.Control
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Form.Group>
            <Button type="submit" variant="primary" className="w-100">
              {isRegister ? 'Register' : 'Login'}
            </Button>
          </Form>
          <div className="text-center mt-3">
            <Button variant="link" onClick={() => setIsRegister(!isRegister)}>
              {isRegister ? 'Already have an account? Login' : 'Need an account? Register'}
            </Button>
          </div>
        </Card.Body>
      </Card>
    </div>
  );
}

export default Login;
