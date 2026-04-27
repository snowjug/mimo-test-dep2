import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { MimoCoinsDisplay } from "../components/mimo-coins-display";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Switch } from "../components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Separator } from "../components/ui/separator";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { User, Bell, CreditCard, Shield, Save, Printer } from "lucide-react";
import { toast } from "sonner";
import { ThemeToggle } from "../components/ui/theme-toggle";
import { MimoHeader } from "../components/mimo-header";

export function PrinterSettings() {
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [smsNotifications, setSmsNotifications] = useState(false);
  const [printCompleteNotif, setPrintCompleteNotif] = useState(true);
  const [marketingEmails, setMarketingEmails] = useState(false);
  const [defaultQuality, setDefaultQuality] = useState("standard");
  const [autoDelete, setAutoDelete] = useState(true);
  const navigate = useNavigate();

  const handleSaveSettings = () => {
    toast.success("Settings saved successfully!");
  };

  return (
    <div className="min-h-[100dvh] w-full bg-slate-50/50 p-3 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-4 sm:space-y-8">

        {/* Header */}
        <MimoHeader />

        <div className="flex flex-col gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-[#093765] to-blue-600 bg-clip-text text-transparent">Settings</h1>
          <p className="text-base sm:text-lg text-slate-500">Customize your MIMO experience</p>
        </div>

        {/* Settings Tabs */}
        <Tabs defaultValue="preferences" className="space-y-4">
          <div className="w-full overflow-x-auto custom-scrollbar -mx-3 px-3 sm:mx-0 sm:px-0 pb-2">
            <TabsList className="grid w-full grid-cols-5 bg-white/50 p-1 rounded-xl min-w-[500px]">
              <TabsTrigger value="preferences">Preferences</TabsTrigger>
              <TabsTrigger value="notifications">Notifications</TabsTrigger>
              <TabsTrigger value="payment">Payment</TabsTrigger>
              <TabsTrigger value="privacy">Privacy</TabsTrigger>
              <TabsTrigger value="appearance">Appearance</TabsTrigger>
            </TabsList>
          </div>

          {/* Preferences */}
          <TabsContent value="preferences">
            <Card className="border-0 shadow-md bg-white/80">
              <CardHeader>
                <CardTitle>Print Preferences</CardTitle>
                <CardDescription>Customize your default print settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="quality">Default Print Quality</Label>
                  <Select value={defaultQuality} onValueChange={setDefaultQuality}>
                    <SelectTrigger id="quality">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft (Faster, Less Ink)</SelectItem>
                      <SelectItem value="standard">Standard (Recommended)</SelectItem>
                      <SelectItem value="high">High Quality (Best Quality)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="paper-size">Default Paper Size</Label>
                  <Select defaultValue="a4">
                    <SelectTrigger id="paper-size">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="a4">A4 (210 x 297 mm)</SelectItem>
                      <SelectItem value="letter">Letter (8.5 x 11 in)</SelectItem>
                      <SelectItem value="legal">Legal (8.5 x 14 in)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="color">Default Color Mode</Label>
                  <Select defaultValue="bw">
                    <SelectTrigger id="color">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bw">Black & White</SelectItem>
                      <SelectItem value="color">Color</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="orientation">Default Orientation</Label>
                  <Select defaultValue="portrait">
                    <SelectTrigger id="orientation">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="portrait">Portrait</SelectItem>
                      <SelectItem value="landscape">Landscape</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="space-y-0.5">
                    <Label>Auto-Delete Files</Label>
                    <p className="text-sm text-gray-500">
                      Automatically delete uploaded files after printing
                    </p>
                  </div>
                  <Switch checked={autoDelete} onCheckedChange={setAutoDelete} />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="space-y-0.5">
                    <Label>Save Print History</Label>
                    <p className="text-sm text-gray-500">
                      Keep a record of your print jobs
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <Button onClick={handleSaveSettings} className="w-full bg-gradient-to-r from-[#093765] to-blue-700 hover:from-[#052345] hover:to-blue-800 text-white shadow-lg shadow-blue-900/20 transition-all duration-200">
                  <Save className="w-4 h-4 mr-2" />
                  Save Preferences
                </Button>
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

                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div className="space-y-0.5">
                            <Label>Code Expiry Reminders</Label>
                            <p className="text-sm text-gray-500">
                              Remind me before print codes expire
                            </p>
                          </div>
                          <Switch defaultChecked />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="text-sm font-medium mb-4">SMS Notifications</h4>

                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="space-y-0.5">
                        <Label>Enable SMS Notifications</Label>
                        <p className="text-sm text-gray-500">
                          Get text messages for important updates
                        </p>
                      </div>
                      <Switch
                        checked={smsNotifications}
                        onCheckedChange={setSmsNotifications}
                      />
                    </div>

                    {smsNotifications && (
                      <>
                        <Separator />
                        <div className="space-y-2">
                          <Label htmlFor="phone">Phone Number</Label>
                          <Input
                            id="phone"
                            type="tel"
                            placeholder="+91 98765 43210"
                          />
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

                <Button onClick={handleSaveSettings} className="w-full bg-gradient-to-r from-[#093765] to-blue-700 hover:from-[#052345] hover:to-blue-800 text-white shadow-lg shadow-blue-900/20 transition-all duration-200">
                  <Save className="w-4 h-4 mr-2" />
                  Save Notification Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payment Methods */}
          <TabsContent value="payment">
            <Card className="border-0 shadow-md bg-white/80">
              <CardHeader>
                <CardTitle>Payment Methods</CardTitle>
                <CardDescription>Manage your saved payment methods</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <Label>Saved Cards</Label>

                  {/* Sample saved card */}
                  <div className="border rounded-lg p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3"> {/* Updated gradient for card icon */}
                      <div className="w-12 h-12 bg-gradient-to-br from-[#093765] to-blue-600 rounded-lg flex items-center justify-center shadow-md">
                        <CreditCard className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <p className="font-medium">•••• •••• •••• 4242</p>
                        <p className="text-sm text-gray-500">Expires 12/26</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">
                      Remove
                    </Button>
                  </div>

                  <Button variant="outline" className="w-full">
                    <CreditCard className="w-4 h-4 mr-2" />
                    Add New Card
                  </Button>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="currency">Preferred Currency</Label>
                  <Select defaultValue="inr">
                    <SelectTrigger id="currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inr">INR (₹)</SelectItem>
                      <SelectItem value="usd">USD ($)</SelectItem>
                      <SelectItem value="eur">EUR (€)</SelectItem>
                      <SelectItem value="gbp">GBP (£)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="space-y-0.5">
                    <Label>Save Payment Methods</Label>
                    <p className="text-sm text-gray-500">
                      Securely save cards for faster checkout
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <Button onClick={handleSaveSettings} className="w-full bg-gradient-to-r from-[#093765] to-blue-700 hover:from-[#052345] hover:to-blue-800 text-white shadow-lg shadow-blue-900/20 transition-all duration-200">
                  <Save className="w-4 h-4 mr-2" />
                  Save Payment Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Privacy & Security */}
          <TabsContent value="privacy">
            <Card className="border-0 shadow-md bg-white/80">
              <CardHeader>
                <CardTitle>Privacy & Security</CardTitle>
                <CardDescription>Control your data and security preferences</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-3 p-4 bg-indigo-50 border border-indigo-100 rounded-lg">
                  <Shield className="w-5 h-5 text-indigo-600" />
                  <div>
                    <p className="text-sm font-medium">Account Security: Strong</p>
                    <p className="text-xs text-gray-600">Two-factor authentication enabled</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="retention">Data Retention</Label>
                  <Select defaultValue="30">
                    <SelectTrigger id="retention">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="90">90 days</SelectItem>
                      <SelectItem value="365">1 year</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">
                    Print history and uploaded files will be deleted after this period
                  </p>
                </div>

                <Separator />

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="space-y-0.5">
                    <Label>Profile Visibility</Label>
                    <p className="text-sm text-gray-500">
                      Show your profile to other users
                    </p>
                  </div>
                  <Switch />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="space-y-0.5">
                    <Label>Usage Analytics</Label>
                    <p className="text-sm text-gray-500">
                      Help improve MIMO by sharing usage data
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <Separator />

                <div className="space-y-3">
                  <Label>Account Actions</Label>
                  <Button variant="outline" className="w-full justify-start">
                    Download My Data
                  </Button>
                  <Button variant="outline" className="w-full justify-start text-red-600 hover:text-red-700">
                    Delete Account
                  </Button>
                </div>

                <Button onClick={handleSaveSettings} className="w-full bg-gradient-to-r from-[#093765] to-blue-700 hover:from-[#052345] hover:to-blue-800 text-white shadow-lg shadow-blue-900/20 transition-all duration-200">
                  <Save className="w-4 h-4 mr-2" />
                  Save Privacy Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Appearance */}
          <TabsContent value="appearance">
            <Card className="border-0 shadow-md bg-white/80">
              <CardHeader>
                <CardTitle>Appearance</CardTitle>
                <CardDescription>
                  Customize the look and feel of the application.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="space-y-0.5">
                    <Label>Theme</Label>
                    <p className="text-sm text-gray-500">
                      Select a light, dark, or system theme.
                    </p>
                  </div>
                  <ThemeToggle />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}