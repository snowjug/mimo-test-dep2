import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { AppBar, Field, PasswordField, PrimaryButton, inputClass } from "../components/mimo/ui";
import { AuthFooter } from "../components/mimo/auth-footer";
import api from "../api";

export function Register() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await api.post("/register", {
        username,
        password,
        email,
        mobileNumber
      });

      const { jwtToken } = response.data;
      localStorage.setItem("jwtToken", jwtToken);

      toast.success("Account created successfully!");
      navigate("/onboarding");
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <AppBar backTo="/login" />
      <div className="flex flex-1 flex-col px-5">
        <div className="rise-in pt-2">
          <h1 className="text-[34px] font-semibold leading-[1.08] tracking-[-0.035em] text-ink">Create account</h1>
          <p className="mt-2 text-[16px] leading-relaxed text-ink-2">Takes under a minute. You can print right after.</p>
        </div>

        <form onSubmit={handleSubmit} className="rise-in mt-8 flex flex-col gap-4 [animation-delay:60ms]">
          <Field label="Full name" htmlFor="username">
            <input
              id="username"
              autoComplete="name"
              placeholder="Ananya Rao"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputClass}
              required
            />
          </Field>
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
              required
            />
          </Field>
          <Field label="Mobile number" htmlFor="mobile" hint="We send your print code here.">
            <input
              id="mobile"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              placeholder="+91 98450 31276"
              value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value)}
              className={inputClass}
              required
            />
          </Field>
          <PasswordField id="password" label="Password" autoComplete="new-password" value={password} onChange={setPassword} required />

          <PrimaryButton type="submit" loading={loading} className="mt-2">
            Create account
          </PrimaryButton>
        </form>

        <p className="mt-6 text-center text-[15px] text-ink-2">
          Already have an account?{" "}
          <Link to="/login" className="inline-flex min-h-11 items-center font-semibold text-brand-text">
            Sign in
          </Link>
        </p>

        <AuthFooter />
      </div>
    </div>
  );
}
