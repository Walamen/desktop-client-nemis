import React from 'react';

export interface BreadcrumbsProps {
  segments: readonly string[];
  className?: string;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ segments, className = '' }) => {
  const trail = ['Home', ...segments];
  return (
    <p className={`text-xs font-semibold text-gray-600 truncate ${className}`} aria-label="Breadcrumb">
      {trail.join(' / ')}
    </p>
  );
};
