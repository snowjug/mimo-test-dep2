import { useState, useEffect } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { useNavigate, Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Field, PasswordField, PrimaryButton, Wordmark, inputClass } from "../components/mimo/ui";
import { AuthFooter } from "../components/mimo/auth-footer";
import api from "../api";

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [rememberMe, setRememberMe] = useState(true);

  // Auto-login if token already exists

  useEffect(() => {
    const token = sessionStorage.getItem("jwtToken") || localStorage.getItem("jwtToken");
    if (token) {
      navigate("/upload");
    } else {
      setIsCheckingSession(false);
    }
  }, [navigate]);

  if (isCheckingSession) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3">
        <Loader2 className="size-6 animate-spin text-ink-3" />
        <p className="text-[15px] text-ink-2">Resuming your session</p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await api.post("/login", { email, password });
      const { jwtToken } = response.data;

      if (rememberMe) {
        localStorage.setItem("jwtToken", jwtToken);
      } else {
        sessionStorage.setItem("jwtToken", jwtToken);
      }

      // Check if user already has a name
      const profileRes = await api.get("/profile", {
        headers: { Authorization: `Bearer ${jwtToken}` }
      });

      toast.success("Signed in successfully!");

      if (profileRes.data.username) {
        localStorage.setItem("mimo_user_name", profileRes.data.username);
        navigate("/upload");
      } else {
        navigate("/onboarding");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0a2342]">
      {/* Identity band: the real kiosk rises into the navy ground; the sign-in sheet slides over it. */}
      <div className="relative h-[34dvh] min-h-[220px] overflow-hidden px-5 pt-[max(20px,env(safe-area-inset-top))]">
        <Wordmark className="text-white dark:text-white" />
        <p className="mt-6 max-w-[11ch] text-[24px] font-semibold leading-[1.12] tracking-[-0.03em] text-white">
          Your campus printer, in your pocket.
        </p>
        <span aria-hidden className="pointer-events-none absolute -bottom-6 right-2 select-none text-[120px] leading-none text-white/[0.05]" style={{ fontFamily: "'Lovelo', sans-serif", fontWeight: 900 }}>
          MIMO
        </span>
        <img
          src="/images/landing/kiosk-1300.webp"
          alt=""
          width={481}
          height={1300}
          decoding="async"
          className="kiosk-rise pointer-events-none absolute bottom-[-18%] right-1 h-[112%] w-auto drop-shadow-[0_20px_30px_rgba(0,0,0,0.45)]"
        />
      </div>

      <div className="sheet-rise relative -mt-6 flex flex-1 flex-col rounded-t-[28px] bg-canvas px-5 pt-7">
      <div>
        <h1 className="text-[34px] font-semibold leading-[1.08] tracking-[-0.035em] text-ink">Sign in</h1>
        <p className="mt-2 text-[16px] leading-relaxed text-ink-2">Upload, pay, and collect at any MIMO kiosk.</p>
      </div>

      <div className="mt-7 flex justify-center">
        <GoogleLogin
          onSuccess={async (credentialResponse) => {
            try {
              setLoading(true);
              const res = await api.post("/google-login", {
                token: credentialResponse.credential,
              });
              if (rememberMe) {
                localStorage.setItem("jwtToken", res.data.jwtToken);
              } else {
                sessionStorage.setItem("jwtToken", res.data.jwtToken);
              }

              if (res.data.name && res.data.mobileNumber) {
                localStorage.setItem("mimo_user_name", res.data.name);
                toast.success("Signed in with Google!");
                navigate("/upload");
              } else {
                toast.success("Almost there! Please provide your phone number.");
                navigate("/onboarding", { state: { name: res.data.name } });
              }
            } catch (err: any) {
              console.error(err);
              toast.error("Google sign-in failed");
            } finally {
              setLoading(false);
            }
          }}
          onError={() => {
            toast.error("Google sign-in failed");
          }}
          useOneTap
          size="large"
          shape="pill"
          text="continue_with"
          width="320"
        />
      </div>

      <div className="my-7 flex items-center gap-3 text-[13px] text-ink-3" aria-hidden>
        <span className="h-px flex-1 bg-hairline" />
        or use email
        <span className="h-px flex-1 bg-hairline" />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Email" htmlFor="email">
          <input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@college.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            disabled={loading}
          />
        </Field>
        <PasswordField id="password" label="Password" autoComplete="current-password" value={password} onChange={setPassword} disabled={loading} required />

        <label className="flex min-h-11 cursor-pointer items-center gap-3 px-1 text-[15px] text-ink-2">
          <input
            type="checkbox"
            className="size-5 rounded-md accent-[var(--brand)]"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
          />
          Keep me signed in
        </label>

        <PrimaryButton type="submit" loading={loading}>
          Sign in
        </PrimaryButton>
      </form>

      <p className="mt-6 text-center text-[15px] text-ink-2">
        New to MIMO?{" "}
        <Link to="/register" className="inline-flex min-h-11 items-center font-semibold text-brand-text">
          Create an account
        </Link>
      </p>

      <AuthFooter />
      </div>
    </div>
  );
}
