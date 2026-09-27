import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Field, PrimaryButton, Wordmark, inputClass } from "../components/mimo/ui";
import api from "../api";

export function OnboardingName() {
  const navigate = useNavigate();
  const location = useLocation();
  const [name, setName] = useState(location.state?.name || "");
  const [mobileNumber, setMobileNumber] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter your name");
      return;
    }
    if (mobileNumber.length !== 10) {
      toast.error("Please enter a valid 10-digit mobile number");
      return;
    }

    setLoading(true);

    try {
      await api.post("/onboarding", { username: name.trim(), mobileNumber });

      localStorage.setItem("mimo_user_name", name.trim());
      localStorage.setItem("isAuthenticated", "true");
      toast.success(`Welcome to MIMO, ${name.trim()}!`);
      navigate("/upload");
    } catch (err) {
      toast.error("Failed to complete onboarding");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col px-5 pt-[max(20px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
      <div className="flex h-12 items-center">
        <Wordmark />
      </div>

      <div className="rise-in mt-10">
        <h1 className="text-[34px] font-semibold leading-[1.08] tracking-[-0.035em] text-ink">One last step</h1>
        <p className="mt-2 text-[16px] leading-relaxed text-ink-2">Your name goes on receipts. Your number gets the print code.</p>
      </div>

      <form onSubmit={handleSubmit} className="rise-in mt-8 flex flex-1 flex-col gap-4 [animation-delay:60ms]">
        <Field label="Full name" htmlFor="name">
          <input
            id="name"
            type="text"
            autoComplete="name"
            placeholder="Ananya Rao"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            disabled={loading}
            autoFocus
          />
        </Field>

        <Field label="Mobile number" htmlFor="mobile" hint="10 digits, without the country code.">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[16px] text-ink-3">+91</span>
            <input
              id="mobile"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="98450 31276"
              maxLength={10}
              value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, ''))}
              className={`${inputClass} pl-14 tabular-nums`}
              disabled={loading}
            />
          </div>
        </Field>

        <div className="mt-auto pt-8">
          <PrimaryButton type="submit" loading={loading}>
            Start printing
          </PrimaryButton>
          <p className="mt-3 text-center text-[13px] text-ink-3">You can change these later in your profile.</p>
        </div>
      </form>
    </div>
  );
}
