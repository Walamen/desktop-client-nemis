import React from 'react';

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Retry',
}) => (
  <div className="flex flex-col items-center justify-center py-10 px-4 text-center" role="alert">
    <h3 className="text-base font-semibold text-neutral-dark mb-1">{title}</h3>
    <p className="text-sm text-gray-600 mb-4 max-w-md">{message}</p>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="px-4 py-2 rounded-button bg-primary text-white text-sm font-semibold hover:opacity-90"
      >
        {retryLabel}
      </button>
    )}
  </div>
);
