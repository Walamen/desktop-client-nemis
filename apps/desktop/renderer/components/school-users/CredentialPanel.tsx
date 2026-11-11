"use client";

import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { Button, Card } from "@nemis-desktop/ui";

interface CredentialPanelProps {
  name: string;
  email: string;
  /** Shown here once and nowhere else: never logged, never stored past Done. */
  password: string;
  onDone: () => void;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="bg-white rounded-lg p-4 border border-gray-200">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <button
          type="button"
          aria-label={`Copy ${label.toLowerCase()}`}
          title="Copy"
          onClick={() => {
            void navigator.clipboard?.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="p-1 rounded text-gray-400 hover:text-gray-600 transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
      <div className="bg-gray-50 rounded p-3 break-all text-sm font-mono text-gray-700">{value}</div>
    </div>
  );
}

/** One-time sign-in details for a newly created office account. The page
 * keeps them in state only until Done. */
export function CredentialPanel({ name, email, password, onDone }: CredentialPanelProps) {
  return (
    <section aria-label="Sign-in details">
      <Card className="bg-success/5 border-success">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <KeyRound className="w-6 h-6 text-success shrink-0" />
            <p className="text-sm text-gray-700">
              Share these sign-in details with {name}. They are shown only once.
            </p>
          </div>
          <CopyField label="Email" value={email} />
          <CopyField label="Password" value={password} />
          <div className="flex justify-end pt-2">
            <Button variant="primary" onClick={onDone}>
              Done
            </Button>
          </div>
        </div>
      </Card>
    </section>
  );
}
