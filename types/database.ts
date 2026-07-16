export type UserRole = 'admin' | 'user'
export type UserStatus = 'pending' | 'approved' | 'rejected'
export type Ownership = 'lalo' | 'ale' | 'shared'
export type PaidBy = 'each' | 'lalo' | 'ale'
export type CardType = 'credit' | 'debit' | 'cash'
export type PaymentType = 'fijo' | 'extra'
export type IntervalType =
  | 'quincenal'
  | 'mensual'
  | 'bimestral'
  | 'trimestral'
  | 'c/15 dias'
  | 'c/21 dias'
  | 'anual'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  display_name: string | null
  role: UserRole
  status: UserStatus
  created_at: string
  updated_at: string
}

export interface IncomeConfig {
  id: string
  owner_id: string
  amount: number
  valid_from: string
  created_at: string
}

export interface SplitPercentage {
  owner_id: string
  display_name: string
  amount: number
  percentage: number
}

export interface Card {
  id: string
  owner_id: string | null
  ownership: Ownership
  name: string
  card_type: CardType
  last_four: string | null
  current_balance: number
  credit_limit: number
  is_active: boolean
  created_at: string
}

export interface RecurringExpense {
  id: string
  owner_id: string | null
  ownership: Ownership
  concept: string
  total_amount: number
  interval_type: IntervalType
  payment_day: 0 | 15 | 30  // 0 = ambos (quincenal)
  next_payment_date: string | null
  card_id: string | null
  is_active: boolean
  notes: string | null
  paid_by: PaidBy
  created_at: string
}

export interface RecurringExpenseSplit extends RecurringExpense {
  lalo_amount: number
  ale_amount: number
}

export interface Period {
  id: string
  owner_id: string
  period_date: string
  label: string | null
  income: number
  budget_fijos: number
  budget_extra: number
  created_at: string
}

export interface PeriodSummary extends Period {
  total_fijos_pagado: number
  total_extra_pagado: number
  restante_fijos: number
  restante_extra: number
}

export interface PeriodPayment {
  id: string
  period_id: string
  concept: string
  card_id: string | null
  amount: number
  payment_type: PaymentType
  paid_at: string
  notes: string | null
  created_at: string
}

export interface FunBudgetPeriod {
  id: string
  period_start: string
  period_end: string
  base_budget: number
  notes: string | null
  created_at: string
}

export interface FunExpense {
  id: string
  budget_period_id: string
  concept: string
  amount: number
  expense_date: string
  registered_by: string | null
  notes: string | null
  created_at: string
}

export interface FunBudgetSummary {
  id: string
  period_start: string
  period_end: string
  base_budget: number
  total_spent: number
  remaining_budget: number
  spent_pct: number
}

export interface CardExpenseInstallment {
  id: string
  expense_id: string
  number: number
  amount: number
  due_period_date: string | null
  is_paid: boolean
  paid_at: string | null
  created_at: string
}

export interface CardExpense {
  id: string
  owner_id: string
  card_id: string | null
  concept: string
  total_amount: number
  purchase_date: string
  months: number
  expense_type: 'compra' | 'ajuste'
  is_shared: boolean
  shared_pct: number | null
  inter_person_debt_id: string | null
  source: string
  source_id: string | null
  notes: string | null
  created_at: string
  // joined
  cards?: { name: string } | null
  card_expense_installments?: CardExpenseInstallment[]
}

export interface InternalDebtSettlement {
  id: string
  recurring_expense_id: string
  period_date: string
  payer: 'lalo' | 'ale'
  amount: number
  paid_at: string
  paid_by_user_id: string
  notes: string | null
  created_at: string
}

export interface Project {
  id: string
  owner_id: string
  name: string
  total_cost: number
  due_date: string | null
  notes: string | null
  is_completed: boolean
  is_shared: boolean
  created_at: string
  // joined
  project_payments?: ProjectPayment[]
}

export interface ProjectPayment {
  id: string
  project_id: string
  owner_id: string
  amount: number
  paid_at: string
  receipt_path: string | null
  notes: string | null
  created_at: string
}

export interface InterPersonDebt {
  id: string
  debtor_id: string
  creditor_id: string
  concept: string
  amount: number
  is_paid: boolean
  due_date: string | null
  paid_at: string | null
  notes: string | null
  total_installments: number | null
  paid_installments: number
  created_at: string
  // joined
  debtor?: Profile
  creditor?: Profile
}
