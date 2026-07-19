import React from "react";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
}

export const Textarea: React.FC<TextareaProps> = ({
  label,
  error,
  helperText,
  required,
  className = "",
  ...props
}) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-small font-medium text-neutral-dark mb-2">
          {label}
          {required && <span className="text-error ml-1">*</span>}
        </label>
      )}
      <textarea
        className={`w-full px-4 py-3 border rounded-button text-body focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary transition-colors resize-vertical ${
          error ? "border-error" : "border-border"
        } ${className}`}
        {...props}
      />
      {helperText && !error && (
        <p className="mt-2 text-small text-gray-600">{helperText}</p>
      )}
      {error && <p className="mt-2 text-small text-error">{error}</p>}
    </div>
  );
};
