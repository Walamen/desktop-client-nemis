import React from "react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: SelectOption[];
  placeholder?: string;
  required?: boolean;
}

export const Select: React.FC<SelectProps> = ({
  label,
  error,
  helperText,
  options,
  placeholder,
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
      <select
        className={`w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 placeholder:text-gray-400 transition-all duration-300 ease-out outline-none focus:border-none focus:ring-1 focus:ring-primary/20 focus:shadow-[0_0_0_4px_rgba(59,130,246,0.15),0_0_20px_rgba(59,130,246,0.35)] ${
          error ? "border-error" : "border-border"
        } ${className}`}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {helperText && !error && (
        <p className="mt-2 text-small text-gray-600">{helperText}</p>
      )}
      {error && <p className="mt-2 text-small text-error">{error}</p>}
    </div>
  );
};
