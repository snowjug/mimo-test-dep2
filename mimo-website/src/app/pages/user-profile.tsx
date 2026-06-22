import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Badge } from "../components/ui/badge";
import { Separator } from "../components/ui/separator";
import { User, Mail, Phone, Save, Bell, Gift, Copy, CheckCircle2, LogOut, ChevronRight, TrendingUp, TrendingDown, Clock, ShieldCheck, Printer, ArrowLeft, Pencil } from "lucide-react";
import { toast } from "sonner";
import api from "../api";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "../../lib/firebase";

const NAV_ITEMS = [
  { id: "personal", label: "Personal Info",    icon: User },
  { id: "mimo-coins", label: "Mimo Coins",     icon: Gift },
  { id: "activity",  label: "Print History",   icon: Printer },
  { id: "notifications", label: "Notifications", icon: Bell },
];

const getStatusColor = (status: string) => {
  switch(status.toLowerCase()) {
    case 'completed': return 'bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100';
    case 'paid': return 'bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100';
    case 'printing': return 'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100';
    case 'failed': return 'bg-red-100 text-red-800 border-red-200 hover:bg-red-100';
    default: return 'bg-slate-100 text-slate-800 border-slate-200 hover:bg-slate-100';
  }
};

export function UserProfile() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "personal";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [printHistory, setPrintHistory] = useState<any[]>([]);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [smsNotifications, setSmsNotifications] = useState(false);
  const [printCompleteNotif, setPrintCompleteNotif] = useState(true);
  const [marketingEmails, setMarketingEmails] = useState(false);
  const [mimoCoinsInfo, setMimoCoinsInfo] = useState<{ balance: number; totalEarned: number; totalUsed: number; history: any[] }>({ balance: 0, totalEarned: 0, totalUsed: 0, history: [] });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const profileRes = await api.get("/profile");
        setName(profileRes.data.username);
        setEmail(profileRes.data.email);
        setPhone(profileRes.data.mobileNumber || "");
        setPhotoUrl(profileRes.data.photoUrl || null);

        const historyRes = await api.get("/print-history");
        const validHistory = historyRes.data.filter((job: any) => job.printCode && job.printCode !== "-");
        const mappedHistory = validHistory.map((job: any) => {
           if (job.details && job.details.startsWith("0 pages")) {
             const costNum = parseFloat(job.cost.replace('₹', ''));
             const isColor = job.details.includes("Color");
             const pricePerPage = isColor ? 9.2 : 2.3;
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
      }
    };
    fetchData();
  }, []);

  const handleSaveProfile = async () => {
    try {
      await api.put("/profile", { username: name, mobileNumber: phone });
      toast.success("Profile updated successfully!");
    } catch (err) {
      toast.error("Failed to update profile");
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

  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

  return (
    <div className="w-full bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100 px-3 pb-8 sm:px-6">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        .profile-page { font-family: 'Inter', sans-serif; }
        .nav-item-active { background: linear-gradient(135deg, #093765 0%, #1d4ed8 100%); color: white; box-shadow: 0 4px 14px rgba(9,55,101,0.25); }
        .nav-item-active svg { color: white !important; }
        .coin-card { background: linear-gradient(135deg, #3b0764 0%, #6d28d9 60%, #8b5cf6 100%); }
        .profile-hero { background: linear-gradient(135deg, #093765 0%, #1e40af 60%, #1d4ed8 100%); }
        @keyframes float { 0%,100% { transform: translateY(0px) rotate(12deg); } 50% { transform: translateY(-8px) rotate(12deg); } }
        .float-anim { animation: float 4s ease-in-out infinite; }
        .glass-card { background: rgba(255,255,255,0.12); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.2); }
      `}</style>

      <div className="profile-page mx-auto max-w-5xl">

        {/* ── Page Header ── */}
        <div className="flex items-center gap-2 py-2">
          <button
            onClick={() => navigate("/upload")}
            className="text-[#093765] hover:text-blue-600 transition-colors cursor-pointer flex items-center justify-center p-1 rounded-lg hover:bg-slate-200/40 -ml-1"
            aria-label="Back"
          >
            <ArrowLeft className="w-6 h-6" strokeWidth={2.5} />
          </button>
          <h1 className="text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-[#093765] to-blue-600 bg-clip-text text-transparent tracking-tight leading-tight py-1">
            Account & Settings
          </h1>
        </div>

        {/* ── Profile Hero Card ── */}
        <div className="profile-hero rounded-2xl sm:rounded-3xl p-6 sm:p-8 mb-6 shadow-2xl shadow-blue-900/20 relative overflow-hidden">
          {/* Floating Printer Watermark */}
          <div className="absolute right-6 bottom-24 sm:right-12 sm:bottom-4 text-white pointer-events-none float-anim opacity-[0.12]">
            <Printer className="w-32 h-32 sm:w-40 sm:h-40" strokeWidth={1.5} />
          </div>

          <div className="flex flex-col sm:flex-row items-center sm:items-center gap-6 relative z-10">
            {/* Avatar */}
            <div className="relative group">
              <input type="file" accept="image/*" id="photo-upload" className="hidden" onChange={handlePhotoUpload} disabled={isUploadingPhoto} />
              <Avatar className="w-24 h-24 sm:w-28 sm:h-28 border-4 border-white/30 shadow-2xl ring-4 ring-white/10 cursor-pointer" onClick={() => document.getElementById("photo-upload")?.click()}>
                {photoUrl ? (
                  <img src={photoUrl} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <AvatarFallback className="text-3xl sm:text-4xl font-black text-white" style={{ background: "rgba(255,255,255,0.15)" }}>
                    {initials}
                  </AvatarFallback>
                )}
              </Avatar>

            </div>

            {/* Info */}
            <div className="flex-1 text-center sm:text-left">
              <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight drop-shadow" style={{ fontFamily: "'Helvetica Neue', 'Helvetica', 'Arial', sans-serif" }}>{name || "—"}</h2>
              <p className="text-blue-200 text-sm sm:text-base font-medium mt-0.5 mb-4">{email}</p>

              {/* Stats row */}
              <div className="flex justify-center sm:justify-start gap-2 sm:gap-3 w-full">
                <div className="glass-card rounded-xl px-2 sm:px-4 py-2 text-center flex-1 sm:flex-none min-w-0">
                  <div className="text-lg sm:text-xl font-black text-white truncate">{mimoCoinsInfo.balance}</div>
                  <div className="text-[9px] sm:text-[10px] text-blue-200 font-semibold uppercase tracking-wider truncate">Mimo Coins</div>
                </div>
                <div className="glass-card rounded-xl px-2 sm:px-4 py-2 text-center flex-1 sm:flex-none min-w-0">
                  <div className="text-lg sm:text-xl font-black text-white truncate">{printHistory.length}</div>
                  <div className="text-[9px] sm:text-[10px] text-blue-200 font-semibold uppercase tracking-wider truncate">Print Jobs</div>
                </div>
                <div className="glass-card rounded-xl px-2 sm:px-4 py-2 text-center flex-1 sm:flex-none min-w-0">
                  <div className="text-lg sm:text-xl font-black text-white truncate">₹{(mimoCoinsInfo.balance * 0.5).toFixed(0)}</div>
                  <div className="text-[9px] sm:text-[10px] text-blue-200 font-semibold uppercase tracking-wider truncate">Coin Value</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Main Layout: Sidebar Nav + Content ── */}
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">

          {/* Sidebar Navigation */}
          <div className="sm:w-52 shrink-0">
            <nav className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden p-2 flex sm:flex-col flex-row flex-wrap gap-1">
              {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
                const isActive = activeTab === id;
                return (
                  <button
                    key={id}
                    onClick={() => setSearchParams({ tab: id })}
                    className={`flex items-center justify-center sm:justify-start gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer flex-1 sm:flex-none w-auto sm:w-full text-center sm:text-left
                      ${isActive
                        ? "nav-item-active"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : "text-slate-400"}`} strokeWidth={isActive ? 2.5 : 2} />
                    <span className="hidden sm:inline">{label}</span>
                    {isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto hidden sm:block" strokeWidth={2.5} />}
                  </button>
                );
              })}
            </nav>

            {/* Log Out (desktop sidebar) */}
            <button
              onClick={() => {
                localStorage.removeItem("mimo_user_name");
                localStorage.removeItem("jwtToken");
                sessionStorage.removeItem("jwtToken");
                localStorage.removeItem("isAuthenticated");
                navigate("/login");
              }}
              className="hidden sm:flex mt-3 w-full items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-red-500 hover:bg-red-50 hover:text-red-600 transition-all duration-200 cursor-pointer border border-red-100 bg-white shadow-sm"
            >
              <LogOut className="w-4 h-4 shrink-0" strokeWidth={2} />
              Log Out
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 min-w-0">

            {/* ─ Personal Info ─ */}
            {activeTab === "personal" && (
              <Card className="border border-slate-100 shadow-sm bg-white rounded-2xl">
                <CardContent className="p-4 sm:p-6">
                  <h2 className="text-lg font-bold text-slate-900 mb-3 leading-tight">Personal Information</h2>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Full Name</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                        <Input
                          id="name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="pl-10 pr-10 bg-gray-50 border-gray-200"
                        />
                        <Pencil className="absolute right-3 top-3 w-4 h-4 text-slate-400/70 pointer-events-none" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                        <Input
                          id="email"
                          type="email"
                          value={email}
                          readOnly
                          className="pl-10 bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed"
                        />
                      </div>
                      <p className="text-xs text-slate-400">Email cannot be changed</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                        <Input
                          id="phone"
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className="pl-10 pr-10 bg-gray-50 border-gray-200"
                        />
                        <Pencil className="absolute right-3 top-3 w-4 h-4 text-slate-400/70 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 mt-5">
                    <Button onClick={handleSaveProfile} className="flex-1 bg-gradient-to-r from-[#093765] to-blue-700 hover:from-[#052345] hover:to-blue-800 text-white shadow-lg shadow-blue-900/20 rounded-xl transition-all duration-200">
                      <Save className="w-4 h-4 mr-2" />
                      Save Changes
                    </Button>
                    <Button variant="outline" className="sm:hidden flex-1 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300 transition-all shadow-sm rounded-xl"
                      onClick={() => {
                        localStorage.removeItem("mimo_user_name");
                        localStorage.removeItem("jwtToken");
                        sessionStorage.removeItem("jwtToken");
                        localStorage.removeItem("isAuthenticated");
                        navigate("/login");
                      }}>
                      <LogOut className="w-4 h-4 mr-2" />
                      Log Out
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ─ Mimo Coins ─ */}
            {activeTab === "mimo-coins" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 px-1 mb-1">
                  <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center">
                    <Gift className="w-5 h-5 text-violet-600" />
                  </div>
                  <h2 className="text-lg font-bold text-slate-900">MIMO Coins</h2>
                </div>
                {/* Balance Hero */}
                <div className="coin-card rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden shadow-xl shadow-violet-900/20">
                  <div className="absolute -top-10 -right-10 w-44 h-44 bg-white/5 rounded-full pointer-events-none" />
                  <div className="relative z-10 flex flex-col sm:flex-row items-center gap-6">
                    <div className="w-20 h-20 bg-white/15 rounded-2xl flex items-center justify-center shrink-0 border border-white/20">
                      <Gift className="w-10 h-10 text-white" />
                    </div>
                    <div className="text-center sm:text-left">
                      <p className="text-purple-200 text-sm font-semibold uppercase tracking-widest mb-1">Current Balance</p>
                      <h2 className="text-5xl font-black tracking-tight">{mimoCoinsInfo.balance}</h2>
                      <p className="text-purple-200 text-sm mt-1 font-medium">≈ ₹{(mimoCoinsInfo.balance * 0.5).toFixed(2)} in discounts</p>
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4">
                  <Card className="border-0 shadow-sm bg-white rounded-2xl">
                    <CardContent className="p-5 flex items-center gap-4">
                      <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
                        <TrendingUp className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <div className="text-2xl font-black text-emerald-600">{mimoCoinsInfo.totalEarned}</div>
                        <div className="text-xs text-slate-500 font-medium">Total Earned</div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-sm bg-white rounded-2xl">
                    <CardContent className="p-5 flex items-center gap-4">
                      <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                        <TrendingDown className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="text-2xl font-black text-blue-600">{mimoCoinsInfo.totalUsed}</div>
                        <div className="text-xs text-slate-500 font-medium">Total Used</div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* How to Earn */}
                <Card className="border-0 shadow-sm bg-white rounded-2xl">
                  <div className="px-6 pt-5 pb-0 border-b border-slate-100">
                    <h3 className="font-bold text-slate-900 text-sm pb-1">How to Earn Mimo Coins</h3>
                  </div>
                  <CardContent className="p-5 pt-0 -mt-2.5 space-y-3">
                    {[
                      { label: "Earn 1 coin for any print job above", highlight: "₹10" },
                      { label: "Use coins for up to", highlight: "50% discount" },
                      { label: "1 coin", highlight: "= ₹0.5 discount" },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-black text-violet-700">{i + 1}</span>
                        </div>
                        <p className="text-sm text-slate-700 font-medium">{item.label} <span className="font-black text-violet-700">{item.highlight}</span></p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* History */}
                <Card className="border-0 shadow-sm bg-white rounded-2xl overflow-hidden">
                  <div className="px-6 pt-5 pb-3 border-b border-slate-100">
                    <h3 className="font-bold text-slate-900 text-sm">Transaction History</h3>
                  </div>
                  <CardContent className="p-0">
                    {mimoCoinsInfo.history.length === 0 ? (
                      <div className="text-center py-12">
                        <Gift className="w-12 h-12 mx-auto text-slate-200 mb-3" />
                        <p className="text-sm text-slate-400 font-medium">No transactions yet</p>
                        <p className="text-xs text-slate-300 mt-1">Start printing to earn coins!</p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                            <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider">Transaction</TableHead>
                            <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider">Date</TableHead>
                            <TableHead className="text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {mimoCoinsInfo.history.map((record: any) => (
                            <TableRow key={record.id} className="hover:bg-slate-50/60">
                              <TableCell>
                                <div className="font-semibold text-sm text-slate-900">{record.description}</div>
                                <div className="text-xs text-slate-400 font-mono">{record.id}</div>
                              </TableCell>
                              <TableCell className="text-sm text-slate-500">{record.date}</TableCell>
                              <TableCell className={`text-right font-black text-sm ${record.type === 'earned' ? 'text-emerald-600' : 'text-blue-600'}`}>
                                {record.type === 'earned' ? '+' : '-'}{record.amount}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ─ Print History ─ */}
            {activeTab === "activity" && (
              <Card className="border-0 shadow-sm bg-white rounded-2xl overflow-hidden">
                <div className="px-6 pt-6 pb-0 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-slate-600" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900">Print History</h2>
                      <p className="text-xs text-slate-500 mt-0.5">{printHistory.length} job{printHistory.length !== 1 ? "s" : ""} total</p>
                    </div>
                  </div>
                </div>
                <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-4">
                  {printHistory.length === 0 ? (
                    <div className="text-center py-12">
                      <Printer className="w-12 h-12 mx-auto text-slate-200 mb-3" />
                      <p className="text-sm text-slate-400 font-medium">No print jobs yet</p>
                    </div>
                  ) : (
                    printHistory.map((job) => (
                      <div key={job.id} className="border border-slate-200 bg-slate-50/30 shadow-sm rounded-xl p-4 hover:border-blue-200 hover:bg-blue-50/20 transition-all duration-200">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <div className="w-8 h-8 bg-emerald-50 rounded-full flex items-center justify-center shrink-0">
                              <CheckCircle2 className={`w-4 h-4 ${job.status === 'failed' ? 'text-red-500' : 'text-emerald-500'}`} />
                            </div>
                            <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-0.5 text-xs font-mono font-semibold gap-1.5">
                              Code: {job.printCode || "----"}
                              <Copy className="w-3 h-3 cursor-pointer hover:text-blue-900 transition-colors" />
                            </Badge>
                            <Badge className={`${getStatusColor(job.status)} rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider`}>
                              {job.status}
                            </Badge>
                          </div>
                          <span className="font-black text-base text-slate-900 shrink-0">{job.cost}</span>
                        </div>
                        <p className="text-sm text-slate-700 font-medium ml-10 mb-1 truncate">{job.file}</p>
                        <div className="ml-10 flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                          <span>{job.pageCount || 1} {job.pageCount === 1 ? 'page' : 'pages'}</span>
                          <span className="w-1 h-1 rounded-full bg-slate-300" />
                          <span>{job.colorMode === "color" ? "Color" : "B&W"}</span>
                          <span className="w-1 h-1 rounded-full bg-slate-300" />
                          <span>{job.copies || 1} {job.copies === 1 ? 'copy' : 'copies'}</span>
                          <span className="w-1 h-1 rounded-full bg-slate-300" />
                          <span>{new Date(job.date).toLocaleDateString(undefined, {
                            day: 'numeric', month: 'short', year: 'numeric'
                          })}</span>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            )}

            {/* ─ Notifications ─ */}
            {activeTab === "notifications" && (
              <Card className="border border-slate-200 shadow-sm bg-white rounded-2xl overflow-hidden">
                <div className="px-6 py-3 border-b border-slate-200">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center">
                      <Bell className="w-5 h-5 text-amber-600" />
                    </div>
                    <h2 className="text-base font-bold text-slate-900">Notification Settings</h2>
                  </div>
                </div>
                <CardContent className="px-6 pb-6 pt-0">

                  {/* Notification Row Component */}
                  {[
                    { label: "Email Notifications", checked: emailNotifications, onChange: setEmailNotifications },
                    ...(emailNotifications ? [
                      { label: "Print Job Completed", checked: printCompleteNotif, onChange: setPrintCompleteNotif },
                    ] : []),
                    { label: "SMS Notifications", checked: smsNotifications, onChange: setSmsNotifications },
                    { label: "Marketing Emails", checked: marketingEmails, onChange: setMarketingEmails },
                  ].map((item, i, arr) => (
                    <div key={i}>
                      <div className={`flex items-center justify-between pb-3 ${i === 0 ? 'pt-0' : 'pt-3'}`}>
                        <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                        <Switch checked={item.checked} onCheckedChange={item.onChange} className="data-[state=checked]:bg-[#093765]" />
                      </div>
                      {i < arr.length - 1 && <Separator className="bg-slate-200" />}
                    </div>
                  ))}

                  <div className="pt-4">
                    <Button onClick={handleSaveProfile}
                      className="w-full h-11 bg-gradient-to-r from-[#093765] to-blue-700 hover:from-[#052345] hover:to-blue-800 text-white shadow-lg shadow-blue-900/20 rounded-xl font-semibold transition-all duration-200 active:scale-[0.98]">
                      <Save className="w-4 h-4 mr-2" />
                      Save Notification Settings
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
