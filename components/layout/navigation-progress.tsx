'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

function NavigationProgressInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [visible, setVisible] = useState(false)
  const [width, setWidth] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval>>()
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const prevUrl = useRef('')
  const startedRef = useRef(false)

  function start() {
    if (startedRef.current) return
    startedRef.current = true
    clearInterval(intervalRef.current)
    clearTimeout(timeoutRef.current)
    setWidth(15)
    setVisible(true)
    let w = 15
    intervalRef.current = setInterval(() => {
      w = w + (85 - w) * 0.08
      setWidth(Math.min(w, 85))
    }, 150)
  }

  function finish() {
    if (!startedRef.current) return
    startedRef.current = false
    clearInterval(intervalRef.current)
    setWidth(100)
    timeoutRef.current = setTimeout(() => {
      setVisible(false)
      setWidth(0)
    }, 250)
  }

  // Detect navigation start by intercepting clicks on <a> tags
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement).closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
      if (anchor.target === '_blank') return
      try {
        const url = new URL(href, window.location.href)
        if (url.href === window.location.href) return
      } catch {
        return
      }
      start()
    }
    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [])

  // Detect navigation complete
  useEffect(() => {
    const url = `${pathname}?${searchParams.toString()}`
    if (prevUrl.current && url !== prevUrl.current) {
      finish()
    }
    prevUrl.current = url
  }, [pathname, searchParams])

  useEffect(() => () => {
    clearInterval(intervalRef.current)
    clearTimeout(timeoutRef.current)
  }, [])

  if (!visible) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[200] h-[3px] bg-transparent pointer-events-none">
      <div
        className="h-full bg-brand-600 transition-all ease-out"
        style={{ width: `${width}%`, transitionDuration: width === 100 ? '150ms' : '200ms' }}
      />
    </div>
  )
}

// Needs Suspense because useSearchParams() suspends
import { Suspense } from 'react'
export default function NavigationProgress() {
  return (
    <Suspense>
      <NavigationProgressInner />
    </Suspense>
  )
}
