import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Switch } from "../components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Badge } from "../components/ui/badge";
import { Separator } from "../components/ui/separator";
import { MimoCoinsDisplay } from "../components/mimo-coins-display";
import { MimoHeader } from "../components/mimo-header";
import { User, Mail, Phone, Building, Save, Printer, Bell, FileText, Gift, Copy, CheckCircle2, LogOut } from "lucide-react";
import { toast } from "sonner";
import api from "../api";

export function UserProfile() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
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

        const historyRes = await api.get("/print-history");
        setPrintHistory(historyRes.data);

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

  return (
    <div className="min-h-[100dvh] w-full bg-slate-50/50 p-3 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-4 sm:space-y-8">

        {/* Header */}
        <MimoHeader />

        <div className="flex flex-col gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-[#093765] to-blue-600 bg-clip-text text-transparent">Account & Settings</h1>
          <p className="text-base sm:text-lg text-slate-500">Manage your profile, printing preferences, and account settings</p>
        </div>

        {/* Profile Header */}
        <Card className="border-0 shadow-lg bg-gradient-to-br from-[#093765] to-blue-600 text-white overflow-hidden relative group">
          <div className="absolute top-0 right-0 p-4 sm:p-8 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
            <Printer className="w-32 h-32 md:w-48 md:h-48 rotate-12" />
          </div>
          <CardContent className="p-6 sm:p-8 relative z-10">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-8">
              <Avatar className="w-24 h-24 sm:w-32 sm:h-32 border-4 border-white shadow-xl flex-shrink-0">
                <AvatarFallback className="text-3xl sm:text-4xl bg-gradient-to-br from-[#093765] to-blue-600 text-white font-bold">
                  {name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 flex flex-col items-center sm:items-start text-center sm:text-left mt-0 sm:mt-2">
                <h2 className="text-2xl sm:text-3xl font-bold mb-1">{name}</h2>
                <p className="text-blue-100/90 text-sm sm:text-base mb-4">{email}</p>
                

                <Button variant="outline" className="w-full sm:w-auto bg-white/10 hover:bg-white/20 border-white/20 text-white hover:text-white transition-all shadow-sm relative z-20">
                  <User className="w-4 h-4 mr-2" />
                  Change Photo
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Profile Tabs */}
            <Tabs
          value={searchParams.get("tab") || "personal"}
          onValueChange={(val) => setSearchParams({ tab: val })}
          className="space-y-4 sm:space-y-6"
        >
          <div className="w-full">
            <TabsList className="flex flex-wrap w-full bg-white/50 p-1 rounded-xl h-auto justify-center sm:justify-start gap-1">
              <TabsTrigger className="flex-1 min-w-[120px] px-2 sm:px-6" value="personal">Personal Info</TabsTrigger>
              <TabsTrigger className="flex-1 min-w-[120px] px-2 sm:px-6" value="mimo-coins">
                <Gift className="w-4 h-4 mr-1 sm:mr-2 inline-block" />
                Mimo Coins
              </TabsTrigger>
              <TabsTrigger className="flex-1 min-w-[120px] px-2 sm:px-6" value="activity">Activity</TabsTrigger>
              <TabsTrigger className="flex-1 min-w-[120px] px-2 sm:px-6" value="notifications">Notifications</TabsTrigger>
            </TabsList>
          </div>

          {/* Personal Information */}
          <TabsContent value="personal">
            <Card className="border-0 shadow-md bg-white/80">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle>Personal Information</CardTitle>
                <CardDescription>Update your personal details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 sm:space-y-6 p-4 sm:p-6 pt-0 sm:pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 w-4 h-4 text-indigo-400" />
                      <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="pl-10 bg-gray-50 border-gray-200"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 w-4 h-4 text-indigo-400" />
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10 bg-gray-50 border-gray-200"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-3 w-4 h-4 text-indigo-400" />
                      <Input
                        id="phone"
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="pl-10 bg-gray-50 border-gray-200"
                      />
                    </div>
                  </div>

                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <Button onClick={handleSaveProfile} className="flex-1 bg-gradient-to-r from-[#093765] to-blue-700 hover:from-[#052345] hover:to-blue-800 text-white shadow-lg shadow-blue-900/20 transition-all duration-200">
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </Button>
                  <Button variant="outline" onClick={() => {
                    localStorage.removeItem("mimo_user_name");
                    navigate("/login");
                  }} className="flex-1 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300 transition-all shadow-sm">
                    <LogOut className="w-4 h-4 mr-2" />
                    Log Out
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Activity Log */}
          <TabsContent value="activity">
            <Card className="border-0 shadow-md bg-white/80">
              <CardHeader>
                <CardTitle>Print History</CardTitle>
                <CardDescription>View details and costs of your past print jobs</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {printHistory.map((job) => (
                    <div key={job.id} className="bg-white border border-slate-200 rounded-xl p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          <div className="flex items-center text-blue-600 bg-blue-50 border border-blue-200 rounded-md px-2 py-0.5 text-xs font-mono font-medium tracking-tight">
                            Mimo Code: {job.printCode || "----"}
                            <Copy className="w-3.5 h-3.5 ml-2 cursor-pointer opacity-70 hover:opacity-100" />
                          </div>
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0 rounded-full px-2.5 py-0 text-[10px] sm:text-xs">
                            {job.status}
                          </Badge>
                        </div>
                        <div className="font-bold text-lg text-slate-900">
                          {job.cost}
                        </div>
                      </div>
                      <div className="pl-8 text-sm">
                        <p className="text-slate-700 mb-1.5">{job.file}</p>
                        <p className="text-slate-500 text-xs sm:text-sm mb-1.5">
                          {job.details?.split('•')[0]?.trim() || "0 pages"} &nbsp;&nbsp; 
                          {job.details?.split('•')[1]?.trim() || "B&W"} &nbsp;&nbsp; 
                          {job.copies || 1} {job.copies === 1 ? 'copy' : 'copies'}
                        </p>
                        <p className="text-slate-400 text-xs">{job.date}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Mimo Coins */}
          <TabsContent value="mimo-coins">
            <div className="bg-[#fcfaff] rounded-xl border border-purple-50 shadow-sm p-4 sm:p-8 flex flex-col items-center w-full">
              <div className="w-16 h-16 bg-[#f4ebff] rounded-full flex items-center justify-center mb-4">
                <Gift className="w-8 h-8 text-purple-600" />
              </div>
              <h2 className="text-3xl font-bold text-purple-950 mb-1">{mimoCoinsInfo.balance} Mimo Coins</h2>
              <p className="text-purple-700 mb-8 font-medium">Worth ₹{(mimoCoinsInfo.balance * 0.5).toFixed(2)} in discounts</p>

              <div className="grid grid-cols-2 gap-4 w-full mb-6">
                <div className="bg-white rounded-xl py-6 text-center border border-purple-100 shadow-sm">
                  <div className="text-2xl font-bold text-green-600 mb-1">{mimoCoinsInfo.totalEarned}</div>
                  <div className="text-sm text-slate-600">Total Coins Earned</div>
                </div>
                <div className="bg-white rounded-xl py-6 text-center border border-purple-100 shadow-sm">
                  <div className="text-2xl font-bold text-blue-600 mb-1">{mimoCoinsInfo.totalUsed}</div>
                  <div className="text-sm text-slate-600">Total Coins Used</div>
                </div>
              </div>

              <div className="bg-[#f4ecfe] rounded-xl p-6 border border-[#eaddfc] w-full text-left">
                <h3 className="font-semibold text-purple-950 mb-4">How to Earn Mimo Coins:</h3>
                <ul className="space-y-3 text-purple-900 text-sm font-medium">
                  <li className="flex items-start gap-2">
                    <span className="shrink-0 mt-1.5 w-1 h-1 rounded-full bg-purple-600"></span>
                    <span>Earn <strong>1 coin</strong> for any print job above <strong>₹10</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="shrink-0 mt-1.5 w-1 h-1 rounded-full bg-purple-600"></span>
                    <span>Use coins for up to <strong>50% discount</strong> on prints</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="shrink-0 mt-1.5 w-1 h-1 rounded-full bg-purple-600"></span>
                    <span><strong>1 coin = ₹0.5</strong> discount (2 coins = ₹1)</span>
                  </li>
                </ul>
              </div>
            </div>

            <Card className="border-0 shadow-md bg-white/80 mt-6">
              <CardHeader>
                <CardTitle>Mimo Coins History</CardTitle>
              </CardHeader>
              <CardContent>
                {mimoCoinsInfo.history.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Gift className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                    <p>No coin history yet. Start printing to earn coins!</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Transaction</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mimoCoinsInfo.history.map((record: any) => (
                        <TableRow key={record.id}>
                          <TableCell>
                            <div className="font-medium text-sm text-gray-900">{record.description}</div>
                            <div className="text-xs text-gray-500">{record.id}</div>
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">{record.date}</TableCell>
                          <TableCell className={`text-right font-medium ${record.type === 'earned' ? 'text-green-600' : 'text-blue-600'}`}>
                            {record.type === 'earned' ? '+' : '-'}{record.amount}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications */}
          <TabsContent value="notifications">
            <Card className="border-0 shadow-md bg-white/80">
              <CardHeader>
                <CardTitle>Notification Settings</CardTitle>
                <CardDescription>Choose how you want to be notified</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="text-sm font-medium mb-4 flex items-center gap-2">
                    <Bell className="w-4 h-4" />
                    Email Notifications
                  </h4>

                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="space-y-0.5">
                        <Label>Enable Email Notifications</Label>
                        <p className="text-sm text-gray-500">
                          Receive updates via email
                        </p>
                      </div>
                      <Switch
                        checked={emailNotifications}
                        onCheckedChange={setEmailNotifications}
                      />
                    </div>

                    {emailNotifications && (
                      <>
                        <Separator />
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div className="space-y-0.5">
                            <Label>Print Job Completed</Label>
                            <p className="text-sm text-gray-500">
                              Get notified when your print is ready
                            </p>
                          </div>
                          <Switch
                            checked={printCompleteNotif}
                            onCheckedChange={setPrintCompleteNotif}
                          />
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div className="space-y-0.5">
                            <Label>Payment Receipts</Label>
                            <p className="text-sm text-gray-500">
                              Receive payment confirmations
                            </p>
                          </div>
                          <Switch defaultChecked />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="space-y-0.5">
                    <Label>Marketing Emails</Label>
                    <p className="text-sm text-gray-500">
                      Receive news and promotional offers
                    </p>
                  </div>
                  <Switch
                    checked={marketingEmails}
                    onCheckedChange={setMarketingEmails}
                  />
                </div>

                <Button onClick={handleSaveProfile} className="w-full bg-gradient-to-r from-[#093765] to-blue-700 hover:from-[#052345] hover:to-blue-800 text-white shadow-lg shadow-blue-900/20 transition-all duration-200">
                  <Save className="w-4 h-4 mr-2" />
                  Save Notification Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
      </div>
    </div>
  );
}
