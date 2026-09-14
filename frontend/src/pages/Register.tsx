import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as faceapi from 'face-api.js';

const FACE_MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';

type Role = 'student' | 'faculty';

interface College {
  id: number;
  name: string;
  place: string;
}

interface Department {
  id: number;
  name: string;
}

interface ClassOption {
  id: number;
  name: string;
  section: string;
}

const API_BASE = 'http://localhost:5000/api/auth';

function Register() {
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<Role>('student');

  const [states, setStates] = useState<string[]>([]);
  const [selectedState, setSelectedState] = useState('');

  const [colleges, setColleges] = useState<College[]>([]);
  const [selectedCollege, setSelectedCollege] = useState('');

  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState('');

  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClassId, setSelectedClassId] = useState(''); // student: single class
  const [selectedClassIds, setSelectedClassIds] = useState<number[]>([]); // faculty: multiple

    const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [faceModelReady, setFaceModelReady] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [faceDescriptor, setFaceDescriptor] = useState<number[] | null>(null);
  const [faceStatus, setFaceStatus] = useState('Camera not started.');
  const scanLoopRef = useRef<number | null>(null);
  const capturingRef = useRef(false);
  const collectedSamplesRef = useRef<number[][]>([]);
  const [sampleCount, setSampleCount] = useState(0);

  // Load states on mount
  useEffect(() => {
    fetch(`${API_BASE}/states`)
      .then((res) => res.json())
      .then((data) => setStates(data.states || []))
      .catch(() => setError('Could not connect to the server. Is the backend running?'));
  }, []);

    // Load face-detection model on mount (only needed for students, harmless to preload for faculty too)
  useEffect(() => {
    faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL)
      .then(() => faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODEL_URL))
      .then(() => faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODEL_URL))
      .then(() => setFaceModelReady(true))
      .catch(() => setFaceStatus('Could not load face detection. Refresh and try again.'));

      return () => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        if (scanLoopRef.current) window.clearInterval(scanLoopRef.current);
      };
  }, []);

    async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraOn(true);
      collectedSamplesRef.current = [];
      setSampleCount(0);
      setFaceStatus('Camera on. Hold your face steady, centered, and well-lit...');
      scanLoopRef.current = window.setInterval(autoScanFace, 700);
    } catch {
      setFaceStatus('Camera permission denied. Face capture is required to register as a student.');
    }
  }

  async function autoScanFace() {
    if (!videoRef.current || capturingRef.current) return;

    const detection = await faceapi
      .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      setFaceStatus('No face detected. Center your face in the frame.');
      return;
    }

    if (detection.detection.score < 0.8) {
      setFaceStatus('Face detected, but unclear. Hold still and face the camera directly.');
      return;
    }

    // Good frame — collect it as one of several samples
    collectedSamplesRef.current.push(Array.from(detection.descriptor));
    setSampleCount(collectedSamplesRef.current.length);
    setFaceStatus(`Good frame captured (${collectedSamplesRef.current.length}/3). Hold steady...`);

    if (collectedSamplesRef.current.length < 3) {
      return; // keep scanning for more samples
    }

    // Got 3 samples — average them into one stable descriptor
    capturingRef.current = true;
    if (scanLoopRef.current) window.clearInterval(scanLoopRef.current);

    const samples = collectedSamplesRef.current;
    const averaged = samples[0].map((_, i) => {
      const sum = samples.reduce((total, sample) => total + sample[i], 0);
      return sum / samples.length;
    });

    setFaceDescriptor(averaged);
    setFaceStatus('✓ Face captured automatically.');
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setCameraOn(false);
  }

  // Load colleges when state changes
  useEffect(() => {
    setColleges([]);
    setSelectedCollege('');
    setDepartments([]);
    setSelectedDepartment('');
    setClasses([]);
    setSelectedClassId('');
    setSelectedClassIds([]);

    if (!selectedState) return;

    fetch(`${API_BASE}/colleges?state=${encodeURIComponent(selectedState)}`)
      .then((res) => res.json())
      .then((data) => setColleges(data.colleges || []));
  }, [selectedState]);

  // Load departments when college changes
  useEffect(() => {
    setDepartments([]);
    setSelectedDepartment('');
    setClasses([]);
    setSelectedClassId('');
    setSelectedClassIds([]);

    if (!selectedCollege) return;

    fetch(`${API_BASE}/departments?collegeId=${selectedCollege}`)
      .then((res) => res.json())
      .then((data) => setDepartments(data.departments || []));
  }, [selectedCollege]);

  // Load classes when department changes
  useEffect(() => {
    setClasses([]);
    setSelectedClassId('');
    setSelectedClassIds([]);

    if (!selectedDepartment) return;

    fetch(`${API_BASE}/classes?departmentId=${selectedDepartment}`)
      .then((res) => res.json())
      .then((data) => setClasses(data.classes || []));
  }, [selectedDepartment]);

  function toggleFacultyClass(classId: number) {
    setSelectedClassIds((current) =>
      current.includes(classId)
        ? current.filter((id) => id !== classId)
        : [...current, classId],
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!name.trim() || !email.trim() || !password) {
      setError('Please fill in your name, email, and password.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (!selectedState || !selectedCollege || !selectedDepartment) {
      setError('Please select your state, college, and department.');
      return;
    }

    if (role === 'student' && !selectedClassId) {
      setError('Please select your class and section.');
      return;
    }

    if (role === 'faculty' && selectedClassIds.length === 0) {
      setError('Please select at least one class you teach.');
      return;
    }
        if (role === 'student' && !faceDescriptor) {
      setError('Please capture your face using the camera before registering.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          role,
          collegeId: Number(selectedCollege),
          departmentId: Number(selectedDepartment),
          classId: role === 'student' ? Number(selectedClassId) : undefined,
          classIds: role === 'faculty' ? selectedClassIds : undefined,
          faceDescriptor: role === 'student' ? faceDescriptor : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Registration failed. Please try again.');
        setLoading(false);
        return;
      }

      localStorage.setItem('nexam_current_user', JSON.stringify(data.user));
      navigate(role === 'faculty' ? '/faculty' : '/dashboard');
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
            Join a smarter way
            <br />
            <strong>to teach and to test.</strong>
          </h1>

          <p>
            Create your account to start taking secure exams or publishing
            AI-generated assessments for your students.
          </p>
        </div>
      </section>

      <section className="auth-form-panel">
        <form className="auth-form" onSubmit={handleSubmit}>
          <span className="login-eyebrow">CREATE ACCOUNT</span>
          <h2>Join NEXAM AI</h2>
          <p className="login-subtitle">Register as a student or faculty member.</p>

          {error && <p className="error-text">! {error}</p>}

          <label>
            Full name
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Aarav Sharma"
              autoComplete="name"
            />
          </label>

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
                placeholder="At least 6 characters"
                autoComplete="new-password"
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

          <label>
            Confirm password
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Re-enter your password"
              autoComplete="new-password"
            />
          </label>

          <label>
            I am registering as
            <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
              <option value="student">Student</option>
              <option value="faculty">Faculty</option>
            </select>
          </label>

          <label>
            State
            <select value={selectedState} onChange={(event) => setSelectedState(event.target.value)}>
              <option value="">Select state</option>
              {states.map((state) => (
                <option key={state} value={state}>{state}</option>
              ))}
            </select>
          </label>

          <label>
            College
            <select
              value={selectedCollege}
              onChange={(event) => setSelectedCollege(event.target.value)}
              disabled={!selectedState}
            >
              <option value="">Select college</option>
              {colleges.map((college) => (
                <option key={college.id} value={college.id}>
                  {college.name} — {college.place}
                </option>
              ))}
            </select>
          </label>

          <label>
            Department
            <select
              value={selectedDepartment}
              onChange={(event) => setSelectedDepartment(event.target.value)}
              disabled={!selectedCollege}
            >
              <option value="">Select department</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>{dept.name}</option>
              ))}
            </select>
          </label>

          {role === 'student' && (
            <label>
              Class & section
              <select
                value={selectedClassId}
                onChange={(event) => setSelectedClassId(event.target.value)}
                disabled={!selectedDepartment}
              >
                <option value="">Select class</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} - Section {cls.section}
                  </option>
                ))}
              </select>
            </label>
          )}
                    {role === 'student' && (
            <div className="face-capture-section">
              <span className="faculty-class-picker-label">Face verification (required)</span>

              {!faceDescriptor ? (
                <>
                  <div className="face-capture-frame">
                    <video ref={videoRef} autoPlay muted playsInline />
                  </div>
                  <p className="face-capture-status">{faceStatus}</p>
                  {cameraOn && sampleCount > 0 && sampleCount < 3 && (
                    <p className="face-capture-status">Sample {sampleCount} of 3 collected — keep holding still, slight natural movement is fine.</p>
                  )}

                  {!cameraOn && (
                    <button type="button" className="exam-outline-btn" onClick={startCamera} disabled={!faceModelReady}>
                      {faceModelReady ? 'Start camera' : 'Loading face detection...'}
                    </button>
                  )}
                </>
              ) : (
                <p className="face-capture-status success">✓ Face captured. This will be used to verify your identity before each exam.</p>
              )}
            </div>
          )}

          
           
          {role === 'faculty' && (
            <div className="faculty-class-picker">
              <span className="faculty-class-picker-label">
                Classes you teach {!selectedDepartment && '(select department first)'}
              </span>

              <div className="faculty-class-options">
                {classes.map((cls) => (
                  <label key={cls.id} className="faculty-class-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedClassIds.includes(cls.id)}
                      onChange={() => toggleFacultyClass(cls.id)}
                    />
                    <span>{cls.name} - Section {cls.section}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <button className="login-button" type="submit" disabled={loading}>
            {loading ? 'Creating account...' : 'Create account →'}
          </button>

          <p className="register-link">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </form>
      </section>
    </main>
  );
}

export default Register;