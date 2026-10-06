import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import * as faceapi from 'face-api.js';
import { useSpeechDetection, extractKeywords } from '../hooks/useSpeechDetection';

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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);

  const [currentUser] = useState<User | null>(() =>
    JSON.parse(localStorage.getItem('nexam_current_user') || 'null'),
  );

  const [examData, setExamData] = useState<ExamData | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [alreadyAttempted, setAlreadyAttempted] = useState(false);
  const [priorScore, setPriorScore] = useState<{ score: number; total_marks: number } | null>(null);
  const [reattemptReason, setReattemptReason] = useState('');
  const [reattemptRequested, setReattemptRequested] = useState(false);

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

  const recordingStartRef = useRef(0);
  const warningCountRef = useRef(0);
  const episodeRef = useRef<Record<string, { since: number | null; flagged: boolean }>>({});
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const MAX_WARNINGS = 5;
  const GRACE_MS = 6000;

  const [incidents, setIncidents] = useState<string[]>([]);
  const [faceModelReady, setFaceModelReady] = useState(false);
  const noFaceStreak = useRef(0);
  const [violationCount, setViolationCount] = useState(0);
  const [warningMessage, setWarningMessage] = useState('');
  const checkingIdentityRef = useRef(false);
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

    function handleWindowBlur() {
      submitExam('Switched to another application or window. Your exam was submitted automatically.');
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [examStarted, submitted, examData]);

    useEffect(() => {
    if (!examStarted || submitted || !examData?.proctoring_enabled) return;

    const examStartTime = Date.now();

    function handleFullscreenChange() {
      const msSinceStart = Date.now() - examStartTime;
      if (msSinceStart < 1500) return; // ignore the initial browser settling event

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
      if (!videoRef.current || videoRef.current.readyState < 2 || checkingIdentityRef.current) return;

      checkingIdentityRef.current = true;

      try {
        let detections: faceapi.FaceDetection[] = [];
        try {
          detections = await faceapi.detectAllFaces(
            videoRef.current,
            new faceapi.TinyFaceDetectorOptions(),
          );
        } catch (err) {
          console.log('Detection error, skipping this cycle:', err);
          return;
        }

        trackViolation('noFace', detections.length === 0, 'no_face', 'No face detected in front of the camera.');
        trackViolation('multiFace', detections.length > 1, 'multiple_faces', 'More than one face detected in the camera.');

        if (detections.length !== 1) {
          trackViolation('mismatch', false, 'face_mismatch', '');
          return;
        }

        if (currentUser?.faceDescriptor && !submittedRef.current) {
          const fullDetection = await faceapi
            .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks()
            .withFaceDescriptor();

          if (fullDetection) {
            const storedDescriptor = new Float32Array(currentUser.faceDescriptor);
            const distance = faceapi.euclideanDistance(storedDescriptor, fullDetection.descriptor);
            trackViolation('mismatch', distance >= 0.6, 'face_mismatch', 'Face does not match the registered candidate.');
          }
        }
      } catch (err) {
        console.log('Face check error, skipping:', err);
      } finally {
        checkingIdentityRef.current = false;
      }
    }, 3000);

    return () => window.clearInterval(interval);
  }, [examStarted, submitted, examData, faceModelReady, currentUser]);
    // Save a snapshot every 3 seconds for faculty review
  useEffect(() => {
    if (!examStarted || submitted || !examData?.proctoring_enabled || !currentUser) return;

    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');

    const snapInterval = window.setInterval(() => {
      if (!videoRef.current || !ctx || videoRef.current.readyState < 2) return;

      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const image = canvas.toDataURL('image/jpeg', 0.5);

      fetch(`${API_BASE}/exams/snapshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examId: Number(examId), studentId: currentUser.id, image }),
      }).catch(() => {});
    }, 3000);

    return () => window.clearInterval(snapInterval);
  }, [examStarted, submitted, examData, currentUser, examId]);

    
      // A violation only becomes a warning after it lasts 6 seconds in a row
  function trackViolation(key: string, active: boolean, type: string, detail: string) {
    const ep = episodeRef.current[key] ?? (episodeRef.current[key] = { since: null, flagged: false });

    if (!active) {
      ep.since = null;
      ep.flagged = false;
      return;
    }

    if (ep.since === null) ep.since = Date.now();

    if (!ep.flagged && Date.now() - ep.since >= GRACE_MS) {
      ep.flagged = true; // one flag per continuous episode
      addWarning(type, detail);
    }
  }

  function logFlag(type: string, detail: string) {
    if (!currentUser || !examId) return;
    const offsetSeconds = Math.max(0, Math.round((Date.now() - recordingStartRef.current) / 1000));

    fetch(`${API_BASE}/exams/flags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ examId: Number(examId), studentId: currentUser.id, type, detail, offsetSeconds }),
    }).catch(() => {});
  }

  function addWarning(type: string, detail: string) {
    if (submittedRef.current) return;

    playAlertSound();
    warningCountRef.current += 1;
    const count = warningCountRef.current;

    logFlag(type, detail);

    if (count >= MAX_WARNINGS) {
      addIncident(`Warning ${count}/${MAX_WARNINGS}: ${detail} — exam terminated.`);
      submitExam(`Exam terminated: ${detail} (warning limit of ${MAX_WARNINGS} reached).`);
    } else {
      addIncident(`Warning ${count}/${MAX_WARNINGS}: ${detail}`);
      setWarningMessage(`⚠ Warning ${count}/${MAX_WARNINGS}: ${detail} After ${MAX_WARNINGS} warnings your exam will be submitted automatically.`);
      window.setTimeout(() => setWarningMessage(''), 6000);
    }
  }

  // Speech detection: keywords come from the current question and its options
  const questionKeywords = useMemo(() => {
    const q = questions[activeQuestion];
    if (!q) return new Set<string>();
    return extractKeywords(`${q.question} ${q.option_a} ${q.option_b} ${q.option_c} ${q.option_d}`);
  }, [questions, activeQuestion]);

  useSpeechDetection({
    enabled: examStarted && !submitted && Boolean(examData?.proctoring_enabled),
    keywords: questionKeywords,
    questionKey: activeQuestion,
    onWarning: (snippet) => addWarning('speech', `Suspicious speech detected (words heard: ${snippet}).`),
  });
    function addIncident(message: string) {
    setIncidents((current) => [...current, `${new Date().toLocaleTimeString()} — ${message}`]);
  }
    async function requestReattempt() {
    if (!currentUser || !examId) return;

    try {
      const response = await fetch(`${API_BASE}/exams/reattempt-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examId: Number(examId), studentId: currentUser.id, reason: reattemptReason.trim() }),
      });

      if (response.ok) {
        setReattemptRequested(true);
      } else {
        const data = await response.json();
        window.alert(data.error || 'Failed to send request.');
      }
    } catch {
      window.alert('Could not connect to the server.');
    }
  }
  // Re-attach the camera stream whenever the video element remounts
// (this happens when switching from check-in screen to exam screen)
useEffect(() => {
  if (videoRef.current && streamRef.current) {
    videoRef.current.srcObject = streamRef.current;
  }
}, [examStarted]);

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

    function playAlertSound() {
    try {
      const context = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, context.currentTime);
      gain.gain.setValueAtTime(0.3, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.4);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.4);
    } catch {
      // Audio playback not supported — fail silently, warning banner still shows
    }
  }
        async function verifyFace() {
    console.log('verifyFace called. videoRef?', Boolean(videoRef.current), '| has stored descriptor?', Boolean(currentUser?.faceDescriptor));

    if (!videoRef.current || !currentUser?.faceDescriptor) {
      console.log('verifyFace exiting early — missing video or stored descriptor.');
      return;
    }

    setVerifyingFace(true);
    setFaceMismatch(false);
    setCameraMessage('Verifying your identity...');

    console.log('Running face detection...');

    const detection = await faceapi
      .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    console.log('Detection result:', detection ? 'face found' : 'no face found');

    setVerifyingFace(false);

    if (!detection) {
      setCameraMessage('No face detected. Center your face in frame and try again.');
      return;
    }

        const storedDescriptor = new Float32Array(currentUser.faceDescriptor);
    const distance = faceapi.euclideanDistance(storedDescriptor, detection.descriptor);

    console.log('Face match distance:', distance); // TEMPORARY — check browser console

    // Lower distance = more similar. Below ~0.5 is a confident match.
    if (distance < 0.6) {
      setIdentityConfirmed(true);
      setFaceMismatch(false);
      setCameraMessage('✓ Identity verified. Face matches your registered profile.');
    } else {
      setIdentityConfirmed(false);
      setFaceMismatch(true);
      setCameraMessage('⚠ Face does not match the registered candidate. You cannot proceed.');
    }
  }
      async function startExam() {
    if (!identityConfirmed || !rulesAccepted) return;

    if (examData?.proctoring_enabled) {
      try {
        await document.documentElement.requestFullscreen();
      } catch {
        window.alert('Fullscreen mode is required for this proctored exam. Please allow fullscreen and try again.');
        return;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 300));

      if (!document.fullscreenElement) {
        window.alert('Your browser blocked fullscreen mode. Please allow fullscreen access and click "Proceed to secure exam" again.');
        return;
      }
    }

    if (streamRef.current) {
      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(streamRef.current, {
        mimeType: 'video/webm;codecs=vp8',
        videoBitsPerSecond: 500000,
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.start(1000); 
      recordingStartRef.current = Date.now();// collect data every second, in case of abrupt crash
      mediaRecorderRef.current = recorder;
    }

    setExamStarted(true);
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
    async function stopAndUploadRecording(): Promise<void> {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;

      if (!recorder || recorder.state === 'inactive') {
        resolve();
        return;
      }

      recorder.onstop = async () => {
        try {
          const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });

          if (blob.size > 0 && currentUser && examId) {
            await fetch(`${API_BASE}/exams/recording?examId=${examId}&studentId=${currentUser.id}`, {
              method: 'POST',
              headers: { 'Content-Type': 'video/webm' },
              body: blob,
            });
          }
        } catch {
          // Upload failure shouldn't block submission
        }
        resolve();
      };

      recorder.stop();
    });
  }

  async function submitExam(reason = '') {
    if (!currentUser || submittedRef.current) return;
    submittedRef.current = true;

    if (reason) addIncident(reason);

    const answersArray = questions.map((_, index) => answers[index] ?? -1);

    await stopAndUploadRecording();

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

          {!reattemptRequested ? (
            <>
              <textarea
                className="reattempt-reason-box"
                placeholder="If this was a mistake (e.g. accidental submission, technical issue), explain briefly..."
                value={reattemptReason}
                onChange={(e) => setReattemptReason(e.target.value)}
                rows={3}
              />
              <button className="exam-outline-btn" onClick={requestReattempt}>
                Request a reattempt
              </button>
            </>
          ) : (
            <p className="face-capture-status success">✓ Your reattempt request has been sent to your faculty for review.</p>
          )}

          <button className="exam-primary-btn" onClick={() => navigate('/dashboard')} style={{ marginTop: 12 }}>
            Back to dashboard
          </button>
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

      {warningMessage && (
        <div className="exam-violation-banner">{warningMessage}</div>
      )}

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