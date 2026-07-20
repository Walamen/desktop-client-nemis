import Swal from "sweetalert2";

/**
 * Show a success notification modal
 * @param message - The success message to display
 * @param title - Optional title (defaults to "Success")
 */
export const showSuccess = (message: string, title: string = "Success") => {
  return Swal.fire({
    icon: "success",
    title,
    text: message,
    confirmButtonText: "OK",
    confirmButtonColor: "#10b981", // green-500
    customClass: {
      popup: "rounded-lg",
      confirmButton: "px-4 py-2 rounded-md font-medium",
    },
  });
};

/**
 * Show an error notification modal
 * @param message - The error message to display
 * @param title - Optional title (defaults to "Error")
 */
export const showError = (message: string, title: string = "Error") => {
  return Swal.fire({
    icon: "error",
    title,
    text: message,
    confirmButtonText: "OK",
    confirmButtonColor: "#ef4444", // red-500
    customClass: {
      popup: "rounded-lg",
      confirmButton: "px-4 py-2 rounded-md font-medium",
    },
  });
};

/**
 * Show a warning notification modal
 * @param message - The warning message to display
 * @param title - Optional title (defaults to "Warning")
 */
export const showWarning = (message: string, title: string = "Warning") => {
  return Swal.fire({
    icon: "warning",
    title,
    text: message,
    confirmButtonText: "OK",
    confirmButtonColor: "#f59e0b", // amber-500
    customClass: {
      popup: "rounded-lg",
      confirmButton: "px-4 py-2 rounded-md font-medium",
    },
  });
};

/**
 * Show an info notification modal
 * @param message - The info message to display
 * @param title - Optional title (defaults to "Information")
 */
export const showInfo = (message: string, title: string = "Information") => {
  return Swal.fire({
    icon: "info",
    title,
    text: message,
    confirmButtonText: "OK",
    confirmButtonColor: "#3b82f6", // blue-500
    customClass: {
      popup: "rounded-lg",
      confirmButton: "px-4 py-2 rounded-md font-medium",
    },
  });
};

/**
 * Show a confirmation dialog with Yes/No buttons
 * @param message - The confirmation message to display
 * @param title - Optional title (defaults to "Confirm Action")
 * @param confirmButtonText - Optional confirm button text (defaults to "Yes, proceed")
 * @param cancelButtonText - Optional cancel button text (defaults to "Cancel")
 * @returns Promise that resolves to true if confirmed, false if cancelled
 */
export const showConfirm = async (
  message: string,
  title: string = "Confirm Action",
  confirmButtonText: string = "Yes, proceed",
  cancelButtonText: string = "Cancel",
): Promise<boolean> => {
  const result = await Swal.fire({
    icon: "warning",
    title,
    text: message,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText,
    confirmButtonColor: "#ef4444", // red-500
    cancelButtonColor: "#6b7280", // gray-500
    customClass: {
      popup: "rounded-lg",
      confirmButton: "px-4 py-2 rounded-md font-medium",
      cancelButton: "px-4 py-2 rounded-md font-medium",
    },
  });
  return result.isConfirmed;
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return ch;
    }
  });

/**
 * Show a success modal displaying admin credentials with per-field copy buttons.
 * Used after a CEO creates a school and the admin account is auto-activated.
 */
export const showCredentials = (opts: {
  email: string;
  password: string;
  title?: string;
  confirmButtonText?: string;
}) => {
  const safeEmail = escapeHtml(opts.email);
  const safePassword = escapeHtml(opts.password);

  return Swal.fire({
    icon: "success",
    title: opts.title ?? "School Created Successfully",
    html: `
      <div style="text-align:left; font-size:14px;">
        <p style="margin:0 0 12px 0; color:#374151;">
          Share the following credentials with the school admin. They can update
          their profile and password from their dashboard.
        </p>
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
          <span style="min-width:80px; font-weight:600; color:#111827;">Email</span>
          <span id="cred-email" style="flex:1; padding:6px 10px; background:#f3f4f6; border-radius:6px; font-family:monospace; word-break:break-all;">${safeEmail}</span>
          <button type="button" id="copy-email" style="padding:6px 10px; background:#10b981; color:white; border:none; border-radius:6px; font-size:12px; font-weight:500; cursor:pointer;">Copy</button>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="min-width:80px; font-weight:600; color:#111827;">Password</span>
          <span id="cred-password" style="flex:1; padding:6px 10px; background:#f3f4f6; border-radius:6px; font-family:monospace;">${safePassword}</span>
          <button type="button" id="copy-password" style="padding:6px 10px; background:#10b981; color:white; border:none; border-radius:6px; font-size:12px; font-weight:500; cursor:pointer;">Copy</button>
        </div>
      </div>
    `,
    confirmButtonText: opts.confirmButtonText ?? "Go to Schools List",
    confirmButtonColor: "#10b981",
    allowOutsideClick: false,
    customClass: {
      popup: "rounded-lg",
      confirmButton: "px-4 py-2 rounded-md font-medium",
    },
    didOpen: () => {
      const flash = (btn: HTMLElement) => {
        const original = btn.textContent;
        btn.textContent = "Copied!";
        setTimeout(() => {
          btn.textContent = original;
        }, 1200);
      };
      const emailBtn = document.getElementById("copy-email");
      emailBtn?.addEventListener("click", () => {
        void navigator.clipboard.writeText(opts.email);
        flash(emailBtn);
      });
      const passwordBtn = document.getElementById("copy-password");
      passwordBtn?.addEventListener("click", () => {
        void navigator.clipboard.writeText(opts.password);
        flash(passwordBtn);
      });
    },
  });
};
