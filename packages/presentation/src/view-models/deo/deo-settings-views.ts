/** DEO Settings form rules; the web keeps the same in portal-web
 * lib/deo-settings.ts. The server's own rule is 8 characters minimum for
 * both passwords; the desktop's IPC also caps them at 128. */

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

export function settingsFormError(form: {
  firstName: string;
  lastName: string;
  currentPassword: string;
  newPassword: string;
}): string | null {
  if (!form.firstName.trim() || !form.lastName.trim()) return 'First and last name cannot be empty.';
  if (form.newPassword) {
    if (!form.newPassword.trim()) return 'The new password cannot be only spaces.';
    if (!form.currentPassword) return 'Enter your current password to change it.';
    if (form.currentPassword.length < MIN_PASSWORD_LENGTH) {
      return `The current password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (form.newPassword.length < MIN_PASSWORD_LENGTH) {
      return `The new password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (form.newPassword.length > MAX_PASSWORD_LENGTH || form.currentPassword.length > MAX_PASSWORD_LENGTH) {
      return `Passwords can be at most ${MAX_PASSWORD_LENGTH} characters.`;
    }
  }
  return null;
}
