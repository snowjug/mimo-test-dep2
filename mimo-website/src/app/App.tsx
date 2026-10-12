import { RouterProvider } from "react-router";
import { router } from "./routes";
import { Toaster } from "./components/ui/sonner";
import { TourProvider } from "./utils/tour-context";

export default function App() {
  return (
    <TourProvider>
      <RouterProvider router={router} />
      <Toaster />
    </TourProvider>
  );
}