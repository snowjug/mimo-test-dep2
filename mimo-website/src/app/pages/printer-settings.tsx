import { useNavigate } from "react-router-dom";
import { FileText, ShieldCheck, RotateCcw, User } from "lucide-react";
import { useTheme } from "../components/theme-provider";
import { AppBar, Group, Row, Screen, Segmented } from "../components/mimo/ui";

// The previous version of this screen showed placeholder controls (saved cards, notification and
// retention toggles) that were never wired to the API. Only settings that actually work are shown.
export function PrinterSettings() {
  const navigate = useNavigate();
  const { theme = "system", setTheme } = useTheme();

  return (
    <div className="min-h-[100dvh]">
      <AppBar title="Settings" />
      <Screen>
        <Group title="Appearance" footer="System follows your phone's light or dark setting.">
          <div className="px-4 py-3">
            <Segmented
              label="Theme"
              value={(theme as "system" | "light" | "dark") ?? "system"}
              onChange={(v) => setTheme(v)}
              options={[
                { value: "system", label: "System" },
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
            />
          </div>
        </Group>

        <Group title="Account">
          <Row icon={<User className="size-5" strokeWidth={1.75} />} label="Profile and print history" chevron onClick={() => navigate("/user-profile")} />
        </Group>

        <Group title="Legal">
          <Row icon={<ShieldCheck className="size-5" strokeWidth={1.75} />} label="Privacy policy" chevron onClick={() => (window.location.href = "/privacy")} />
          <Row icon={<FileText className="size-5" strokeWidth={1.75} />} label="Terms of service" chevron onClick={() => (window.location.href = "/terms")} />
          <Row icon={<RotateCcw className="size-5" strokeWidth={1.75} />} label="Refund policy" chevron onClick={() => (window.location.href = "/refund-policy")} />
        </Group>
      </Screen>
    </div>
  );
}
