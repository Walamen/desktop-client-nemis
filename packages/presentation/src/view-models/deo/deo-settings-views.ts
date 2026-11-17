/** DEO Settings form rules; the web keeps the same in portal-web
 * lib/deo-settings.ts. The server's own rule is 8 characters minimum. */

export const MIN_PASSWORD_LENGTH = 8;

export function settingsFormError(form: {
  firstName: string;
  lastName: string;
  currentPassword: string;
  newPassword: string;
}): string | null {
  if (!form.firstName.trim() || !form.lastName.trim()) return 'First and last name cannot be empty.';
  if (form.newPassword) {
    if (!form.currentPassword) return 'Enter your current password to change it.';
    if (form.newPassword.length < MIN_PASSWORD_LENGTH) {
      return `The new password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
  }
  return null;
}
