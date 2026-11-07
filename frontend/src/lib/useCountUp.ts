import { animate, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'

/** A number that animates from its old value to the new one (instantly if motion is off). */
export function useCountUp(value: number) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (reduced) return
    const controls = animate(shown, value, { duration: 1.2, ease: [0.16, 1, 0.3, 1], onUpdate: setShown })
    return () => controls.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start from wherever it currently is
  }, [value, reduced])
  return reduced ? value : shown
}
