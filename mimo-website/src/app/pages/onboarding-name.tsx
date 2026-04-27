import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { User, ArrowRight, Loader2, Printer } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import api from "../api";

export function OnboardingName() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter your name");
      return;
    }

    setLoading(true);
    // Simulation delay for premium feel
    setTimeout(() => {
      localStorage.setItem("mimo_user_name", name.trim());
      localStorage.setItem("isAuthenticated", "true");
      toast.success(`Welcome to MIMO, ${name.trim()}!`);
      navigate("/upload");
      setLoading(false);
    }, 1000);
  };

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center p-4 sm:p-6 bg-gradient-to-br from-indigo-50 via-white to-blue-50 relative overflow-hidden">
      {/* Dynamic background elements */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.5 }}
        className="absolute inset-0 z-0"
      >
        <div className="absolute top-[-15%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-400/10 blur-[140px] animate-pulse" />
        <div className="absolute bottom-[-15%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[140px] animate-pulse" style={{ animationDelay: '1s' }} />
      </motion.div>

      <div className="w-full max-w-md relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-center space-y-4 sm:space-y-6"
        >
          {/* Logo Animation */}
          <motion.div
            initial={{ scale: 0.8, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{
              type: "spring",
              stiffness: 260,
              damping: 20,
              delay: 0.2
            }}
            className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-white rounded-3xl shadow-2xl mb-1 sm:mb-2 border border-white/50 group"
          >
            <Printer className="w-8 h-8 sm:w-10 sm:h-10 text-[#093765] transition-transform duration-500 group-hover:scale-110" />
          </motion.div>

          <div className="space-y-1 sm:space-y-2">
            <motion.h1
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-3xl sm:text-4xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-[#093765] via-blue-700 to-indigo-800"
            >
              One last thing!
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-slate-500 font-medium text-lg"
            >
              How should we address you?
            </motion.p>
          </div>

          <Card className="border-0 shadow-[0_20px_50px_rgba(0,0,0,0.1)] bg-white/80 backdrop-blur-2xl overflow-hidden mx-1 sm:mx-0">
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.7, duration: 0.8 }}
              className="h-1.5 w-full bg-gradient-to-r from-blue-500 to-indigo-600 origin-left"
            />
            <CardHeader className="pt-6 px-6 sm:pt-8 sm:px-8">
              <CardTitle className="text-xl sm:text-2xl font-bold text-[#093765]">Your Name</CardTitle>
              <CardDescription className="text-slate-500 text-xs sm:text-sm">
                This will be used for your profile and notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 sm:p-8 pt-0 sm:pt-4">
              <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
                <div className="space-y-2">
                  <div className="relative group">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-blue-500 transition-colors duration-300" />
                    <Input
                      id="name"
                      type="text"
                      placeholder="Enter your full name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="pl-12 h-12 sm:h-14 border-slate-200 bg-slate-50/50 focus:bg-white transition-all duration-300 text-base sm:text-lg rounded-xl sm:rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 shadow-sm"
                      disabled={loading}
                      autoFocus
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 sm:h-14 bg-[#093765] hover:bg-[#052345] text-white shadow-xl shadow-blue-900/20 rounded-xl sm:rounded-2xl text-base sm:text-lg font-bold group transition-all duration-300 active:scale-[0.98]"
                  disabled={loading}
                >
                  <AnimatePresence mode="wait">
                    {loading ? (
                      <motion.div
                        key="loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <Loader2 className="w-6 h-6 animate-spin" />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="label"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        className="flex items-center justify-center gap-2"
                      >
                        Get Started <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Button>
              </form>
            </CardContent>
          </Card>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="text-slate-400 text-sm font-medium"
          >
            You can always change this later in your profile settings.
          </motion.p>
        </motion.div>
      </div>
    </div>
  );
}
