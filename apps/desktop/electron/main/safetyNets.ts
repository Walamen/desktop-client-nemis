import { dialog } from 'electron';
import { logger } from '@app/services/logger';

/**
 * Last-resort handlers: developer detail goes to the log,
 * the user sees a plain-language dialog only on fatal crashes.
 */
export function installProcessSafetyNets(): void {
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception (fatal):', error);
    dialog.showErrorBox(
      'NEMIS Desktop — Unexpected Error',
      'The application encountered an unexpected error and needs to close. Details were written to the log file.',
    );
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection:', reason);
  });
}
