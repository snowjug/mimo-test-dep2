import { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Printer, Mail, Lock, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "../api";

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await api.post("/login", { email, password });
      const { jwtToken } = response.data;

      localStorage.setItem("jwtToken", jwtToken);
      
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
    <div className="min-h-[100dvh] w-full flex items-center justify-center p-4 sm:p-6 bg-gradient-to-br from-blue-100 to-white relative overflow-hidden">
      {/* Background shapes */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-300/30 blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/10 blur-[120px]" />

      <div className="w-full max-w-md space-y-6 sm:space-y-8 relative z-10">
        {/* Logo and Title - Centered above card */}
        <div className="text-center space-y-2 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl shadow-2xl mb-4 transform transition-all hover:scale-110 hover:rotate-3 duration-300">
            <Printer className="w-8 h-8 text-[#093765]" />
          </div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#093765] to-blue-600 tracking-tight">
            Sign in to MIMO
          </h1>
        </div>
        {/* Login Card - Simplified */}
        <Card className="border-0 shadow-2xl bg-white/90 backdrop-blur-xl transition-all duration-300 hover:shadow-indigo-500/20 animate-in fade-in zoom-in-95 duration-500">
          <CardHeader className="space-y-1 pb-4 sm:pb-6 pt-6 sm:pt-6 px-4 sm:px-6">
            <CardTitle className="text-xl font-bold text-center text-gray-900">Welcome Back</CardTitle>
            <CardDescription className="text-center text-gray-500">
              Enter your credentials to access your account
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-6 sm:pb-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-gray-700 font-medium">Email</Label>
                <div className="relative group">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-11 border-gray-200 bg-gray-50/50 focus:bg-white transition-all duration-200 focus:scale-[1.01] focus:border-indigo-500 focus:ring-indigo-500/20"
                    disabled={loading}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-gray-700 font-medium">Password</Label>
                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 h-11 border-gray-200 bg-gray-50/50 focus:bg-white transition-all duration-200 focus:scale-[1.01] focus:border-indigo-500 focus:ring-indigo-500/20"
                    disabled={loading}
                    required
                  />
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input type="checkbox" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 transition-all" />
                  <span className="text-gray-600 group-hover:text-gray-900 transition-colors">Remember me</span>
                </label>
                <a href="#" className="text-indigo-600 hover:text-indigo-700 font-semibold hover:underline transition-all">
                  Forgot password?
                </a>
              </div>
              <Button type="submit" className="w-full h-11 bg-gradient-to-r from-[#093765] to-blue-700 hover:from-[#052345] hover:to-blue-800 text-white shadow-lg shadow-blue-900/20 hover:-translate-y-0.5 transition-all duration-300 font-semibold" disabled={loading}>
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Sign In <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-gray-500 font-medium">Or continue with</span>
              </div>
            </div>

            <div className="mt-6 flex justify-center">
              <GoogleLogin
                onSuccess={async (credentialResponse) => {
                  try {
                    setLoading(true);
                    const res = await api.post("/google-login", {
                      token: credentialResponse.credential,
                    });
                    localStorage.setItem("jwtToken", res.data.jwtToken);
                    
                    if (res.data.name) {
                      localStorage.setItem("mimo_user_name", res.data.name);
                      toast.success("Signed in with Google!");
                      navigate("/upload");
                    } else {
                      toast.success("Signed in with Google!");
                      navigate("/onboarding");
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
              />
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-gray-500">
          Don't have an account?{" "}
          <Link to="/register" className="text-indigo-600 hover:text-indigo-700 font-bold">
            Sign Up
          </Link>
        </p>

        <div className="text-center text-xs text-slate-400 space-y-2 mt-8 pb-4">
          <p className="font-bold text-slate-700 uppercase tracking-wide">Vision Printt Technologies</p>
          <p>REVA NEST, Rukmini Knowledge Park<br/>Kattegenahalli, Yelahanka, Bengaluru - 560064</p>
          <div className="flex items-center justify-center gap-4 mt-2">
            <span>🆘 Support: +91 8123028797</span>
            <span>🕐 Mon-Fri: 9AM-6PM IST</span>
          </div>
          <p className="pt-2 border-t border-slate-200/50 mt-2 w-3/4 mx-auto">
            © 2026 VASUDEVA VISHAL (Vision Printt Technologies). All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}