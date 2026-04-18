// Tipo genérico para Supabase — se expande conforme el proyecto crece
// En producción puedes generarlo con: npx supabase gen types typescript
export type Database = {
  public: {
    Tables: Record<string, unknown>
    Views: Record<string, unknown>
    Functions: Record<string, unknown>
  }
}
