import { useNavigate } from "react-router-dom";
import { FileText, ShieldCheck, RotateCcw, User } from "lucide-react";
import { AppBar, Group, Row, Screen } from "../components/mimo/ui";

// Only settings that actually work are shown.
export function PrinterSettings() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[100dvh]">
      <AppBar title="Settings" />
      <Screen>


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
