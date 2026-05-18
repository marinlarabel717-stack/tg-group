document.getElementById('year').textContent = String(new Date().getFullYear())

const features = window.TG_MATRIX_FEATURES || []
const pageType = document.body.dataset.page

function renderFeatureGrid() {
  const grid = document.getElementById('feature-grid')
  if (!grid) return

  grid.innerHTML = features
    .map(
      (feature) => `
        <a class="feature-card feature-card--link" href="./feature.html?slug=${feature.slug}">
          <div class="feature-card__preview">
            <img src="${feature.preview}" alt="${feature.title} UI 预览" loading="lazy" />
          </div>
          <div class="feature-card__body">
            <div class="feature-card__head">
              <h3>${feature.title}</h3>
              <span class="feature-card__cta">查看页面 →</span>
            </div>
            <p>${feature.summary}</p>
            <div class="badge-row">
              ${feature.badges.map((badge) => `<span>${badge}</span>`).join('')}
            </div>
          </div>
        </a>
      `
    )
    .join('')
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
          <div class="eyebrow">未找到页面</div>
          <h2>这个功能页还没准备好</h2>
          <p>你可以先回到首页看其他模块。</p>
        </div>
      </section>
    `
    return
  }

  document.title = `TG-Matrix | ${feature.title}`

  mount.innerHTML = `
    <section class="section feature-hero">
      <div class="feature-hero__content">
        <div class="eyebrow">功能详情页</div>
        <h1>${feature.title}</h1>
        <p class="hero__lead">${feature.summary}</p>
        <p class="feature-hero__tagline">${feature.tagline}</p>
        <div class="badge-row badge-row--large">
          ${feature.badges.map((badge) => `<span>${badge}</span>`).join('')}
        </div>
      </div>
      <div class="feature-hero__preview panel-wrap">
        <img src="${feature.preview}" alt="${feature.title} 页面 UI 预览" class="feature-page-image" />
      </div>
    </section>

    <section class="section">
      <div class="section-heading">
        <div class="eyebrow">页面亮点</div>
        <h2>${feature.title} 这个页面，主要看什么</h2>
      </div>
      <div class="detail-grid detail-grid--highlights">
        ${feature.highlights.map((item, index) => `<article class="detail-card"><span class="detail-card__index">0${index + 1}</span><p>${item}</p></article>`).join('')}
      </div>
    </section>

    <section class="section">
      <div class="section-heading">
        <div class="eyebrow">使用教程</div>
        <h2>第一次看这个功能页，建议按这 3 步理解</h2>
      </div>
      <div class="tutorial-list">
        ${feature.tutorial.map((step, index) => `<article class="tutorial-step"><div class="tutorial-step__num">${index + 1}</div><div><h3>${step.title}</h3><p>${step.body}</p></div></article>`).join('')}
      </div>
    </section>

    <section class="section">
      <div class="section-heading">
        <div class="eyebrow">适用场景</div>
        <h2>这个功能适合拿来做什么</h2>
      </div>
      <div class="badge-row badge-row--scenario">
        ${feature.scenarios.map((item) => `<span>${item}</span>`).join('')}
      </div>
      <div class="cta-panel cta-panel--detail">
        <a class="button button--primary" href="./index.html#contact">接入正式域名 / 联系方式</a>
        <span>这页后面也可以继续替换成真实软件截图版，我已经先把结构给你铺好了。</span>
      </div>
    </section>
  `
}

if (pageType === 'home') renderFeatureGrid()
if (pageType === 'feature') renderFeatureDetail()
