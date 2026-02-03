// Type declaration for optional vectordb package
// This allows the dynamic import to work without TypeScript errors
// Types mirror the internal LanceDB types in lancedb.ts

declare module 'vectordb' {
  interface VectorRecord {
    id: string;
    vector: number[];
    sourceId: string;
    sourceType: string;
    text?: string;
    metadata?: string;
    createdAt: string;
  }

  interface QueryResult {
    id: string;
    sourceId: string;
    sourceType: string;
    text?: string;
    metadata?: string;
    _distance: number;
  }

  interface LanceDBQuery {
    limit(n: number): LanceDBQuery;
    filter(expr: string): LanceDBQuery;
    execute(): Promise<QueryResult[]>;
  }

  interface LanceDBTable {
    add(data: VectorRecord[]): Promise<void>;
    search(query: number[]): LanceDBQuery;
    delete(filter: string): Promise<void>;
    countRows(): Promise<number>;
  }

  interface LanceDBConnection {
    openTable(name: string): Promise<LanceDBTable>;
    createTable(name: string, data: VectorRecord[]): Promise<LanceDBTable>;
    tableNames(): Promise<string[]>;
  }

  export function connect(path: string): Promise<LanceDBConnection>;
}
