export const UPDATE_STATES = [
  'idle', 'checking', 'downloading', 'paused', 'failed', 'verifying', 'staged',
  'preparing', 'health-check', 'activated', 'monitoring', 'verified', 'rollback',
  'recovery-required', 'cancelled',
] as const
export type UpdateState = (typeof UPDATE_STATES)[number]

const transitions: Readonly<Record<UpdateState, readonly UpdateState[]>> = {
  idle: ['checking'],
  checking: ['downloading', 'failed', 'cancelled'],
  downloading: ['paused', 'verifying', 'failed', 'cancelled'],
  paused: ['downloading', 'cancelled'],
  failed: ['idle', 'recovery-required'],
  verifying: ['staged', 'failed', 'cancelled'],
  staged: ['preparing', 'cancelled'],
  preparing: ['health-check', 'failed', 'recovery-required'],
  'health-check': ['activated', 'rollback', 'failed'],
  activated: ['monitoring', 'rollback'],
  monitoring: ['verified', 'rollback'],
  verified: ['idle'],
  rollback: ['idle', 'recovery-required'],
  'recovery-required': ['idle'],
  cancelled: ['idle'],
}

export interface UpdateTransaction {
  readonly schemaVersion: 1
  readonly operationId: string
  readonly state: UpdateState
  readonly createdAt: string
  readonly updatedAt: string
  readonly targetVersion: string
  readonly expectedHash: string
  readonly expectedBytes: number
  readonly stagingPath: string
  readonly targetPath: string
  readonly lastKnownGoodPath: string | null
  readonly errorCode: string | null
}

export function transitionUpdate(
  tx: UpdateTransaction,
  next: UpdateState,
  updatedAt: string,
  errorCode: string | null = null,
): UpdateTransaction {
  if (!transitions[tx.state].includes(next)) {
    throw new Error(`invalid update transition ${tx.state} -> ${next}`)
  }
  return { ...tx, state: next, updatedAt, errorCode }
}

export function canTransition(from: UpdateState, to: UpdateState): boolean {
  return transitions[from].includes(to)
}
