import type { PrincipalLogin } from "@nemis-desktop/types";
import { Card } from "@nemis-desktop/ui";
import { CopyButton } from "./CopyButton";

/** The login the server created for a school this device registered. The
 * password is the shared starting default kept on purpose during internal
 * testing; this card must go once accounts get real per-user passwords. */
export function PrincipalLoginCard({ login }: { login: PrincipalLogin }) {
  return (
    <Card>
      <h3 className="text-base font-semibold text-gray-900 mb-1">Principal Login</h3>
      <p className="text-sm text-gray-600 mb-4">
        Share this login with the principal. They can change the password from their dashboard.
      </p>
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-36 text-gray-500">Email</span>
          <span className="font-mono text-gray-800">{login.email}</span>
          <CopyButton text={login.email} />
        </div>
        <div className="flex items-center gap-2">
          <span className="w-36 text-gray-500">Default Password</span>
          <span className="font-mono text-gray-800">{login.password}</span>
          <CopyButton text={login.password} />
        </div>
      </div>
    </Card>
  );
}
