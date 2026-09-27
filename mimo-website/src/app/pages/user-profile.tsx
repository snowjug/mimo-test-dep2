import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Camera, Gift, LogOut, Printer, Settings } from "lucide-react";
import { toast } from "sonner";
import api from "../api";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "../../lib/firebase";
import { AppBar, EmptyState, Field, Group, PrimaryButton, Row, Screen, Segmented, StatusPill, inputClass } from "../components/mimo/ui";
import { initialsOf } from "../components/mimo-header";

type Tab = "personal" | "mimo-coins" | "activity";

const statusTone = (status: string) => {
  switch ((status || "").toLowerCase()) {
    case "completed": return "success" as const;
    case "paid": return "brand" as const;
    case "printing": return "warning" as const;
    case "failed": return "danger" as const;
    default: return "neutral" as const;
  }
};

const statusLabel = (status: string) => {
  const s = (status || "").toLowerCase();
  if (s === "paid") return "Ready";
  if (!s) return "Unknown";
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export function UserProfile() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab") || "personal";
  const activeTab: Tab = rawTab === "mimo-coins" || rawTab === "activity" ? rawTab : "personal";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [printHistory, setPrintHistory] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mimoCoinsInfo, setMimoCoinsInfo] = useState<{ balance: number; totalEarned: number; totalUsed: number; history: any[] }>({ balance: 0, totalEarned: 0, totalUsed: 0, history: [] });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const profileRes = await api.get("/profile");
        setName(profileRes.data.username);
        setEmail(profileRes.data.email);
        setPhone(profileRes.data.mobileNumber || "");
        setPhotoUrl(profileRes.data.photoUrl || null);

        const settingsRes = await api.get("/api/settings").catch(() => ({ data: { pricePerPageBW: 2.8, pricePerPageColor: 10.0 } }));
        const priceBW = settingsRes.data.pricePerPageBW || 2.8;
        const priceColor = settingsRes.data.pricePerPageColor || 10.0;

        const historyRes = await api.get("/print-history");
        const validHistory = historyRes.data.filter((job: any) => job.printCode && job.printCode !== "-");
        const mappedHistory = validHistory.map((job: any) => {
           if (job.details && job.details.startsWith("0 pages")) {
             const costNum = parseFloat(job.cost.replace('₹', ''));
             const isColor = job.details.includes("Color");
             const pricePerPage = isColor ? priceColor : priceBW;
             const copies = job.copies || 1;
             if (costNum > 0) {
               const calculatedPages = Math.round(costNum / (copies * pricePerPage));
               if (calculatedPages > 0) {
                 job.details = job.details.replace("0 pages", `${calculatedPages} pages`);
               }
             }
           }
           return job;
        });
        setPrintHistory(mappedHistory);

        const coinsRes = await api.get("/mimo/coins");
        const coinsData = {
          balance: coinsRes.data.balance,
          totalEarned: coinsRes.data.totalEarned,
          totalUsed: coinsRes.data.totalUsed,
          history: coinsRes.data.history || []
        };
        setMimoCoinsInfo(coinsData);
        localStorage.setItem("mimoCoinsInfo", JSON.stringify(coinsData));
      } catch (err) {
        console.error("Error fetching profile data", err);
      } finally {
        setLoaded(true);
      }
    };
    fetchData();
  }, []);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await api.put("/profile", { username: name, mobileNumber: phone });
      toast.success("Profile updated successfully!");
    } catch (err) {
      toast.error("Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingPhoto(true);
    try {
      const uniqueFileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const storageRef = ref(storage, `profiles/${name.replace(/[^a-zA-Z0-9]/g, '_')}/${uniqueFileName}`);
      const uploadTask = uploadBytesResumable(storageRef, file);
      const downloadURL = await new Promise<string>((resolve, reject) => {
        uploadTask.on("state_changed", null, (error) => reject(error), async () => {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(url);
        });
      });
      await api.put("/profile", { photoUrl: downloadURL });
      setPhotoUrl(downloadURL);
      toast.success("Profile photo updated!");
    } catch (err) {
      console.error("Profile photo upload failed:", err);
      toast.error("Failed to upload photo");
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("mimo_user_name");
    localStorage.removeItem("jwtToken");
    sessionStorage.removeItem("jwtToken");
    localStorage.removeItem("isAuthenticated");
    navigate("/login");
  };

  return (
    <div className="min-h-[100dvh]">
      <AppBar title="Account" backTo="/upload" />
      <Screen>
        {/* Identity */}
        <div className="flex flex-col items-center pb-6 pt-2 text-center">
          <input type="file" accept="image/*" id="photo-upload" className="hidden" onChange={handlePhotoUpload} disabled={isUploadingPhoto} />
          <button
            type="button"
            onClick={() => document.getElementById("photo-upload")?.click()}
            aria-label="Change profile photo"
            className="press relative size-24 overflow-hidden rounded-full bg-brand text-[32px] font-semibold text-on-brand"
            disabled={isUploadingPhoto}
          >
            {photoUrl ? (
              <img src={photoUrl} alt="" className="size-full object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center">{name ? initialsOf(name) : ""}</span>
            )}
            <span className="absolute inset-x-0 bottom-0 flex h-7 items-center justify-center bg-black/35 text-white">
              <Camera className={`size-4 ${isUploadingPhoto ? "motion-safe:animate-pulse" : ""}`} />
            </span>
          </button>
          <h1 className="mt-3 text-[24px] font-semibold tracking-tight text-ink">
            {name || (loaded ? "Your account" : <span className="inline-block h-6 w-40 rounded-full bg-surface-2 motion-safe:animate-pulse" />)}
          </h1>
          {email && <p className="mt-0.5 text-[15px] text-ink-3">{email}</p>}
        </div>

        <Segmented
          label="Account sections"
          value={activeTab}
          onChange={(v) => setSearchParams({ tab: v })}
          options={[
            { value: "personal", label: "Profile" },
            { value: "mimo-coins", label: "Coins" },
            { value: "activity", label: "History" },
          ]}
          className="mb-6"
        />

        {/* Profile */}
        {activeTab === "personal" && (
          <div className="rise-in">
            <div className="flex flex-col gap-4">
              <Field label="Full name" htmlFor="name">
                <input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Email" htmlFor="email" hint="Email cannot be changed.">
                <input id="email" type="email" value={email} readOnly className={`${inputClass} bg-surface-2 text-ink-2`} />
              </Field>
              <Field label="Mobile number" htmlFor="phone">
                <input id="phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={`${inputClass} tabular-nums`} />
              </Field>
              <PrimaryButton onClick={handleSaveProfile} loading={saving}>Save changes</PrimaryButton>
            </div>

            <Group className="mt-8">
              <Row icon={<Settings className="size-5" strokeWidth={1.75} />} label="Settings" detail="Appearance and legal" chevron onClick={() => navigate("/settings")} />
              <Row icon={<LogOut className="size-5" strokeWidth={1.75} />} label="Sign out" destructive onClick={handleLogout} />
            </Group>
          </div>
        )}

        {/* Coins */}
        {activeTab === "mimo-coins" && (
          <div className="rise-in">
            <div className="rounded-[24px] bg-brand px-5 py-6 text-on-brand">
              <p className="text-[15px] text-white/75">Balance</p>
              <p className="mt-1 text-[48px] font-semibold leading-none tabular-nums tracking-[-0.03em]">{mimoCoinsInfo.balance}</p>
              <p className="mt-2 text-[15px] tabular-nums text-white/75">Worth ₹{(mimoCoinsInfo.balance * 0.5).toFixed(2)} off your next prints</p>
            </div>

            <dl className="mt-4 grid grid-cols-2 divide-x divide-hairline rounded-[20px] bg-surface py-4">
              {[
                { label: "Earned", value: mimoCoinsInfo.totalEarned },
                { label: "Used", value: mimoCoinsInfo.totalUsed },
              ].map((s) => (
                <div key={s.label} className="flex flex-col-reverse px-4 text-center">
                  <dt className="mt-0.5 text-[13px] text-ink-3">{s.label}</dt>
                  <dd className="text-[22px] font-semibold tabular-nums text-ink">{s.value}</dd>
                </div>
              ))}
            </dl>

            <Group title="How coins work">
              <Row label="Earn 1 coin" detail="On every print job above ₹10" />
              <Row label="1 coin is worth ₹0.50" detail="Applied at checkout" />
              <Row label="Up to 50% off" detail="Coins can cover half of any order" />
            </Group>

            <Group title="Activity">
              {mimoCoinsInfo.history.length === 0 ? (
                <EmptyState icon={<Gift className="size-7" strokeWidth={1.5} />} title="No coin activity yet" body="Print anything over ₹10 to earn your first coin." />
              ) : (
                mimoCoinsInfo.history.map((record: any) => (
                  <Row
                    key={record.id}
                    label={record.description}
                    detail={record.date}
                    value={
                      <span className={record.type === "earned" ? "text-success" : "text-ink-2"}>
                        {record.type === "earned" ? "+" : "−"}
                        {record.amount}
                      </span>
                    }
                  />
                ))
              )}
            </Group>
          </div>
        )}

        {/* History */}
        {activeTab === "activity" && (
          <div className="rise-in">
            <Group title={loaded ? `${printHistory.length} ${printHistory.length === 1 ? "job" : "jobs"}` : "Loading"} footer={printHistory.length > 0 ? "Tap a job to copy its print code." : undefined}>
              {!loaded ? (
                <div className="space-y-3 p-4">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-12 rounded-[12px] bg-surface-2 motion-safe:animate-pulse" />
                  ))}
                </div>
              ) : printHistory.length === 0 ? (
                <EmptyState
                  icon={<Printer className="size-7" strokeWidth={1.5} />}
                  title="No prints yet"
                  body="Your print jobs will show up here."
                  action={<PrimaryButton onClick={() => navigate("/upload")}>Print something</PrimaryButton>}
                />
              ) : (
                printHistory.map((job) => {
                  const printer = job.kioskId === "CV-001" ? "MIMO 1.0" : job.kioskId === "SV-002" ? "MIMO 2.0" : job.kioskId;
                  const date = new Date(job.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
                  return (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => {
                        if (job.printCode) {
                          navigator.clipboard.writeText(job.printCode);
                          toast.success(`Print code ${job.printCode} copied!`);
                        }
                      }}
                      className="flex w-full items-start gap-3 border-t border-hairline px-4 py-3 text-left transition-colors first:border-t-0 active:bg-surface-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] text-ink">{job.file}</span>
                        <span className="mt-0.5 block text-[13px] leading-snug text-ink-3">
                          Code <span className="font-semibold tabular-nums tracking-wider text-ink-2">{job.printCode || "----"}</span>
                          , {job.pageCount || 1} {job.pageCount === 1 ? "page" : "pages"}, {job.colorMode === "color" ? "colour" : "B&W"}, {job.copies || 1}{" "}
                          {job.copies === 1 ? "copy" : "copies"}
                          {printer ? `, ${printer}` : ""}
                        </span>
                        <span className="mt-0.5 block text-[13px] text-ink-3">{date}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1.5">
                        <span className="text-[15px] font-semibold tabular-nums text-ink">{job.cost}</span>
                        <StatusPill tone={statusTone(job.status)}>{statusLabel(job.status)}</StatusPill>
                      </span>
                    </button>
                  );
                })
              )}
            </Group>
          </div>
        )}
      </Screen>
    </div>
  );
}
