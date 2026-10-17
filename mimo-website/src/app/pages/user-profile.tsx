import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { 
  Camera, 
  Gift, 
  LogOut, 
  Printer, 
  Settings,
  ChevronDown,
  Copy,
  Check,
  FileText,
  Calendar,
  Layers,
  Palette,
  MapPin
} from "lucide-react";
import { toast } from "sonner";
import api from "../api";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "../../lib/firebase";
import { AppBar, EmptyState, Field, Group, PrimaryButton, Row, Screen, Segmented, StatusPill, inputClass } from "../components/mimo/ui";
import { initialsOf } from "../components/mimo-header";
import { cn } from "../components/ui/utils";

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
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopyCode = (e: React.MouseEvent, code: string) => {
    e.stopPropagation();
    if (!code || code === "-") return;
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success(`Print code ${code} copied!`);
    setTimeout(() => {
      setCopiedCode((curr) => (curr === code ? null : curr));
    }, 2000);
  };

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
            <Group
              title={loaded ? `${printHistory.length} ${printHistory.length === 1 ? "job" : "jobs"}` : "Loading"}
              footer={printHistory.length > 0 ? "Tap any print job to view full details and copy your print code." : undefined}
            >
              {!loaded ? (
                <div className="space-y-3 p-4">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-14 rounded-[12px] bg-surface-2 motion-safe:animate-pulse" />
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
                  const isExpanded = expandedJobId === job.id;

                  // Parse date & time safely
                  const dateObj = job.createdAtTime ? new Date(job.createdAtTime) : (job.date ? new Date(job.date) : null);
                  const isValidDate = dateObj && !isNaN(dateObj.getTime());
                  const formattedDate = isValidDate
                    ? dateObj.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
                    : (job.date || "Unknown date");
                  const formattedTime = isValidDate
                    ? dateObj.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
                    : "";
                  const fullDateTime = formattedTime ? `${formattedDate} at ${formattedTime}` : formattedDate;

                  // Print options
                  const isColor = (job.colorMode || "").toLowerCase() === "color" || (job.details && job.details.includes("Color"));
                  const colorLabel = isColor ? "Colour" : "Black & White (B&W)";
                  const sidesLabel = job.details?.includes("2-Sided") || job.details?.includes("Double")
                    ? "2-Sided"
                    : (job.details?.includes("1-Sided") || job.details?.includes("Single") ? "1-Sided" : null);

                  const pageCount = job.pageCount || 1;
                  const copies = job.copies || 1;
                  const totalPagesPrinted = pageCount * copies;
                  const fileName = job.file || "Untitled Document";

                  return (
                    <div
                      key={job.id}
                      className={cn(
                        "border-t border-hairline transition-colors first:border-t-0",
                        isExpanded ? "bg-surface-2/20" : "hover:bg-surface-2/40"
                      )}
                    >
                      {/* Collapsed clickable row */}
                      <button
                        type="button"
                        onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
                        aria-expanded={isExpanded}
                        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-surface-2"
                      >
                        {/* File icon badge */}
                        <div
                          className={cn(
                            "flex size-10 shrink-0 items-center justify-center rounded-[12px] transition-colors",
                            isExpanded ? "bg-brand text-on-brand shadow-xs" : "bg-brand-soft/70 text-brand-text"
                          )}
                        >
                          <FileText className="size-5" strokeWidth={1.8} />
                        </div>

                        {/* File name & upload date */}
                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold text-ink">
                            {fileName}
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-3">
                            <span>{formattedDate}</span>
                            <span>•</span>
                            <span>{pageCount} {pageCount === 1 ? "page" : "pages"}</span>
                          </span>
                        </div>

                        {/* Right side: Price, Status, Expand indicator */}
                        <div className="flex shrink-0 items-center gap-2.5">
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-[15px] font-semibold tabular-nums text-ink">{job.cost}</span>
                            <StatusPill tone={statusTone(job.status)}>{statusLabel(job.status)}</StatusPill>
                          </div>
                          <ChevronDown
                            className={cn(
                              "size-4 shrink-0 text-ink-3 transition-transform duration-300",
                              isExpanded && "rotate-180 text-brand"
                            )}
                          />
                        </div>
                      </button>

                      {/* Smooth slide-down accordion container */}
                      <div
                        className={cn(
                          "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
                          isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                        )}
                      >
                        <div className="overflow-hidden">
                          <div className="border-t border-hairline/60 bg-surface px-4 py-4 sm:px-5">
                            {/* Prominent Print Pickup Code Card */}
                            <div className="mb-4 flex items-center justify-between rounded-[16px] border border-brand/20 bg-brand-soft/40 p-3.5 sm:p-4 shadow-xs">
                              <div>
                                <span className="block text-[11px] font-bold uppercase tracking-wider text-brand-text">
                                  Print Pickup Code
                                </span>
                                <div className="mt-1 flex items-baseline gap-2">
                                  <span className="font-mono text-[24px] font-extrabold tracking-widest text-brand tabular-nums">
                                    {job.printCode || "----"}
                                  </span>
                                </div>
                                <span className="mt-0.5 block text-[12px] text-ink-3">
                                  {job.status === "completed"
                                    ? "Job already printed at kiosk"
                                    : "Enter this 4-digit code at any MIMO kiosk touch screen"}
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={(e) => handleCopyCode(e, job.printCode)}
                                className={cn(
                                  "press inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold shadow-xs transition-all",
                                  copiedCode === job.printCode
                                    ? "bg-success text-white"
                                    : "bg-brand text-on-brand hover:bg-brand-press"
                                )}
                              >
                                {copiedCode === job.printCode ? (
                                  <>
                                    <Check className="size-4" strokeWidth={2.5} />
                                    <span>Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="size-4" strokeWidth={2} />
                                    <span>Copy Code</span>
                                  </>
                                )}
                              </button>
                            </div>

                            {/* Full details specs grid */}
                            <div className="rounded-[16px] border border-hairline bg-surface-2/40 p-3.5 sm:p-4">
                              <h3 className="text-[12px] font-semibold uppercase tracking-wider text-ink-3">
                                Print Job Specifications
                              </h3>

                              <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {/* File Name */}
                                <div className="rounded-[12px] border border-hairline/60 bg-surface p-3 sm:col-span-2">
                                  <dt className="flex items-center gap-1.5 text-[12px] font-medium text-ink-3">
                                    <FileText className="size-3.5 text-brand" />
                                    <span>Full File Name</span>
                                  </dt>
                                  <dd className="mt-1 break-all text-[14px] font-semibold leading-snug text-ink">
                                    {fileName}
                                  </dd>
                                </div>

                                {/* Upload Date */}
                                <div className="rounded-[12px] border border-hairline/60 bg-surface p-3">
                                  <dt className="flex items-center gap-1.5 text-[12px] font-medium text-ink-3">
                                    <Calendar className="size-3.5 text-brand" />
                                    <span>Date of Uploading</span>
                                  </dt>
                                  <dd className="mt-1 text-[14px] font-medium text-ink">
                                    {fullDateTime}
                                  </dd>
                                </div>

                                {/* Type of Print */}
                                <div className="rounded-[12px] border border-hairline/60 bg-surface p-3">
                                  <dt className="flex items-center gap-1.5 text-[12px] font-medium text-ink-3">
                                    <Palette className="size-3.5 text-brand" />
                                    <span>Type of Print</span>
                                  </dt>
                                  <dd className="mt-1 text-[14px] font-medium text-ink">
                                    {sidesLabel ? `${colorLabel} • ${sidesLabel}` : colorLabel}
                                  </dd>
                                </div>

                                {/* Pages & Copies */}
                                <div className="rounded-[12px] border border-hairline/60 bg-surface p-3">
                                  <dt className="flex items-center gap-1.5 text-[12px] font-medium text-ink-3">
                                    <Layers className="size-3.5 text-brand" />
                                    <span>Pages & Copies</span>
                                  </dt>
                                  <dd className="mt-1 text-[14px] font-medium text-ink">
                                    {pageCount} {pageCount === 1 ? "page" : "pages"}
                                    {copies > 1 ? ` × ${copies} copies (${totalPagesPrinted} total)` : ` (1 copy)`}
                                  </dd>
                                </div>

                                {/* Kiosk / Station */}
                                <div className="rounded-[12px] border border-hairline/60 bg-surface p-3">
                                  <dt className="flex items-center gap-1.5 text-[12px] font-medium text-ink-3">
                                    <MapPin className="size-3.5 text-brand" />
                                    <span>Kiosk / Machine</span>
                                  </dt>
                                  <dd className="mt-1 text-[14px] font-medium text-ink">
                                    {printer || "Any available MIMO Kiosk"}
                                  </dd>
                                </div>
                              </dl>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
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
