import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import type { Database } from './types'

export const createServerClient = () =>
  createServerComponentClient<Database>({ cookies })
