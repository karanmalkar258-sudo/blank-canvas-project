import React, { useState, useRef } from "react";
import { Upload, Camera, FileText, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DocType, KycDocument } from "@/hooks/useKyc";

interface Props {
  documents: KycDocument[];
  uploading: boolean;
  onUpload: (docType: DocType, file: File) => Promise<void>;
  onSubmitLevel2: () => Promise<void>;
}

const DOC_TYPES: { type: DocType; label: string; icon: React.ReactNode; description: string }[] = [
  { type: "aadhaar",         label: "Aadhaar Card",      icon: <FileText className="w-4 h-4" />, description: "Front & back of Aadhaar" },
  { type: "passport",        label: "Passport",          icon: <FileText className="w-4 h-4" />, description: "Photo page of passport" },
  { type: "driving_license", label: "Driving License",   icon: <FileText className="w-4 h-4" />, description: "Front of driving license" },
  { type: "address_proof",   label: "Address Proof",     icon: <FileText className="w-4 h-4" />, description: "Utility bill or bank statement (last 3 months)" },
  { type: "selfie",          label: "Selfie with ID",    icon: <Camera className="w-4 h-4" />,   description: "Clear photo holding your ID next to your face" },
];

const ACCEPTED = "image/jpeg,image/png,image/webp,application/pdf";

const KycLevel2Form: React.FC<Props> = ({ documents, uploading, onUpload, onSubmitLevel2 }) => {
  const [activeUpload, setActiveUpload] = useState<DocType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const getDocStatus = (type: DocType) => {
    const doc = documents.find((d) => d.doc_type === type);
    return doc ?? null;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeUpload) return;
    setError(null);

    if (file.size > 10 * 1024 * 1024) {
      setError("File must be under 10MB");
      return;
    }

    try {
      await onUpload(activeUpload, file);
    } catch {
      setError("Upload failed. Please try again.");
    }
    setActiveUpload(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const triggerUpload = (type: DocType) => {
    setActiveUpload(type);
    fileRef.current?.click();
  };

  // Need at least one ID doc + address proof + selfie for Level 2
  const hasIdDoc = documents.some((d) => ["aadhaar", "passport", "driving_license"].includes(d.doc_type));
  const hasAddress = documents.some((d) => d.doc_type === "address_proof");
  const hasSelfie = documents.some((d) => d.doc_type === "selfie");
  const canSubmit = hasIdDoc && hasAddress && hasSelfie;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmitLevel2();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch {
      setError("Submission failed. Please try again.");
    }
    setSubmitting(false);
  };

  return (
    <div className="space-y-4">
      <p className="font-mono text-[0.65rem] text-muted-foreground leading-relaxed">
        Level 2 requires identity document, address proof, and a selfie with ID. This unlocks full withdrawals and higher limits.
      </p>

      <input ref={fileRef} type="file" accept={ACCEPTED} onChange={handleFileSelect} className="hidden" />

      <div className="space-y-2">
        {DOC_TYPES.map(({ type, label, icon, description }) => {
          const doc = getDocStatus(type);
          const isRequired = type === "selfie" || type === "address_proof" || ["aadhaar", "passport", "driving_license"].includes(type);

          return (
            <div key={type} className="bg-surface-raised border border-border rounded p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className={cn(
                  "w-8 h-8 rounded flex items-center justify-center flex-shrink-0",
                  doc?.status === "approved" ? "bg-success/20 text-success"
                    : doc?.status === "rejected" ? "bg-loss/20 text-loss"
                    : doc ? "bg-yellow/20 text-yellow"
                    : "bg-surface-card text-muted-foreground"
                )}>
                  {doc?.status === "approved" ? <CheckCircle2 className="w-4 h-4" />
                    : doc?.status === "rejected" ? <XCircle className="w-4 h-4" />
                    : icon}
                </div>
                <div className="min-w-0">
                  <p className="font-condensed font-600 text-sm text-foreground">
                    {label}
                    {type === "aadhaar" || type === "passport" || type === "driving_license"
                      ? <span className="font-mono text-[0.5rem] text-muted-foreground ml-1">(any one)</span>
                      : null
                    }
                  </p>
                  <p className="font-mono text-[0.55rem] text-muted-foreground truncate">{description}</p>
                  {doc?.status === "rejected" && doc.reject_reason && (
                    <p className="font-mono text-[0.55rem] text-loss mt-0.5">{doc.reject_reason}</p>
                  )}
                  {doc && (
                    <p className="font-mono text-[0.5rem] text-muted-foreground/60 mt-0.5">
                      {doc.file_name} · {doc.status.toUpperCase()}
                    </p>
                  )}
                </div>
              </div>

              <button
                onClick={() => triggerUpload(type)}
                disabled={uploading}
                className={cn(
                  "flex items-center gap-1 font-mono text-[0.6rem] tracking-wider uppercase px-2.5 py-1.5 rounded border transition-colors flex-shrink-0",
                  doc && doc.status !== "rejected"
                    ? "border-border text-muted-foreground hover:text-foreground hover:border-border"
                    : "border-blue/40 text-blue hover:bg-blue/10"
                )}
              >
                {uploading && activeUpload === type
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Upload className="w-3 h-3" />
                }
                {doc ? "Re-upload" : "Upload"}
              </button>
            </div>
          );
        })}
      </div>

      {!canSubmit && (
        <div className="font-mono text-[0.6rem] text-muted-foreground bg-surface-card border border-border rounded p-3 space-y-1">
          <p className="font-semibold text-foreground">Required for Level 2:</p>
          <p className={cn(hasIdDoc ? "text-success" : "text-muted-foreground")}>
            {hasIdDoc ? "✓" : "○"} At least one ID document (Aadhaar, Passport, or License)
          </p>
          <p className={cn(hasAddress ? "text-success" : "text-muted-foreground")}>
            {hasAddress ? "✓" : "○"} Address proof
          </p>
          <p className={cn(hasSelfie ? "text-success" : "text-muted-foreground")}>
            {hasSelfie ? "✓" : "○"} Selfie with ID
          </p>
        </div>
      )}

      {error && <p className="font-mono text-[0.65rem] text-loss tracking-wider">{error}</p>}
      {success && <p className="font-mono text-[0.65rem] text-success tracking-wider">Level 2 KYC submitted for review ✓</p>}

      <button onClick={handleSubmit} disabled={!canSubmit || submitting} className="cta-place-bet">
        {submitting ? "Submitting..." : "Submit Level 2 KYC"}
      </button>

      <p className="font-mono text-[0.55rem] text-muted-foreground/50 text-center">
        Documents are encrypted and reviewed within 24–48 hours. We never share your data.
      </p>
    </div>
  );
};

export default KycLevel2Form;
