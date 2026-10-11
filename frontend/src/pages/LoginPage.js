import { useState } from "react";
import { auth, db } from "../firebase";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { sendPasswordResetEmail } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

const styles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }

  .login-page {
    background: #0B0F1A;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .login-card {
    background: #0D1120;
    border: 0.5px solid rgba(255,255,255,0.08);
    border-radius: 16px;
    padding: 48px;
    width: 100%;
    max-width: 440px;
  }

  .login-brand {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 32px;
    justify-content: center;
  }

  .login-brand-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: #F5C842;
  }

  .login-brand-name {
    font-size: 15px;
    font-weight: 700;
    color: white;
    letter-spacing: 0.1em;
  }

  .login-title {
    font-size: 26px;
    font-weight: 700;
    color: white;
    text-align: center;
    margin-bottom: 8px;
  }

  .login-sub {
    font-size: 14px;
    color: rgba(255,255,255,0.4);
    text-align: center;
    margin-bottom: 32px;
  }

  .login-tabs {
    display: flex;
    background: rgba(255,255,255,0.04);
    border-radius: 8px;
    padding: 4px;
    margin-bottom: 28px;
  }

  .login-tab {
    flex: 1;
    padding: 9px;
    border: none;
    background: none;
    color: rgba(255,255,255,0.4);
    font-size: 14px;
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.2s;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .login-tab.active {
    background: #F5C842;
    color: #1a1200;
    font-weight: 600;
  }

  .login-field {
    margin-bottom: 16px;
  }

  .login-label {
    display: block;
    font-size: 13px;
    color: rgba(255,255,255,0.5);
    margin-bottom: 7px;
  }

  .login-input {
    width: 100%;
    background: rgba(255,255,255,0.05);
    border: 0.5px solid rgba(255,255,255,0.1);
    border-radius: 8px;
    padding: 11px 14px;
    color: white;
    font-size: 14px;
    font-family: system-ui, -apple-system, sans-serif;
    outline: none;
    transition: border 0.2s;
  }

  .login-input:focus {
    border-color: #F5C842;
  }

  .login-btn {
    width: 100%;
    background: #F5C842;
    color: #1a1200;
    border: none;
    padding: 13px;
    border-radius: 9px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    margin-top: 8px;
    font-family: system-ui, -apple-system, sans-serif;
    transition: opacity 0.2s;
  }

  .login-btn:hover { opacity: 0.9; }
  .login-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .login-error {
    background: rgba(255, 80, 80, 0.1);
    border: 0.5px solid rgba(255, 80, 80, 0.3);
    color: #ff6b6b;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 13px;
    margin-bottom: 16px;
    text-align: center;
  }
    .login-success {
  background: rgba(0, 230, 118, 0.1);
  border: 0.5px solid rgba(0, 230, 118, 0.3);
  color: #00e676;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  margin-bottom: 16px;
  text-align: center;
}

  .login-back {
    text-align: center;
    margin-top: 24px;
    font-size: 13px;
    color: rgba(255,255,255,0.3);
    cursor: pointer;
    transition: color 0.2s;
  }

  .login-back:hover { color: rgba(255,255,255,0.7); }
`;

function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [officerName, setOfficerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  // Handles both login and account registration
  const handleSubmit = async () => {
    setError("");
    setLoading(true);

    try {
      if (isLogin) {
        // Authenticate user using Firebase Authentication
        await signInWithEmailAndPassword(auth, email, password);
        navigate("/simulation");
      } else {
        if (!officerName.trim()) {
          setError("Please enter your officer name.");
          setLoading(false);
          return;
        }
        // Create new Firebase Authentication account
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        // Save additional officer information in Firestore
        await setDoc(doc(db, "users", userCredential.user.uid), {
          officerName: officerName,
          email: email,
          previousScore: "N/A",
          createdAt: new Date()
        });
        navigate("/simulation");
      }
    } catch (err) {
      if (err.code === "auth/email-already-in-use") setError("This email is already registered.");
      else if (err.code === "auth/wrong-password") setError("Incorrect password.");
      else if (err.code === "auth/user-not-found") setError("No account found with this email.");
      else if (err.code === "auth/weak-password") setError("Password must be at least 6 characters.");
      else setError("Something went wrong. Please try again.");
    }

    setLoading(false);
  };
  const handleGoogle = async () => {
    setError("");
    setLoading(true);
    try {
      // Create Google authentication provider
      const provider = new GoogleAuthProvider();
      // Open Google sign-in popup
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if user doc exists, if not create it
      const ref = doc(db, "users", user.uid);
      // Check if user already exists in database
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          officerName: user.displayName || "Officer",
          email: user.email,
          previousScore: "N/A",
          createdAt: new Date()
        });
      }

      navigate("/simulation");
    } catch (err) {
      if (err.code === "auth/popup-closed-by-user") setError("Sign-in cancelled.");
      else setError("Google sign-in failed. Try again.");
    }
    setLoading(false);
  };

  return (
    <>
      <style>{styles}</style>
      <div className="login-page">
        <div className="login-card">
          <div className="login-brand">
            <div className="login-brand-dot" />
            <span className="login-brand-name">EVALANE</span>
          </div>

          <h1 className="login-title">{isLogin ? "Welcome back" : "Create account"}</h1>
          <p className="login-sub">{isLogin ? "Sign in to your officer profile" : "Register as a new traffic officer"}</p>

          <div className="login-tabs">
            <button className={`login-tab ${isLogin ? "active" : ""}`} onClick={() => { setIsLogin(true); setError(""); }}>
              Sign In
            </button>
            <button className={`login-tab ${!isLogin ? "active" : ""}`} onClick={() => { setIsLogin(false); setError(""); }}>
              Register
            </button>
          </div>
          
          {error && (
            <div className={error.startsWith("✓") ? "login-success" : "login-error"}>
              {error}
            </div>
          )}

          {!isLogin && (
            <div className="login-field">
              <label className="login-label">Officer Name</label>
              <input className="login-input" type="text" placeholder="e.g. Traffic Controller #007"
                value={officerName} onChange={e => setOfficerName(e.target.value)} />
            </div>
          )}
          
          <div className="login-field">
            <label className="login-label">Email</label>
            <input className="login-input" type="email" placeholder="officer@evalane.com"
              value={email} onChange={e => setEmail(e.target.value)} />
          </div>

          <div className="login-field">
            <label className="login-label">Password</label>
            <div style={{ position: "relative" }}>
              <input className="login-input" type={showPassword ? "text" : "password"} placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)} style={{ paddingRight: "42px" }} />
              <span onClick={() => setShowPassword(!showPassword)} style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "rgba(255,255,255,0.4)", fontSize: "13px", userSelect: "none" }}>
                {showPassword ? "Hide" : "Show"}
              </span>
            </div>
          </div>
          

          <span onClick={() => sendPasswordResetEmail(auth, email)
            .then(() => setError("✓ Password reset email sent. Check your inbox."))
            .catch(e => setError(e.message))
          } style={{ cursor: "pointer", color: "#F5C842", fontSize: 12 }}>
            Forgot password?
          </span>

          <button className="login-btn" onClick={handleSubmit} disabled={loading}>
            {loading ? "Please wait..." : isLogin ? "Sign In" : "Create Account"}
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0 0" }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
            <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 12 }}>or</span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
          </div>
          <button
            onClick={handleGoogle}
            disabled={loading}
            style={{
              width: "100%",
              background: "rgba(255,255,255,0.05)",
              border: "0.5px solid rgba(255,255,255,0.12)",
              borderRadius: 9,
              padding: "11px",
              color: "white",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              marginTop: 12,
              fontFamily: "system-ui, -apple-system, sans-serif",
              transition: "background 0.2s",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.4 29.3 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.3 1 7.2 2.8l5.7-5.7C33.7 7.6 29.1 5.9 24 5.9 13 5.9 4 14.9 4 24s9 18.1 20 18.1c10.1 0 19.2-7.3 19.2-18.1 0-1.3-.1-2.6-.6-3.9z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19.1 13 24 13c2.8 0 5.3 1 7.2 2.8l5.7-5.7C33.7 7.6 29.1 5.9 24 5.9c-7.7 0-14.3 4.4-17.7 10.8z" />
              <path fill="#4CAF50" d="M24 42.1c5.2 0 9.8-1.7 13.4-4.6l-6.2-5.2C29.3 34 26.8 35 24 35c-5.2 0-9.6-3.5-11.2-8.3l-6.5 5C9.7 37.8 16.3 42.1 24 42.1z" />
              <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.2 5.2c-.4.4 6.7-4.9 6.7-14.8 0-1.3-.1-2.6-.4-3.9z" />
            </svg>
            Continue with Google
          </button>
          
          <p className="login-back" onClick={() => navigate("/")}>← Back to home</p>
        </div>
      </div>
    </>
  );
}

export default LoginPage;