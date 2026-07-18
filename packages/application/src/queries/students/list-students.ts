import type { Query } from '../../core/query';

export interface ListStudentsQuery extends Query {
  limit?: number;
  offset?: number;
}
