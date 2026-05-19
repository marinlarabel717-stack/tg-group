document.getElementById('year').textContent = String(new Date().getFullYear())

const features = window.TG_MATRIX_FEATURES || []
const pageType = document.body.dataset.page
const CONTACT_URL = 'https://t.me/TGMX9haobot'

function ensureLightbox() {
  let lightbox = document.getElementById('image-lightbox')
  if (lightbox) return lightbox

  lightbox = document.createElement('div')
  lightbox.id = 'image-lightbox'
  lightbox.className = 'image-lightbox'
  lightbox.innerHTML = `
    <button class="image-lightbox__backdrop" type="button" aria-label="关闭预览"></button>
    <div class="image-lightbox__dialog" role="dialog" aria-modal="true" aria-label="图片预览">
      <button class="image-lightbox__close" type="button" aria-label="关闭">×</button>
      <img class="image-lightbox__image" alt="预览图片" />
      <div class="image-lightbox__caption"></div>
    </div>
  `

  document.body.appendChild(lightbox)

  const close = () => lightbox.classList.remove('is-open')
  lightbox.querySelector('.image-lightbox__backdrop').addEventListener('click', close)
  lightbox.querySelector('.image-lightbox__close').addEventListener('click', close)
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close()
  })

  return lightbox
}

function bindZoomables(scope = document) {
  const lightbox = ensureLightbox()
  const image = lightbox.querySelector('.image-lightbox__image')
  const caption = lightbox.querySelector('.image-lightbox__caption')

  scope.querySelectorAll('[data-zoom-src]').forEach((node) => {
    node.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      image.src = node.getAttribute('data-zoom-src') || ''
      image.alt = node.getAttribute('data-zoom-alt') || ''
      caption.textContent = node.getAttribute('data-zoom-caption') || ''
      lightbox.classList.add('is-open')
    })
  })
}

function renderSpotlights(feature) {
  return (feature.spotlights || [])
    .map(
      (spotlight, index) => `
        <button
          class="spotlight-dot"
          type="button"
          style="left:${spotlight.x}%;top:${spotlight.y}%;"
          data-zoom-src="${feature.preview}"
          data-zoom-alt="${feature.title} 页面预览"
          data-zoom-caption="${feature.title} · ${spotlight.label}"
          aria-label="${spotlight.label}"
        >
          <span class="spotlight-dot__pulse"></span>
          <span class="spotlight-dot__core">${index + 1}</span>
          <span class="spotlight-dot__label">${spotlight.label}</span>
        </button>
      `
    )
    .join('')
}

function renderFeatureGrid() {
  const grid = document.getElementById('feature-grid')
  if (!grid) return

  grid.innerHTML = features
    .map(
      (feature) => `
        <article class="feature-card feature-card--link">
          <button class="feature-card__preview feature-card__preview--button" type="button" data-zoom-src="${feature.preview}" data-zoom-alt="${feature.title} UI 预览" data-zoom-caption="${feature.title} · 页面截图">
            <span class="feature-card__tag">Real UI</span>
            <img src="${feature.preview}" alt="${feature.title} UI 预览" loading="lazy" />
            <span class="image-panel__hint image-panel__hint--small">查看大图</span>
          </button>
          <div class="feature-card__body">
            <div class="feature-card__head">
              <h3>${feature.title}</h3>
              <a class="feature-card__cta" href="./feature.html?slug=${feature.slug}">查看详情 →</a>
            </div>
            <p>${feature.summary}</p>
            <div class="badge-row">
              ${feature.badges.map((badge) => `<span>${badge}</span>`).join('')}
            </div>
          </div>
        </article>
      `
    )
    .join('')

  bindZoomables(grid)
}

