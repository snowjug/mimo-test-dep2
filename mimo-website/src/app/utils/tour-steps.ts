// Step definitions for the interactive "How to print" walkthrough. Each step is anchored to a real,
// already-rendered page element via a `data-tour` attribute -- never a hardcoded screen coordinate -- so the
// overlay (tour-overlay.tsx) can recompute its position live as the layout, viewport or content changes.
export type TourStep = {
  id: string;
  /** The route this step's target element lives on. react-router pathname, exact match. */
  path: string;
  /** CSS selector for the real element to spotlight on that route. */
  selector: string;
  title: string;
  body: string;
};

export const TOUR_STEPS: TourStep[] = [
  {
    id: "upload",
    path: "/",
    selector: '[data-tour="upload-dropzone"]',
    title: "Upload your document",
    body: "Tap here to add a PDF, Word, PowerPoint, Excel, text file, or photo.",
  },
  {
    id: "upload-continue",
    path: "/",
    selector: '[data-tour="upload-continue"]',
    title: "Continue",
    body: "Once your files are ready, tap Continue to choose how they're printed.",
  },
  {
    id: "print-options",
    path: "/print-options",
    selector: '[data-tour="print-options-group"]',
    title: "Choose how you want it printed",
    body: "Pick the machine, copies, colour and sides.",
  },
  {
    id: "print-summary",
    path: "/print-options",
    selector: '[data-tour="print-options-summary"]',
    title: "Check your pages and total price",
    body: "The total updates live as you change your options above.",
  },
  {
    id: "payment",
    path: "/payment",
    selector: '[data-tour="payment-pay-button"]',
    title: "Complete your payment",
    body: "Tap Pay to finish. MIMO only confirms once your payment is verified — you'll never see a false success message.",
  },
  {
    id: "print-code",
    path: "/print-code",
    selector: '[data-tour="print-code-display"]',
    title: "Use this code at the MIMO machine",
    body: "Enter this code on the kiosk keypad and collect your prints.",
  },
];
