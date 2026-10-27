import { WorkflowException } from './workflow-exception';

/** The offline enrol path was asked to place a returning student in a new
 * year. A distinct type so the IPC layer can give it its own error code and
 * carry the exact user-facing text across the process boundary. */
export class ReturningStudentException extends WorkflowException {}
