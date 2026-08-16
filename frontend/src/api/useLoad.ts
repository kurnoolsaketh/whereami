import { useCallback, useEffect, useState } from 'react'

// every screen that reads from the backend wants the same four things, so they come from here
// rather than being spelt out again in each component
export interface Loaded<T> {
  data: T | null
  error: string | null
  loading: boolean
  reload: () => void
}

// `load` has to be stable - wrap it in useCallback - because a new function identity restarts
// the request
export function useLoad<T>(load: () => Promise<T>): Loaded<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    load()
      .then((value) => {
        if (cancelled) return
        setData(value)
        setError(null)
      })
      .catch((failure: unknown) => {
        if (cancelled) return
        setError(failure instanceof Error ? failure.message : 'Something went wrong')
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [load, attempt])

  const reload = useCallback(() => setAttempt((previous) => previous + 1), [])

  return { data, error, loading, reload }
}
