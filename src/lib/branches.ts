export const BRANCHES = {
  bbqhouse: { code: 'bbqhouse', name: 'BBQ House', color: '#ea580c' },
  salt: { code: 'salt', name: 'SALT', color: '#2563eb' },
  centralkitchen: { code: 'centralkitchen', name: 'Central Kitchen', color: '#16a34a' },
  cleaning: { code: 'cleaning', name: 'Executive Cleaning', color: '#64748b' },
} as const;

export type BranchCode = keyof typeof BRANCHES;

export const BRANCH_LIST = Object.values(BRANCHES);
