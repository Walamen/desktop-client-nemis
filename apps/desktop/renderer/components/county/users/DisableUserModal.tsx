"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "@nemis-desktop/ui";

const CONFIRM_PHRASE = "DISABLE";

interface DisableUserModalProps {
  userName: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

/** portal-web county/users DisableUserModal: type DISABLE to confirm. */
export function DisableUserModal({ userName, onClose, onConfirm }: DisableUserModalProps) {
  const [phrase, setPhrase] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const isConfirmed = phrase.trim() === CONFIRM_PHRASE;

  const handleConfirm = async () => {
    if (!isConfirmed) return;
    setIsLoading(true);
    try {
      await onConfirm();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={isLoading ? () => {} : onClose} title="">
      {/* Header */}
      <div className="flex flex-col items-center text-center pt-2 pb-4">
        <div className="w-14 h-14 bg-red-100 flex items-center justify-center mb-4">
          <AlertTriangle className="w-7 h-7 text-red-600" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Disable User Account</h2>
        <p className="text-sm text-slate-500 mt-1">
          You are about to disable <span className="font-semibold text-slate-800">{userName}</span>
        </p>
      </div>

      {/* Warning block */}
      <div className="bg-red-50 border border-red-200 p-4 mb-5 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-red-700 mb-2">What this means</p>
        <ul className="space-y-1.5">
          {[
            "This user will immediately lose access to their portal.",
            "They will not be able to log in until the account is re-enabled.",
            "All existing assignments and data are preserved.",
            "You can reverse this at any time by enabling the account again.",
          ].map((line) => (
            <li key={line} className="flex items-start gap-2 text-sm text-red-800">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
              {line}
            </li>
          ))}
        </ul>
      </div>

      {/* Confirmation input */}
      <div className="space-y-2 mb-6">
        <label className="block text-sm font-semibold text-slate-700">
          Type{" "}
          <span className="font-bold tracking-widest text-slate-900 bg-slate-100 px-1.5 py-0.5">
            {CONFIRM_PHRASE}
          </span>{" "}
          to confirm
        </label>
        <input
          type="text"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          placeholder={CONFIRM_PHRASE}
          disabled={isLoading}
          autoFocus
          className={`w-full px-4 py-2.5 text-sm border font-mono tracking-widest outline-none transition-colors
            ${
              isConfirmed
                ? "border-red-400 bg-red-50 text-red-800 focus:ring-1 focus:ring-red-400"
                : "border-slate-300 text-slate-800 focus:ring-1 focus:ring-slate-400"
            }
            disabled:opacity-50 disabled:cursor-not-allowed`}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={onClose}
          disabled={isLoading}
          className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-300 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void handleConfirm()}
          disabled={!isConfirmed || isLoading}
          className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Disabling…
            </>
          ) : (
            "Disable Account"
          )}
        </button>
      </div>
    </Modal>
  );
}
