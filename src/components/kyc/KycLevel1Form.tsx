import React, { useState } from "react";
import { FileText, Shield, Calendar } from "lucide-react";

interface Props {
  initialPan?: string;
  initialAadhaar?: string;
  initialDob?: string;
  onSubmit: (pan: string, aadhaar: string, dob: string) => Promise<void>;
}

const validatePan = (pan: string) => /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan);
const validateAadhaar = (a: string) => /^\d{12}$/.test(a);
const validateAge = (dob: string) => {
  if (!dob) return false;
  return (Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000) >= 18;
};

const KycLevel1Form: React.FC<Props> = ({ initialPan = "", initialAadhaar = "", initialDob = "", onSubmit }) => {
  const [pan, setPan] = useState(initialPan);
  const [aadhaar, setAadhaar] = useState(initialAadhaar);
  const [dob, setDob] = useState(initialDob);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const panUpper = pan.toUpperCase().trim();
    const aadhaarClean = aadhaar.replace(/\s/g, "").trim();

    if (!validatePan(panUpper)) { setError("Invalid PAN format. Expected: AAAAA9999A"); return; }
    if (!validateAadhaar(aadhaarClean)) { setError("Aadhaar must be 12 digits"); return; }
    if (!validateAge(dob)) { setError("You must be 18 or older"); return; }

    setSaving(true);
    try {
      await onSubmit(panUpper, aadhaarClean, dob);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch {
      setError("Failed to submit. Please try again.");
    }
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="font-mono text-[0.65rem] text-muted-foreground leading-relaxed">
        Level 1 requires PAN, Aadhaar, and age verification (18+). This allows deposits and small withdrawals.
      </p>

      <div>
        <label className="section-label mb-1.5 flex items-center gap-1.5">
          <FileText className="w-3 h-3" /> PAN Number
        </label>
        <input
          type="text"
          placeholder="ABCDE1234F"
          value={pan}
          onChange={(e) => setPan(e.target.value.toUpperCase())}
          className="stake-input uppercase"
          maxLength={10}
          required
        />
        <p className="font-mono text-[0.55rem] text-muted-foreground/60 mt-1">Format: AAAAA9999A</p>
      </div>

      <div>
        <label className="section-label mb-1.5 flex items-center gap-1.5">
          <Shield className="w-3 h-3" /> Aadhaar Number
        </label>
        <input
          type="text"
          placeholder="1234 5678 9012"
          value={aadhaar}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 12);
            setAadhaar(v.replace(/(\d{4})(?=\d)/g, "$1 ").trim());
          }}
          className="stake-input"
          maxLength={14}
          required
        />
        <p className="font-mono text-[0.55rem] text-muted-foreground/60 mt-1">12-digit Aadhaar number</p>
      </div>

      <div>
        <label className="section-label mb-1.5 flex items-center gap-1.5">
          <Calendar className="w-3 h-3" /> Date of Birth
        </label>
        <input
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          className="stake-input"
          max={new Date(Date.now() - 18 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]}
          required
        />
        <p className="font-mono text-[0.55rem] text-muted-foreground/60 mt-1">Must be 18+</p>
      </div>

      {error && <p className="font-mono text-[0.65rem] text-loss tracking-wider">{error}</p>}
      {success && <p className="font-mono text-[0.65rem] text-success tracking-wider">Level 1 KYC submitted ✓</p>}

      <button type="submit" disabled={saving} className="cta-place-bet">
        {saving ? "Submitting..." : "Submit Level 1 KYC"}
      </button>

      <p className="font-mono text-[0.55rem] text-muted-foreground/50 text-center">
        Your data is encrypted and stored securely.
      </p>
    </form>
  );
};

export default KycLevel1Form;