function renderFeatureDetail() {
  const mount = document.getElementById('feature-detail')
  const nav = document.getElementById('feature-nav')
  if (!mount) return

  const params = new URLSearchParams(window.location.search)
  const slug = params.get('slug') || features[0]?.slug
  const feature = window.getFeatureBySlug ? window.getFeatureBySlug(slug) : null

  if (nav) {
    nav.innerHTML = features
      .map((item) => `<a href="./feature.html?slug=${item.slug}" class="${item.slug === slug ? 'is-active' : ''}">${item.shortTitle}</a>`)
      .join('')
  }

  if (!feature) {
    mount.innerHTML = `
      <section class="section">
        <div class="section-heading">
          <div class="eyebrow">Not Found</div>
          <h2>功能页不存在</h2>
          <p>请返回首页查看其他模块。</p>
        </div>
      </section>
    `
    return
  }

  document.title = `TG-Matrix | ${feature.title}`

  mount.innerHTML = `
    <section class="section feature-hero">
      <div class="feature-hero__content">
        <div class="eyebrow">Feature Detail</div>
        <h1>${feature.title}</h1>
        <p class="hero__lead">${feature.summary}</p>
        <p class="feature-hero__tagline">${feature.tagline}</p>
        <div class="badge-row badge-row--large">
          ${feature.badges.map((badge) => `<span>${badge}</span>`).join('')}
        </div>
        <div class="feature-specs">
          ${feature.specs.map((item) => `<div class="feature-spec"><span>${item.label}</span><strong>${item.value}</strong></div>`).join('')}
        </div>
      </div>
      <div class="feature-hero__preview panel-wrap">
        <div class="image-panel image-panel--annotated">
          <button class="image-panel__trigger" type="button" data-zoom-src="${feature.preview}" data-zoom-alt="${feature.title} 页面预览" data-zoom-caption="${feature.title} · 页面截图">
            <img src="${feature.preview}" alt="${feature.title} 页面 UI 预览" class="feature-page-image" />
            <span class="image-panel__hint">点击查看大图</span>
          </button>
          ${renderSpotlights(feature)}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-heading">
        <div class="eyebrow">页面重点</div>
        <h2>${feature.title} 页面结构</h2>
      </div>
      <div class="detail-grid detail-grid--highlights">
        ${feature.highlights.map((item, index) => `<article class="detail-card"><span class="detail-card__index">0${index + 1}</span><p>${item}</p></article>`).join('')}
      </div>
    </section>

    <section class="section">
      <div class="section-heading">
        <div class="eyebrow">图文教程</div>
        <h2>建议操作顺序</h2>
      </div>
      <div class="tutorial-list tutorial-list--visual">
        ${feature.tutorial.map((step, index) => `
          <article class="tutorial-step tutorial-step--visual">
            <button class="tutorial-step__media tutorial-step__media--button" type="button" data-zoom-src="${step.image}" data-zoom-alt="${feature.title} 教程步骤 ${index + 1}" data-zoom-caption="${feature.title} · 步骤 ${index + 1} · ${step.title}">
              <img src="${step.image}" alt="${feature.title} 教程步骤 ${index + 1}" loading="lazy" />
              <span class="image-panel__hint image-panel__hint--small">查看大图</span>
            </button>
            <div class="tutorial-step__content">
              <div class="tutorial-step__num">${index + 1}</div>
              <div>
                <h3>${step.title}</h3>
                <p>${step.body}</p>
                <ul class="tutorial-points">
                  ${step.points.map((point) => `<li>${point}</li>`).join('')}
                </ul>
              </div>
            </div>
          </article>
        `).join('')}
      </div>
    </section>

    <section class="section">
      <div class="section-heading">
        <div class="eyebrow">适用场景</div>
        <h2>适用范围</h2>
      </div>
      <div class="badge-row badge-row--scenario">
        ${feature.scenarios.map((item) => `<span>${item}</span>`).join('')}
      </div>
      <div class="cta-panel cta-panel--detail cta-panel--brand">
        <div>
          <strong>需要演示、合作或部署支持</strong>
          <span>Telegram: @TGMX9haobot</span>
        </div>
        <a class="button button--primary" href="${CONTACT_URL}" target="_blank" rel="noreferrer">立即联系</a>
      </div>
    </section>
  `

  bindZoomables(mount)
}

ensureLightbox()
if (pageType === 'home') renderFeatureGrid()
if (pageType === 'feature') renderFeatureDetail()
