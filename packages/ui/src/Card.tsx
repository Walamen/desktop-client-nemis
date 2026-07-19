import React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  footer?: React.ReactNode;
  hoverable?: boolean;
  bordered?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  title,
  subtitle: _subtitle,
  footer,
  hoverable = false,
  bordered = true,
  className = "",
  ...props
}) => {
  const borderClass = bordered ? "border border-slate-100" : "";
  const hoverClass = hoverable ? "hover:shadow-md transition-shadow" : "";

  return (
    <div
      className={`bg-white  border border-slate-300 rounded-card ${borderClass} ${hoverClass} overflow-hidden ${className}`}
      {...props}
    >
      {title && (
        <div className="px-6 py-4 border-b bg-secondary/20 border-gray-200">
          <h3 className="text-lg font-semibold text-slate-600">{title}</h3>
        </div>
      )}
      <div className="p-6">{children}</div>
      {footer && (
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          {footer}
        </div>
      )}
    </div>
  );
};
