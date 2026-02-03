import type { ReactNode } from 'react'
import { Navbar } from './Navbar'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-[1800px] px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  )
}
