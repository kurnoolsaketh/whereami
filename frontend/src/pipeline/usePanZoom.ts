import { useCallback, useLayoutEffect, useRef, useState } from 'react'

// the canvas half of the graph panel: how far the drawing is shifted and how much it is scaled,
// and the handlers that change either. it is separate from PipelineGraph because it is a
// different concern that fails in different ways - a bug here moves the whole picture, a bug
// there draws the wrong picture - and because this is the part that grows: pinch, momentum,
// keyboard nudging all belong to it and none of them belong to drawing a pipeline

export interface Transform {
  x: number
  y: number
  k: number
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

// a graph is never blown up past its natural size - fitting a two-node role to the panel would
// make its boxes enormous - but it will shrink a long way before it starts panning instead
const MIN_ZOOM = 0.2
const MAX_ZOOM = 2
const NATURAL = 1

export interface PanZoom {
  ref: React.RefObject<HTMLDivElement | null>
  transform: Transform
  // false until the container has been measured and the first fit has run. the graph is drawn
  // but not shown until then, or the first paint lands untransformed and the fit that follows
  // it reads as the picture jumping into place
  ready: boolean
  dragging: boolean
  fit: () => void
  zoomBy: (factor: number) => void
  onWheel: (event: React.WheelEvent) => void
  onPointerDown: (event: React.PointerEvent) => void
  onPointerMove: (event: React.PointerEvent) => void
  onPointerUp: (event: React.PointerEvent) => void
}

export function usePanZoom(bounds: Bounds, padding: number, refit: string): PanZoom {
  const ref = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 })
  const drag = useRef<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  // the panel is a flexible height and the window is resizable, so the fit has to follow the box
  // rather than be taken once
  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) {
      return
    }
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const fit = useCallback(() => {
    if (size.width === 0 || size.height === 0) {
      return
    }
    const width = bounds.maxX - bounds.minX + 2 * padding
    const height = bounds.maxY - bounds.minY + 2 * padding
    if (width <= 0 || height <= 0) {
      return
    }
    const k = clamp(Math.min(size.width / width, size.height / height), MIN_ZOOM, NATURAL)
    setTransform({
      k,
      x: size.width / 2 - (k * (bounds.minX + bounds.maxX)) / 2,
      y: size.height / 2 - (k * (bounds.minY + bounds.maxY)) / 2,
    })
  }, [bounds, padding, size])

  // refit when the shape changes, so Refresh reframes rather than stranding new rounds off the
  // edge - but not on every render, or a pan would be undone as soon as it was made.
  //
  // a layout effect rather than a plain one, because a plain effect runs *after* the paint: the
  // frame in which the container's size first arrives would be painted with the previous
  // transform, and the correction would read as the graph jumping into place
  useLayoutEffect(() => {
    fit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refit, size.width, size.height])

  const zoomAt = useCallback((x: number, y: number, factor: number) => {
    setTransform((current) => {
      const k = clamp(current.k * factor, MIN_ZOOM, MAX_ZOOM)
      const scale = k / current.k
      return { k, x: x - (x - current.x) * scale, y: y - (y - current.y) * scale }
    })
  }, [])

  const zoomBy = useCallback(
    (factor: number) => zoomAt(size.width / 2, size.height / 2, factor),
    [zoomAt, size],
  )

  // a plain wheel scrolls the page, and only ctrl or cmd zooms. the graph sits partway down a
  // scrolling page - and the fixture route stacks seven of them - so a graph that swallowed the
  // wheel would trap the reader inside it. taking the wheel *without* swallowing it is worse
  // still: the page scrolls and the graph zooms at the same time. a trackpad pinch arrives as a
  // wheel event with ctrlKey set, so this is also what makes pinch-to-zoom work
  const onWheel = useCallback(
    (event: React.WheelEvent) => {
      const box = ref.current?.getBoundingClientRect()
      if (box === undefined || (!event.ctrlKey && !event.metaKey)) {
        return
      }
      event.preventDefault()
      zoomAt(
        event.clientX - box.left,
        event.clientY - box.top,
        // exponential, so a trackpad's small deltas and a mouse's large ones both feel linear
        Math.exp(-event.deltaY * 0.0015),
      )
    },
    [zoomAt],
  )

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    // a click on a node or a line is a selection, not the start of a pan
    if ((event.target as Element).closest('[data-pickable]') !== null) {
      return
    }
    drag.current = { x: event.clientX, y: event.clientY }
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const from = drag.current
    if (from === null) {
      return
    }
    const dx = event.clientX - from.x
    const dy = event.clientY - from.y
    drag.current = { x: event.clientX, y: event.clientY }
    setTransform((current) => ({ ...current, x: current.x + dx, y: current.y + dy }))
  }, [])

  const onPointerUp = useCallback((event: React.PointerEvent) => {
    drag.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  return {
    ref,
    transform,
    ready: size.width > 0 && size.height > 0,
    dragging,
    fit,
    zoomBy,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}
