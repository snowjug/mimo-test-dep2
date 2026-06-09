import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { MimoCoinsDisplay } from "./mimo-coins-display";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { HelpCircle, Printer, Upload, QrCode, FileCheck } from "lucide-react";
import api from "../api";

export function MimoHeader() {
  const navigate = useNavigate();
  const [name, setName] = useState(() => localStorage.getItem("mimo_user_name") || "Admin User");

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await api.get("/mimo/user");
        if (res.data.name) {
          setName(res.data.name);
          localStorage.setItem("mimo_user_name", res.data.name);
        }
      } catch (err) {
        console.error("Error fetching user in header", err);
      }
    };
    fetchUser();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'mimo_user_name' && e.newValue) {
        setName(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return (
    <>
      <div className="flex items-end justify-between border-b-[5px] border-[#194059] mb-0 pt-0.5 pb-0">
        <div className="flex items-end gap-2 cursor-pointer group overflow-hidden" onClick={() => navigate("/upload")}>
          <h1 
            className="text-4xl sm:text-5xl font-black text-[#194059] select-none m-0 translate-y-[3px] sm:translate-y-[4px]"
            style={{ fontFamily: "'Lovelo', sans-serif", lineHeight: "0.8" }}
          >
            MIMO
          </h1>
        </div>
      <div className="flex items-center gap-3 sm:gap-4 pb-1.5">
        
        <Dialog>
          <DialogTrigger asChild>
            <button 
              className="flex items-center justify-center w-10 h-10 cursor-pointer bg-blue-50 hover:bg-blue-100 rounded-full transition-all border border-blue-200 shadow-sm shrink-0"
              title="How to print?"
            >
              <svg 
                className="w-5 h-5 text-blue-600" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="3.5" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                <Printer className="w-6 h-6 text-blue-600" />
                How to use MIMO
              </DialogTitle>
              <DialogDescription className="text-base">
                Follow these simple steps to print your documents easily.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="flex gap-4 items-start">
                <div className="bg-blue-100 p-2 rounded-full shrink-0"><Upload className="w-5 h-5 text-blue-600" /></div>
                <div>
                  <h4 className="font-bold text-gray-900">1. Upload Files</h4>
                  <p className="text-sm text-gray-600">Select and upload the PDF or Image files you wish to print.</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <div className="bg-blue-100 p-2 rounded-full shrink-0"><FileCheck className="w-5 h-5 text-blue-600" /></div>
                <div>
                  <h4 className="font-bold text-gray-900">2. Configure Options</h4>
                  <p className="text-sm text-gray-600">Choose your print destination, color mode, sides, layout, and number of copies.</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <div className="bg-blue-100 p-2 rounded-full shrink-0"><QrCode className="w-5 h-5 text-blue-600" /></div>
                <div>
                  <h4 className="font-bold text-gray-900">3. Get Your Print Code</h4>
                  <p className="text-sm text-gray-600">After payment, a secure 4-digit code will be generated for your print job.</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <div className="bg-blue-100 p-2 rounded-full shrink-0"><Printer className="w-5 h-5 text-blue-600" /></div>
                <div>
                  <h4 className="font-bold text-gray-900">4. Print at Kiosk</h4>
                  <p className="text-sm text-gray-600">Go to the selected MIMO printer kiosk, enter your 4-digit code on the keypad, and collect your printed document!</p>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <MimoCoinsDisplay />
        <div 
          className="flex items-center gap-1 sm:gap-3 cursor-pointer p-1 sm:p-2 hover:bg-slate-200/50 rounded-xl transition-colors" 
            onClick={() => navigate("/user-profile")}
          >
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-gray-700">{name}</p>
            <p className="text-xs text-gray-500">View Profile</p>
          </div>
          <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
            <AvatarFallback className="bg-[#194059] text-white font-bold">
              {name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)}
            </AvatarFallback>
          </Avatar>
        </div>
        </div>
      </div>
    </>
  );
}
