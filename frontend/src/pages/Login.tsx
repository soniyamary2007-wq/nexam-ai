import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const API_BASE = 'http://localhost:5000/api/auth';

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Enter both your email address and password.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Invalid email or password.');
        setLoading(false);
        return;
      }

      localStorage.setItem('nexam_current_user', JSON.stringify(data.user));

      if (data.user.role === 'admin') {
        navigate('/admin');
      } else if (data.user.role === 'faculty') {
        navigate('/faculty');
      } else {
        navigate('/dashboard');
      }
    } catch {
      setError('Could not connect to the server. Make sure the backend is running on port 5000.');
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-visual">
        <Link to="/" className="auth-brand">
          <span>N</span>
          NEXAM <strong>AI</strong>
        </Link>

        <div className="auth-visual-content">
          <span>AI-POWERED EXAMINATION</span>

          <h1>
            Secure every answer.
            <br />
            <strong>Understand every learner.</strong>
          </h1>

          <p>
            NEXAM AI brings secure proctoring, smart evaluation, and learning
            analytics into one modern examination platform.
          </p>
        </div>
      </section>

      <section className="auth-form-panel">
        <form className="auth-form" onSubmit={handleSubmit}>
          <span className="login-eyebrow">WELCOME BACK</span>
          <h2>Sign in to your portal</h2>
          <p className="login-subtitle">Use your registered account to continue.</p>

          {error && <p className="error-text">! {error}</p>}

          <label>
            Email address
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>

          <label>
            Password
            <div className="password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>

          <button className="login-button" type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in →'}
          </button>

          <p className="register-link">
            New to NEXAM AI? <Link to="/register">Create an account</Link>
          </p>
        </form>
      </section>
    </main>
  );
}

export default Login;