// 远景缓慢移动，近景向相反方向移动，正文保持稳定，形成自然景深。
(() => {
  const root = document.documentElement
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
  const target = { x: 0, y: 0, scroll: 0 }
  const current = { x: 0, y: 0, scroll: 0 }
  let frame = 0

  function paint() {
    frame = 0
    if (reducedMotion.matches) return

    let moving = false
    for (const axis of ['x', 'y', 'scroll']) {
      const delta = target[axis] - current[axis]
      if (Math.abs(delta) > .002) {
        current[axis] += delta * .075
        moving = true
      } else current[axis] = target[axis]
    }
    root.style.setProperty('--depth-x', `${(current.x * -9).toFixed(2)}px`)
    root.style.setProperty('--depth-y', `${(current.y * -6 - current.scroll * 10).toFixed(2)}px`)
    root.style.setProperty('--near-x', `${(current.x * 22).toFixed(2)}px`)
    root.style.setProperty('--near-y', `${(current.y * 14 - current.scroll * 23).toFixed(2)}px`)

    // 到达目标后停止绘制，不持续占用动画帧。
    if (moving) frame = window.requestAnimationFrame(paint)
  }

  function schedule() {
    if (!frame && !reducedMotion.matches) frame = window.requestAnimationFrame(paint)
  }

  window.addEventListener('pointermove', event => {
    if (!finePointer.matches || reducedMotion.matches) return
    target.x = Math.max(-1, Math.min(1, event.clientX / window.innerWidth * 2 - 1))
    target.y = Math.max(-1, Math.min(1, event.clientY / window.innerHeight * 2 - 1))
    schedule()
  }, { passive: true })

  document.documentElement.addEventListener('pointerleave', () => {
    target.x = target.y = 0
    schedule()
  })

  function syncScroll() {
    target.scroll = Math.min(window.scrollY / Math.max(window.innerHeight, 1), 2)
    schedule()
  }
  window.addEventListener('scroll', syncScroll, { passive: true })
  window.addEventListener('resize', syncScroll, { passive: true })
  reducedMotion.addEventListener('change', () => {
    window.cancelAnimationFrame(frame)
    frame = 0
    for (const axis of ['x', 'y', 'scroll']) current[axis] = target[axis] = 0
    for (const name of ['--depth-x', '--depth-y', '--near-x', '--near-y']) root.style.removeProperty(name)
    syncScroll()
  })
  syncScroll()
})()
