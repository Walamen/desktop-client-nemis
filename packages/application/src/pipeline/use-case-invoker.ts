import { DomainException } from '@nemis-desktop/domain';
import type { IAppLogger } from '../interfaces/app-logger';
import {
  ApplicationException,
  UnexpectedApplicationException,
  UseCaseException,
} from '../exceptions';

/** Wraps every use case execution with concise logging and exception
 * normalization. No verbose logging: one start line, then success or failure. */
export async function invokeUseCase<T>(
  name: string,
  logger: IAppLogger,
  work: () => Promise<T>,
): Promise<T> {
  logger.info('use-case.start', { useCase: name });
  try {
    const result = await work();
    logger.info('use-case.success', { useCase: name });
    return result;
  } catch (error) {
    logger.error('use-case.failure', {
      useCase: name,
      error: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof ApplicationException) throw error;
    if (error instanceof DomainException) {
      throw new UseCaseException(error.message, { cause: error });
    }
    throw new UnexpectedApplicationException('An unexpected error occurred.', { cause: error });
  }
}
