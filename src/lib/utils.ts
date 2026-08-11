import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Formata minutos jogados em horas (ex: 142) ou minutos quando é menos de 1h
// (ex: 45min) — só um número/unidade curta, a label vem da tradução (t()).
export function formatPlaytime(minutes: number): string {
  if (minutes < 60) return `${minutes}min`
  return `${Math.round(minutes / 60)}h`
}
