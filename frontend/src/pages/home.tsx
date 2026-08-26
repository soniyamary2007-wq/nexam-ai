import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

function useCountUp(target: number, duration = 1500) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let start: number | null = null;

    function step(timestamp: number) {
      if (start === null) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      setValue(Math.floor(progress * target));
      if (progress < 1) requestAnimationFrame(step);
    }

    const frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}

export default function Home() {
  const students = useCountUp(1000);
  const exams = useCountUp(250);
  const accuracy = useCountUp(97);

  return (
    <div className="landing">
      <div className="grid-overlay" />
      <div className="blob blob-1" />
      <div className="blob blob-2" />
      <div className="blob blob-3" />

      <nav className="navbar">
        <h2 className="logo">NEXAM AI</h2>

        <div>
          <Link to="/login" className="nav-link">
            Login
          </Link>

          <Link to="/register" className="start-btn">
            Get Started
          </Link>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-left">
          <span className="badge">
            <span className="badge-dot" /> AI Powered Examination Platform
          </span>

          <h1>
            Revolutionizing
            <br />
            Online Examinations
          </h1>

          <p>
            Conduct secure online examinations with AI-based cheating
            detection, automated evaluation, coding assessments,
            analytics dashboards, and intelligent reporting.
          </p>

          <div className="hero-buttons">
            <Link to="/register" className="primary-btn">
              Start Free
            </Link>

            <Link to="/login" className="secondary-btn">
              Login
            </Link>
          </div>
        </div>

        <div className="hero-right">
          <div className="glass-card">
            <div className="feed-header">
              <span className="rec-dot" />
              <h3>Live AI Monitoring</h3>
            </div>

            <div className="feed-window">
              <div className="scan-line" />
              <div className="feed-grid" />
              <div className="feed-corner tl" />
              <div className="feed-corner tr" />
              <div className="feed-corner bl" />
              <div className="feed-corner br" />
            </div>

            <div className="status success">✓ Face Detected</div>
            <div className="status warning">⚠ Tab Switches : 1</div>
            <div className="status success">✓ Identity Verified</div>

            <div className="score">
              Integrity Score
              <h1>98%</h1>
            </div>
          </div>
        </div>
      </section>

      <section className="stats">
        <div className="stat-card">
          <h2>{students.toLocaleString()}+</h2>
          <p>Students</p>
        </div>

        <div className="stat-card">
          <h2>{exams}+</h2>
          <p>Exams Conducted</p>
        </div>

        <div className="stat-card">
          <h2>{accuracy}%</h2>
          <p>Detection Accuracy</p>
        </div>

        <div className="stat-card">
          <h2>24/7</h2>
          <p>Monitoring</p>
        </div>
      </section>

      <section className="features">
        <h2>Core Features</h2>

        <div className="feature-grid">
          <div className="feature-card">
            🤖
            <h3>AI Proctoring</h3>
            <p>Real-time cheating detection and monitoring.</p>
          </div>

          <div className="feature-card">
            📝
            <h3>Auto Evaluation</h3>
            <p>Instant objective answer assessment.</p>
          </div>

          <div className="feature-card">
            💻
            <h3>Coding Assessments</h3>
            <p>Built-in coding tests with evaluation.</p>
          </div>

          <div className="feature-card">
            📊
            <h3>Analytics</h3>
            <p>Detailed student performance insights.</p>
          </div>
        </div>
      </section>

      <footer className="footer">
        © 2026 NEXAM AI • Smart Exams • Secure Future
      </footer>
    </div>
  );
}