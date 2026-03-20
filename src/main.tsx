import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { captureReferralParams } from "@/hooks/useAffiliateTracking";

// Capture referral/UTM params before React renders (must be before auth)
captureReferralParams();

createRoot(document.getElementById("root")!).render(<App />);
