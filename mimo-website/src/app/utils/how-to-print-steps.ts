import { CloudUpload, CreditCard, KeyRound, SlidersHorizontal, type LucideIcon } from "lucide-react";

// Content of the "How to print" guide. Four plain steps that describe the whole journey, in the order a customer
// lives it. The guide shows them as a self-contained card on whatever page the customer is on -- it does not point
// at buttons on other pages, so it can never end up waiting for an element that is not on screen.
export type GuideStep = {
  id: string;
  title: string;
  body: string;
  /** One short, practical hint shown under the body. */
  tip: string;
  icon: LucideIcon;
};

export const GUIDE_STEPS: GuideStep[] = [
  {
    id: "upload",
    title: "Upload your files",
    body: "Add what you want to print: PDF, Word, PowerPoint, Excel, text files or photos.",
    tip: "You can add several files at once.",
    icon: CloudUpload,
  },
  {
    id: "options",
    title: "Choose a machine and options",
    body: "Pick MIMO 1.0 or MIMO 2.0, then set the number of copies, sides and pages.",
    tip: "Colour printing is available on MIMO 2.0 only.",
    icon: SlidersHorizontal,
  },
  {
    id: "pay",
    title: "Pay securely",
    body: "Check your total, then pay with UPI. The price you see is the price you pay.",
    tip: "Your print code appears only after the payment is confirmed.",
    icon: CreditCard,
  },
  {
    id: "collect",
    title: "Enter your code at the machine",
    body: "Type your 4-digit code on the machine's keypad and collect your pages from the tray.",
    tip: "Black & white codes work on both MIMO 1.0 and MIMO 2.0. Colour codes work on MIMO 2.0.",
    icon: KeyRound,
  },
];
