export interface MatrixRow {
  id: string;
  family: string;
  release: string;
  accountableRole: string;
  dependencies: string;
  acceptanceTest: string;
  status: "Passed" | "In progress" | "Planned";
  evidence: string;
  tests: string[];
}

export interface Matrix {
  totals: { requirements: number; byStatus: Record<string, number>; byRelease: Record<string, number> };
  rows: MatrixRow[];
}
