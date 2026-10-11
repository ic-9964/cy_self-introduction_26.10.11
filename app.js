// 导航切换单个毛玻璃板块；URL hash 保存当前页面，刷新和前进/后退均可恢复。
(() => {
  const main = document.querySelector('#main')
  const panels = [...main.querySelectorAll(':scope > section[id]')]
  const panelByHash = new Map(panels.map(panel => [`#${panel.id}`, panel]))
  const navLinks = [...document.querySelectorAll('.site-header nav a')]
  const names = new Map(navLinks.map(link => [link.hash, link.textContent.trim()]))
  const indicator = document.querySelector('#section-indicator')
  const progressBar = document.querySelector('#reading-progress')
  const toTopButton = document.querySelector('#to-top')
  const siteTitle = document.title.trim()
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  let activeHash = ''

  panels.forEach(panel => {
    panel.tabIndex = -1
    const heading = panel.querySelector('h1, h2')
    if (heading) {
      heading.id ||= `${panel.id}-title`
      panel.setAttribute('aria-labelledby', heading.id)
    }
  })

  function resolveHash() {
    if (panelByHash.has(location.hash)) return location.hash
    // 跳到正文的无障碍链接不改变当前板块。
    if (location.hash === '#main') return activeHash || '#about'
    if (location.hash) {
      // 兼容已有的板块内部链接，如 #research-direction。
      let target
      try { target = document.getElementById(decodeURIComponent(location.hash.slice(1))) }
      catch { target = null }
      const panel = target?.closest('main > section[id]')
      if (panel) return `#${panel.id}`
      history.replaceState(history.state, '', `${location.pathname}${location.search}#about`)
    }
    return '#about'
  }

  function updateScrollUI() {
    const scrollable = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
    const ratio = scrollable ? Math.max(0, Math.min(1, window.scrollY / scrollable)) : 0
    progressBar.style.width = `${ratio * 100}%`
    const showToTop = window.scrollY > window.innerHeight * .6
    toTopButton.classList.toggle('is-visible', showToTop)
    toTopButton.tabIndex = showToTop ? 0 : -1
  }

  function showPanel(hash, { focus = false } = {}) {
    activeHash = hash
    const current = panelByHash.get(hash)
    panels.forEach(panel => {
      panel.hidden = panel !== current
      panel.classList.toggle('is-visible', panel === current)
    })
    navLinks.forEach(link => {
      const selected = link.hash === hash
      link.classList.toggle('is-current', selected)
      if (selected) link.setAttribute('aria-current', 'page')
      else link.removeAttribute('aria-current')
    })
    indicator.textContent = names.get(hash)
    document.title = hash === '#about' ? siteTitle : `${names.get(hash)} · ${siteTitle}`
    if (focus) current.focus({ preventScroll: true })
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    updateScrollUI()
  }

  document.addEventListener('click', event => {
    // 保留 Ctrl/Command 点击、鼠标中键和新窗口的浏览器原生行为。
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const link = event.target.closest('a[href^="#"]')
    if (!link || link.target === '_blank' || link.hasAttribute('download') || !panelByHash.has(link.hash)) return
    event.preventDefault()
    if (location.hash !== link.hash) history.pushState(null, '', link.hash)
    showPanel(link.hash, { focus: true })
  })

  function syncRoute() {
    const hash = resolveHash()
    if (hash !== activeHash) showPanel(hash, { focus: true })
  }
  window.addEventListener('popstate', syncRoute)
  window.addEventListener('hashchange', syncRoute)
  window.addEventListener('scroll', updateScrollUI, { passive: true })
  window.addEventListener('resize', updateScrollUI, { passive: true })
  window.addEventListener('load', updateScrollUI)
  // 当前板块内返回顶部，不切回首页，也不丢失 URL 的查询参数。
  toTopButton.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'instant' : 'smooth' })
  })

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  document.body.classList.add('panel-navigation')
  showPanel(resolveHash())
  new ResizeObserver(updateScrollUI).observe(main)
})()
