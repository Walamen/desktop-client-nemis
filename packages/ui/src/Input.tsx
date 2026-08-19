import React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
  required?: boolean;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  icon,
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
      <div className="relative">
        {icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            {icon}
          </div>
        )}
        <input
          className={`w-full px-4 py-3 rounded-full border border-slate-300 bg-white text-sm text-gray-900 placeholder:text-gray-400 transition-all duration-300 ease-out outline-none focus:border-none focus:ring-1 focus:ring-primary/20 focus:shadow-[0_0_0_4px_rgba(59,130,246,0.15),0_0_20px_rgba(59,130,246,0.35)] ${
            error ? "border-error" : "border-border"
          } ${icon ? "pl-10" : ""} ${className}`}
          {...props}
        />
      </div>
      {helperText && !error && (
        <p className="mt-2 text-small text-gray-600">{helperText}</p>
      )}
      {error && <p className="mt-2 text-small text-error">{error}</p>}
    </div>
  );
};
