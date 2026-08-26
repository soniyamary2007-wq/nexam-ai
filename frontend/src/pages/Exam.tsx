import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import * as faceapi from 'face-api.js';

const FACE_MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';

interface Question {
  id: number;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  marks: number;
}

interface ExamData {
  id: number;
  title: string;
  subject?: string;
  duration: number;
  total_marks: number;
  proctoring_enabled: number;
  start_time: string;
  end_time: string;
}

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  faceDescriptor?: number[] | null;
}

const API_BASE = 'http://localhost:5000/api';

function Exam() {
  const navigate = useNavigate();
  const { examId } = useParams();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const submittedRef = useRef(false);

  const [currentUser] = useState<User | null>(() =>
    JSON.parse(localStorage.getItem('nexam_current_user') || 'null'),
  );

  const [examData, setExamData] = useState<ExamData | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [alreadyAttempted, setAlreadyAttempted] = useState(false);
  const [priorScore, setPriorScore] = useState<{ score: number; total_marks: number } | null>(null);

  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraMessage, setCameraMessage] = useState('Camera is not connected yet.');
  const [verifyingFace, setVerifyingFace] = useState(false);
  const [faceMismatch, setFaceMismatch] = useState(false);

  const [examStarted, setExamStarted] = useState(false);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [markedForReview, setMarkedForReview] = useState<Set<number>>(new Set());
  const [activeQuestion, setActiveQuestion] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const [incidents, setIncidents] = useState<string[]>([]);
  const [faceModelReady, setFaceModelReady] = useState(false);
  const noFaceStreak = useRef(0);
  const [submitted, setSubmitted] = useState(false);
  const [lockReason, setLockReason] = useState('');
  const [finalScore, setFinalScore] = useState(0);

  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
      return;
    }

    if (currentUser.role !== 'student') {
      navigate(currentUser.role === 'faculty' ? '/faculty' : '/admin');
      return;
    }

    async function load() {
      try {
        const [examRes, attemptRes] = await Promise.all([
          fetch(`${API_BASE}/exams/${examId}`).then((r) => r.json()),
          fetch(`${API_BASE}/exams/${examId}/attempted?studentId=${currentUser.id}`).then((r) => r.json()),
        ]);

        if (!examRes.exam) {
          setLoadError('Exam not found.');
          setLoading(false);
          return;
        }

        setExamData(examRes.exam);
        setQuestions(examRes.questions);
        setRemainingSeconds(examRes.exam.duration * 60);

        if (attemptRes.attempted) {
          setAlreadyAttempted(true);
          setPriorScore(attemptRes.submission);
        }

        setLoading(false);
      } catch {
        setLoadError('Could not connect to the server.');
        setLoading(false);
      }
    }

    load();
  }, [examId, currentUser, navigate]);

      useEffect(() => {
    faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL)
      .then(() => faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODEL_URL))
      .then(() => faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODEL_URL))
      .then(() => setFaceModelReady(true))
      .catch(() => setFaceModelReady(false));

    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  useEffect(() => {
    if (!examStarted || submitted) return;

    const timer = window.setInterval(() => {
      setRemainingSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          submitExam('Time limit reached. Your exam was submitted automatically.');
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [examStarted, submitted]);

    useEffect(() => {
    if (!examStarted || submitted || !examData?.proctoring_enabled) return;

    function handleVisibilityChange() {
      if (document.hidden) {
        submitExam('Tab switch or window change detected. Your exam was submitted automatically.');
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [examStarted, submitted, examData]);

  useEffect(() => {
    if (!examStarted || submitted || !examData?.proctoring_enabled) return;

    function handleFullscreenChange() {
      if (!document.fullscreenElement) {
        submitExam('Exited fullscreen mode (Esc or window action). Your exam was submitted automatically.');
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [examStarted, submitted, examData]);

  useEffect(() => {
    if (!examStarted || submitted || !examData?.proctoring_enabled || !faceModelReady) return;

    const interval = window.setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;

      const detections = await faceapi.detectAllFaces(
        videoRef.current,
        new faceapi.TinyFaceDetectorOptions(),
      );

      if (detections.length === 0) {
        noFaceStreak.current += 1;
        if (noFaceStreak.current === 3) {
          addIncident('No face detected in webcam feed for several seconds.');
        }
      } else if (detections.length > 1) {
        noFaceStreak.current = 0;
        submitExam('Multiple faces detected in webcam feed. Your exam was submitted automatically.');
      } else {
        noFaceStreak.current = 0;
      }
    }, 3000);

    return () => window.clearInterval(interval);
  }, [examStarted, submitted, examData, faceModelReady]);

  async function enableCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraReady(true);
      setCameraMessage('Camera connected. Identity monitoring is ready.');
    } catch {
      setCameraReady(false);
      setCameraMessage('Camera permission was not granted. You can still continue in demo mode.');
    }
  }

  function addIncident(message: string) {
    setIncidents((current) => [...current, `${new Date().toLocaleTimeString()} — ${message}`]);
  }
    async function verifyFace() {
    if (!videoRef.current || !currentUser?.faceDescriptor) return;

    setVerifyingFace(true);
    setFaceMismatch(false);
    setCameraMessage('Verifying your identity...');

    const detection = await faceapi
      .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    setVerifyingFace(false);

    if (!detection) {
      setCameraMessage('No face detected. Center your face in frame and try again.');
      return;
    }

    const storedDescriptor = new Float32Array(currentUser.faceDescriptor);
    const distance = faceapi.euclideanDistance(storedDescriptor, detection.descriptor);

    // Lower distance = more similar. Below ~0.5 is a confident match.
    if (distance < 0.5) {
      setIdentityConfirmed(true);
      setFaceMismatch(false);
      setCameraMessage('✓ Identity verified. Face matches your registered profile.');
    } else {
      setIdentityConfirmed(false);
      setFaceMismatch(true);
      setCameraMessage('⚠ Face does not match the registered candidate. You cannot proceed.');
    }
  }

  function startExam() {
    if (!identityConfirmed || !rulesAccepted) return;
    setExamStarted(true);

    if (examData?.proctoring_enabled) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }

  function selectAnswer(questionIndex: number, optionIndex: number) {
    setAnswers((current) => ({ ...current, [questionIndex]: optionIndex }));
  }

  function clearAnswer(questionIndex: number) {
    setAnswers((current) => {
      const updated = { ...current };
      delete updated[questionIndex];
      return updated;
    });
  }

  function toggleMarkForReview(questionIndex: number) {
    setMarkedForReview((current) => {
      const updated = new Set(current);
      updated.has(questionIndex) ? updated.delete(questionIndex) : updated.add(questionIndex);
      return updated;
    });
  }

  async function submitExam(reason = '') {
    if (!currentUser || submittedRef.current) return;
    submittedRef.current = true;

    if (reason) addIncident(reason);

    const answersArray = questions.map((_, index) => answers[index] ?? -1);

    try {
      const response = await fetch(`${API_BASE}/exams/${examId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: currentUser.id,
          answers: answersArray,
          incidentCount: incidents.length + (reason ? 1 : 0),
          autoSubmitted: Boolean(reason),
        }),
      });

      const data = await response.json();

      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});

      if (response.ok) {
        setFinalScore(data.score);
      }

      setLockReason(reason);
      setSubmitted(true);
    } catch {
      setLockReason('Could not reach the server to submit your exam. Contact your faculty.');
      setSubmitted(true);
    }
  }

  function formatTime(seconds: number) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remaining = seconds % 60;
    if (hours > 0) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
    return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
  }

  if (loading) {
    return (
      <main className="exam-portal">
        <section className="exam-portal-panel">
          <p>Loading exam...</p>
        </section>
      </main>
    );
  }

  if (loadError || !examData) {
    return (
      <main className="exam-portal">
        <section className="exam-portal-panel">
          <span className="exam-portal-code">ERROR</span>
          <h2>{loadError || 'Exam not found'}</h2>
          <button className="exam-primary-btn" onClick={() => navigate('/dashboard')}>Back to dashboard</button>
        </section>
      </main>
    );
  }

  if (alreadyAttempted) {
    return (
      <main className="exam-portal">
        <section className="exam-portal-panel">
          <span className="exam-portal-code">NOTICE</span>
          <h2>Reattempt not allowed</h2>
          <p>You have already submitted this examination.{priorScore && ` Your score: ${priorScore.score}/${priorScore.total_marks}.`}</p>
          <button className="exam-primary-btn" onClick={() => navigate('/dashboard')}>Back to dashboard</button>
        </section>
      </main>
    );
  }

  if (submitted) {
    return (
      <main className="exam-portal">
        <section className="exam-portal-panel exam-result-panel">
          <span className={`exam-result-badge ${lockReason ? 'flagged' : 'clear'}`}>{lockReason ? '!' : '✓'}</span>
          <span className="exam-portal-code">SUBMISSION RECEIVED</span>
          <h2>{lockReason ? 'Your exam session was secured.' : 'Exam submitted successfully.'}</h2>
          <p>{lockReason || 'Your answers have been recorded and objective questions evaluated instantly.'}</p>
          <div className="exam-result-grid">
            <div><small>Candidate</small><strong>{currentUser?.name}</strong></div>
            <div><small>Score</small><strong>{finalScore}/{examData.total_marks}</strong></div>
            <div><small>Incidents</small><strong>{incidents.length}</strong></div>
          </div>
          <button className="exam-primary-btn" onClick={() => navigate('/dashboard')}>Return to dashboard</button>
        </section>
      </main>
    );
  }

  if (!examStarted) {
    return (
      <main className="exam-portal">
        <section className="exam-portal-panel exam-checkin-panel">
          <header className="exam-checkin-header">
            <span className="exam-portal-code">CANDIDATE CHECK-IN</span>
            <h1>{examData.title}</h1>
            <div className="exam-meta-row">
              <span>{examData.subject || 'General Assessment'}</span>
              <span>·</span>
              <span>{examData.duration} minutes</span>
              <span>·</span>
              <span>{questions.length} questions</span>
              <span>·</span>
              <span>{examData.total_marks} marks</span>
            </div>
          </header>

          <div className="exam-checkin-body">
            <div className="exam-checkin-section">
              <h3>Identity verification</h3>
              <div className="exam-camera-frame">
                <video ref={videoRef} autoPlay muted playsInline />
                {!cameraReady && <span className="exam-camera-placeholder">◉</span>}
              </div>
                            <p className={`exam-camera-status ${faceMismatch ? 'exam-camera-warning' : ''}`}>{cameraMessage}</p>
              {Boolean(examData.proctoring_enabled) && !cameraReady && (
                <button className="exam-outline-btn" onClick={enableCamera}>
                  Enable camera
                </button>
              )}
              {Boolean(examData.proctoring_enabled) && cameraReady && !identityConfirmed && (
                <button className="exam-outline-btn" onClick={verifyFace} disabled={verifyingFace || !faceModelReady}>
                  {verifyingFace ? 'Verifying...' : 'Verify my face'}
                </button>
              )}
              {identityConfirmed && <p className="exam-camera-status success">✓ Identity confirmed</p>}
            </div>

            <div className="exam-checkin-section">
              <h3>Examination rules</h3>
              <ol className="exam-rules-list">
                <li>Do not switch tabs, minimize the window, or exit fullscreen once the exam begins.</li>
                <li>Ensure a stable internet connection for the full duration of the exam.</li>
                <li>Any impersonation or use of unfair means will result in disqualification.</li>
                <li>The exam will auto-submit when the timer reaches zero.</li>
                <li>Once submitted, answers cannot be changed under any circumstance.</li>
              </ol>

              <label className="exam-checkbox-row">
                <input type="checkbox" checked={rulesAccepted} onChange={(e) => setRulesAccepted(e.target.checked)} />
                <span>I have read and agree to abide by the examination rules stated above.</span>
              </label>

              <label className="exam-checkbox-row">
                <input type="checkbox" checked={identityConfirmed} disabled readOnly />
                <span><strong>Identity confirmed via face verification.</strong> This is checked automatically once your face matches your registered profile for {currentUser?.name}.</span>
              </label>
            </div>
          </div>

          <footer className="exam-checkin-footer">
            <button className="exam-primary-btn" disabled={!identityConfirmed || !rulesAccepted} onClick={startExam}>
              Proceed to secure exam →
            </button>
          </footer>
        </section>
      </main>
    );
  }

  const activeQ = questions[activeQuestion];
  const answeredCount = Object.keys(answers).length;

  return (
    <main className="exam-workspace-formal">
      <header className="exam-formal-header">
        <div className="exam-formal-header-left">
          <span className="exam-portal-code">SECURE ASSESSMENT IN PROGRESS</span>
          <h2>{examData.title}</h2>
        </div>
        <div className="exam-formal-timer">
          <small>Time remaining</small>
          <strong className={remainingSeconds < 300 ? 'time-warning' : ''}>{formatTime(remainingSeconds)}</strong>
        </div>
        <div className="exam-formal-candidate">
          <div className="exam-small-camera"><video ref={videoRef} autoPlay muted playsInline /></div>
          <div><strong>{currentUser?.name}</strong><small>● Monitoring active</small></div>
        </div>
      </header>

      <section className="exam-formal-layout">
        <aside className="exam-formal-nav">
          <div className="exam-nav-summary">
            <strong>Question palette</strong>
            <p>{answeredCount} of {questions.length} answered</p>
          </div>

          <div className="exam-nav-grid">
            {questions.map((_, index) => {
              const isActive = activeQuestion === index;
              const isAnswered = answers[index] !== undefined;
              const isMarked = markedForReview.has(index);
              let stateClass = 'unanswered';
              if (isAnswered && isMarked) stateClass = 'answered-marked';
              else if (isAnswered) stateClass = 'answered';
              else if (isMarked) stateClass = 'marked';

              return (
                <button key={index} className={`exam-nav-btn ${stateClass} ${isActive ? 'active' : ''}`} onClick={() => setActiveQuestion(index)}>
                  {index + 1}
                </button>
              );
            })}
          </div>

          <div className="exam-nav-incidents">
            {incidents.length === 0 ? '✓ No incidents detected' : `! ${incidents.length} incident(s) logged`}
          </div>
        </aside>

        <section className="exam-formal-question">
          <div className="exam-question-meta">
            <span>QUESTION {activeQuestion + 1} OF {questions.length}</span>
            <span className="exam-question-marks">{activeQ.marks} marks</span>
          </div>

          <h1 className="exam-question-text">{activeQ.question}</h1>

          <div className="exam-formal-options">
            {[activeQ.option_a, activeQ.option_b, activeQ.option_c, activeQ.option_d].map((option, optionIndex) => (
              <label key={optionIndex} className={`exam-option-row ${answers[activeQuestion] === optionIndex ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name={`question-${activeQuestion}`}
                  checked={answers[activeQuestion] === optionIndex}
                  onChange={() => selectAnswer(activeQuestion, optionIndex)}
                />
                <span className="exam-option-letter">{String.fromCharCode(65 + optionIndex)}</span>
                <span className="exam-option-text">{option}</span>
              </label>
            ))}
          </div>

          <footer className="exam-formal-actions">
            <div className="exam-formal-actions-left">
              <button className="exam-outline-btn" onClick={() => clearAnswer(activeQuestion)} disabled={answers[activeQuestion] === undefined}>
                Clear response
              </button>
              <button className={`exam-outline-btn ${markedForReview.has(activeQuestion) ? 'active' : ''}`} onClick={() => toggleMarkForReview(activeQuestion)}>
                {markedForReview.has(activeQuestion) ? 'Unmark review' : 'Mark for review'}
              </button>
            </div>

            <div className="exam-formal-actions-right">
              <button className="exam-outline-btn" disabled={activeQuestion === 0} onClick={() => setActiveQuestion(activeQuestion - 1)}>
                ← Previous
              </button>

              {activeQuestion === questions.length - 1 ? (
                <button className="exam-primary-btn" onClick={() => {
                  if (window.confirm('Submit your exam now? You cannot change answers afterward.')) submitExam();
                }}>
                  Submit exam →
                </button>
              ) : (
                <button className="exam-primary-btn" onClick={() => setActiveQuestion(activeQuestion + 1)}>
                  Save & next →
                </button>
              )}
            </div>
          </footer>
        </section>
      </section>
    </main>
  );
}

export default Exam;