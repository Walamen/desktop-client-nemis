"use client";

import { Card, Button } from "@nemis-desktop/ui";
import { CopyButton } from "@/components/county/schools/registration/CopyButton";

const NO_LINK_NOTE =
  "User created. The activation link isn't available from this server — use Activation URL on the users list once it is.";

interface ActivationLinkDisplayProps {
  /** Built by the server; the desktop never sees the token on its own.
   * Null when the server created the user but sent no link (an older server). */
  activationUrl: string | null;
  email: string;
  userName: string;
  emailSent?: boolean;
  emailError?: string;
  onClose?: () => void;
}

/** portal-web ActivationTokenDisplay. The desktop shows only the server-built
 * activation URL (no token panel); the caller keeps the URL in page state only. */
export function ActivationLinkDisplay({
  activationUrl,
  email,
  userName,
  emailSent = true,
  emailError,
  onClose,
}: ActivationLinkDisplayProps) {
  return (
    <Card className="bg-success/5 border-success">
      <div className="space-y-4">
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            {emailSent ? (
              <svg className="w-6 h-6 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            ) : (
              <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            )}
          </div>
          <div className="flex-1">
            <h3 className={`text-lg font-semibold mb-1 ${emailSent ? "text-success" : "text-amber-600"}`}>
              User Created Successfully!
            </h3>
            {emailSent ? (
              <p className="text-sm text-gray-600">
                An activation email has been sent to <strong>{email}</strong>
              </p>
            ) : (
              <div className="space-y-1">
                <p className="text-sm text-amber-600 font-medium">
                  Email could not be sent - please share the activation link manually
                </p>
                <p className="text-sm text-gray-600">
                  User account for <strong>{email}</strong> was created successfully.
                </p>
                {emailError && <p className="text-xs text-gray-500">Error: {emailError}</p>}
              </div>
            )}
          </div>
        </div>

        {activationUrl === null ? (
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-sm text-gray-700">{NO_LINK_NOTE}</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">Activation URL</label>
                <CopyButton text={activationUrl} />
              </div>
              <div className="bg-gray-50 rounded p-3 break-all text-sm font-mono text-gray-700">{activationUrl}</div>
            </div>

            <div className="bg-amber-50 border border-amber-500 rounded-lg p-3">
              <div className="flex items-start space-x-2">
                <svg
                  className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <div className="text-sm text-gray-700">
                  <p className="font-medium text-amber-600 mb-1">Security Notice</p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>This activation link expires in 24 hours</li>
                    <li>Share this link securely with {userName}</li>
                    <li>The token can only be used once</li>
                    <li>Do not share this token publicly</li>
                  </ul>
                </div>
              </div>
            </div>
          </>
        )}

        {onClose && (
          <div className="flex justify-end pt-2">
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
