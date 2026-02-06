import { useEffect, useState, useCallback } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useQueryClient } from '@tanstack/react-query'
import { getSocketSessionId } from '@/lib/api'

interface ScraperProgress {
  current: number
  total: number
  asin: string
  status: 'checking' | 'complete' | 'error'
  available?: boolean
  title?: string
}

interface ScraperComplete {
  total: number
  available: number
  unavailable: number
  errors: number
}

export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [progress, setProgress] = useState<ScraperProgress | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    const sessionId = getSocketSessionId()

    const socketInstance = io({
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      auth: {
        sessionId: sessionId || 'anonymous',
      },
    })

    socketInstance.on('connect', () => {
      setIsConnected(true)
    })

    socketInstance.on('disconnect', () => {
      setIsConnected(false)
    })

    socketInstance.on('scraper:progress', (data: ScraperProgress) => {
      setProgress(data)
    })

    socketInstance.on('scraper:complete', (_data: ScraperComplete) => {
      setProgress(null)
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['asins'] })
      queryClient.invalidateQueries({ queryKey: ['scraper', 'status'] })
    })

    socketInstance.on('scraper:error', () => {
      setProgress(null)
      queryClient.invalidateQueries({ queryKey: ['scraper', 'status'] })
    })

    setSocket(socketInstance)

    return () => {
      socketInstance.disconnect()
    }
  }, [queryClient])

  const clearProgress = useCallback(() => {
    setProgress(null)
  }, [])

  return {
    socket,
    isConnected,
    progress,
    clearProgress,
  }
}
