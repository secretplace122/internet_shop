const API_URL = 'https://functions.yandexcloud.net/d4eengms62slq876jbka';
const CACHE_KEY = 'productsCache';
const CACHE_TTL = 5 * 60 * 1000;
const VERSION_KEY = 'dataVersion';

document.addEventListener('DOMContentLoaded', async () => {
  await checkDataVersion();
  const urlParams = new URLSearchParams(window.location.search);
  const forceRefresh = urlParams.has('refresh');
  await loadProductsFromFirestore(forceRefresh);
  setupCart();
  setupFilters();
  subscribeToProducts();
  if (urlParams.get('checkout') === 'open') {
    setTimeout(() => showCheckoutForm(), 500);
  }
});

let cart = JSON.parse(localStorage.getItem('cart')) || [];
let currentProducts = [];
let unsubscribeProducts = null;

async function checkDataVersion() {
  try {
    const remoteVersionDoc = await db.collection('counters').doc('dataVersion').get();
    const remoteVersion = remoteVersionDoc.exists ? remoteVersionDoc.data().version : 0;
    const localVersion = parseInt(localStorage.getItem(VERSION_KEY)) || 0;
    if (remoteVersion !== localVersion) {
      clearProductsCache();
      localStorage.setItem(VERSION_KEY, remoteVersion);
    }
  } catch (e) {
    console.warn('Version check failed, proceeding with cache');
  }
}

async function loadProductsFromFirestore(forceRefresh = false) {
  const container = document.getElementById('products-container');
  if (!container) return;
  if (!forceRefresh) {
    const cached = getCachedProducts();
    if (cached) {
      currentProducts = cached;
      const reviewsData = await fetchReviewsData(cached.map(p => p.id));
      renderProductsFromData(cached, reviewsData);
      return;
    }
  }
  try {
    const snapshot = await db.collection('products').get();
    const products = [];
    snapshot.forEach(doc => products.push({ id: doc.id, ...doc.data() }));
    currentProducts = products;
    setCachedProducts(products);
    const reviewsData = await fetchReviewsData(products.map(p => p.id));
    renderProductsFromData(products, reviewsData);
  } catch (error) {
    console.warn('Ошибка загрузки:', error);
    const cached = getCachedProducts(true);
    if (cached) {
      currentProducts = cached;
      renderProductsFromData(cached, {});
    } else {
      renderProductsFromData([], {});
    }
  }
}

async function fetchReviewsData(productIds) {
  if (!productIds.length) return {};
  try {
    const snapshot = await db.collection('reviews')
      .where('productId', 'in', productIds)
      .where('approved', '==', true)
      .get();
    const data = {};
    snapshot.forEach(doc => {
      const r = doc.data();
      if (!data[r.productId]) data[r.productId] = { total: 0, count: 0 };
      data[r.productId].total += r.rating;
      data[r.productId].count += 1;
    });
    const result = {};
    for (const [id, val] of Object.entries(data)) {
      result[id] = { avg: (val.total / val.count).toFixed(1), count: val.count };
    }
    return result;
  } catch (e) {
    return {};
  }
}

function applyFilters() {
  const priceSlider = document.getElementById('filter-price');
  const ratingSelect = document.getElementById('filter-rating');
  const saleCheckbox = document.getElementById('filter-sale');
  if (!priceSlider || !ratingSelect || !saleCheckbox) return currentProducts;
  const maxPrice = parseInt(priceSlider.value);
  const minRating = parseInt(ratingSelect.value);
  const saleOnly = saleCheckbox.checked;
  return currentProducts.filter(p => {
    if (maxPrice && p.price > maxPrice) return false;
    if (saleOnly && !p.sale) return false;
    if (minRating > 0) {
      const card = document.querySelector(`.product-card[data-id="${p.id}"]`);
      if (card) {
        const ratingEl = card.querySelector('.rating-value');
        if (ratingEl && parseFloat(ratingEl.textContent) < minRating) return false;
      }
    }
    return true;
  });
}

function setupFilters() {
  const filterBar = document.querySelector('.filter-bar');
  if (!filterBar) return;
  const priceSlider = document.getElementById('filter-price');
  const priceValue = document.getElementById('filter-price-value');
  const ratingSelect = document.getElementById('filter-rating');
  const saleCheckbox = document.getElementById('filter-sale');
  const resetBtn = document.getElementById('filter-reset');
  priceSlider.addEventListener('input', () => {
    priceValue.textContent = priceSlider.value + ' ₽';
    renderFilteredProducts();
  });
  ratingSelect.addEventListener('change', renderFilteredProducts);
  saleCheckbox.addEventListener('change', renderFilteredProducts);
  resetBtn.addEventListener('click', () => {
    priceSlider.value = priceSlider.max;
    priceValue.textContent = priceSlider.max + ' ₽';
    ratingSelect.value = '0';
    saleCheckbox.checked = false;
    renderFilteredProducts();
  });
}

function renderFilteredProducts() {
  const filtered = applyFilters();
  const container = document.getElementById('products-container');
  if (!container) return;
  container.innerHTML = '';
  filtered.forEach(p => {
    const cardHtml = createProductCardHtml(p);
    const temp = document.createElement('div');
    temp.innerHTML = cardHtml;
    const newCard = temp.firstElementChild;
    container.appendChild(newCard);
    const productId = newCard.dataset.id;
    const product = currentProducts.find(p => p.id === productId);
    if (product) {
      const controls = newCard.querySelector('.cart-controls');
      if (controls) controls.innerHTML = createCartControls(newCard, product);
      setupCardGallery(newCard);
    }
    addCardListeners(newCard);
  });
  updateAllCartControls();
  if (document.getElementById('cart-modal').style.display === 'flex') renderCart();
}

function renderProductsFromData(products, reviewsData) {
  const container = document.getElementById('products-container');
  if (!container) return;
  if (products.length === 0) {
    container.innerHTML = '<p>Товаров пока нет.</p>';
    return;
  }
  container.innerHTML = products.map(p => {
    const rev = reviewsData[p.id] || { avg: '0.0', count: 0 };
    const badgeHtml = p.badge ? `<span class="badge" style="background:${p.badge.bgColor};color:${p.badge.color}">${p.badge.text}</span>` : '';
    const allImages = [p.image, ...(p.images || [])];
    const slidesHtml = allImages.map(url => `
      <div class="card-gallery-slide">
        <div class="blur-bg" style="background-image: url('${url}')"></div>
        <img src="${url}" alt="${p.title}">
      </div>
    `).join('');
    const dotsHtml = allImages.map((_, idx) => `<span class="card-dot${idx === 0 ? ' active' : ''}" data-index="${idx}"></span>`).join('');

    let variantsHtml = '';
    let variantStockHtml = '';
    if (p.variants && Array.isArray(p.variants) && p.variants.length > 0) {
      const firstVariant = p.variants[0];
      const available = firstVariant.options.find(o => o.stock > 0);
      const defaultOption = available || firstVariant.options[0];
      variantsHtml = `
        <div class="variant-row" data-variant-name="${firstVariant.name || 'Размер'}">
          ${firstVariant.options.map(opt => `
            <span class="variant-pill${opt.stock === 0 ? ' disabled' : ''}${opt.value === defaultOption.value ? ' active' : ''}"
                  data-value="${opt.value}" data-stock="${opt.stock ?? 0}">
              ${opt.value}
            </span>
          `).join('')}
        </div>`;
      variantStockHtml = `<span class="variant-stock">Осталось: ${defaultOption.stock ?? 0} шт.</span>`;
    } else {
      variantsHtml = '<div class="variant-row-placeholder"></div>';
      variantStockHtml = `<span class="stock-badge">Осталось: ${p.stock ?? 0} шт.</span>`;
    }

    let priceBlockHtml = `<div class="price">${p.price.toLocaleString()} ₽</div>`;
    if (p.oldPrice && p.oldPrice > p.price) {
      const discount = Math.round((1 - p.price / p.oldPrice) * 100);
      priceBlockHtml = `
        <div class="price">${p.price.toLocaleString()} ₽</div>
        <div class="old-price">${p.oldPrice.toLocaleString()} ₽</div>
        <div class="discount-badge">-${discount}%</div>
      `;
    }

    return `
      <div class="product-card" data-id="${p.id}">
        <div class="card-gallery">
          <div class="card-gallery-slider">${slidesHtml}</div>
          <div class="card-dots">${dotsHtml}</div>
          ${badgeHtml}
        </div>
        <div class="product-info">
          <h3>${p.title}</h3>
          <p class="description">${p.description}</p>
          <div class="rating-row">
            <span class="rating-star">★</span>
            <span class="rating-value">${rev.avg}</span>
            <span class="review-icon">
              <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              ${rev.count}
            </span>
          </div>
          ${variantStockHtml}
          ${variantsHtml}
          <div class="price-block">
            ${priceBlockHtml}
          </div>
          <div class="cart-controls" id="controls-${p.id}"></div>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.product-card').forEach(card => {
    const productId = card.dataset.id;
    const product = currentProducts.find(p => p.id === productId);
    if (product) {
      const controls = card.querySelector('.cart-controls');
      if (controls) controls.innerHTML = createCartControls(card, product);
      setupCardGallery(card);
    }
    addCardListeners(card);
  });
}

function setupCardGallery(card) {
  const slider = card.querySelector('.card-gallery-slider');
  const dots = card.querySelectorAll('.card-dot');
  if (!slider || dots.length === 0) return;
  let currentIndex = 0;
  slider.addEventListener('scroll', () => {
    const index = Math.round(slider.scrollLeft / slider.clientWidth);
    if (index !== currentIndex) {
      currentIndex = index;
      dots.forEach(dot => dot.classList.remove('active'));
      if (dots[currentIndex]) dots[currentIndex].classList.add('active');
    }
  });
  dots.forEach(dot => {
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(dot.dataset.index);
      slider.scrollTo({ left: idx * slider.clientWidth, behavior: 'smooth' });
    });
  });
}

function addCardListeners(card) {
  card.addEventListener('click', (e) => {
    if (e.target.closest('button') || e.target.closest('.variant-pill') || e.target.closest('.card-dot')) return;
    window.location.href = `products/${card.dataset.id}/`;
  });
  card.querySelectorAll('.variant-pill:not(.disabled)').forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      const row = pill.parentElement;
      row.querySelectorAll('.variant-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const productId = card.dataset.id;
      const stockEl = card.querySelector('.variant-stock, .stock-badge');
      if (stockEl) stockEl.textContent = `Осталось: ${pill.dataset.stock} шт.`;
      updateCartControlsForCard(productId);
    });
  });
  card.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleCartAction(e);
    });
  });
}

function createCartControls(card, product) {
  const variantRow = card.querySelector('.variant-row');
  let maxStock = product.stock ?? 0;
  let variantValue = null;
  if (variantRow && product.variants?.length) {
    const activePill = variantRow.querySelector('.variant-pill.active');
    if (activePill) {
      maxStock = parseInt(activePill.dataset.stock) || 0;
      variantValue = activePill.dataset.value;
    }
  }
  const cartItem = variantValue
    ? cart.find(item => item.id === product.id && item.variant?.value === variantValue)
    : cart.find(item => item.id === product.id && !item.variant);
  const currentQty = cartItem ? cartItem.qty : 0;

  if (maxStock === 0) return '<span class="out-of-stock">Нет в наличии</span>';
  if (currentQty > 0) {
    return `
      <div class="quantity-picker">
        <button class="qty-btn" data-action="decrease" data-id="${product.id}">−</button>
        <span class="qty-value">${currentQty}</span>
        <button class="qty-btn" data-action="increase" data-id="${product.id}" ${currentQty >= maxStock ? 'disabled' : ''}>+</button>
      </div>
      <button class="go-to-cart" data-action="go-cart">🛒</button>
    `;
  }
  return `<button class="add-to-cart" data-id="${product.id}" data-action="add">В корзину</button>`;
}

function subscribeToProducts() {
  if (unsubscribeProducts) unsubscribeProducts();
  unsubscribeProducts = db.collection('products').onSnapshot(async (snapshot) => {
    const products = [];
    snapshot.forEach(doc => products.push({ id: doc.id, ...doc.data() }));
    setCachedProducts(products);
    currentProducts = products;
    const container = document.getElementById('products-container');
    if (!container) return;
    const existingIds = new Set(products.map(p => p.id));
    container.querySelectorAll('.product-card').forEach(card => {
      if (!existingIds.has(card.dataset.id)) card.remove();
    });
    for (const product of products) {
      const card = container.querySelector(`.product-card[data-id="${product.id}"]`);
      if (!card) {
        const temp = document.createElement('div');
        temp.innerHTML = createProductCardHtml(product);
        const newCard = temp.firstElementChild;
        container.appendChild(newCard);
        setupCardGallery(newCard);
        addCardListeners(newCard);
      } else {
        updateProductCardFromData(card, product);
      }
    }
    updateAllCartControls();
    if (document.getElementById('cart-modal').style.display === 'flex') renderCart();
  }, (error) => console.error('Ошибка подписки на товары:', error));
}

function createProductCardHtml(product) {
  const allImages = [product.image, ...(product.images || [])];
  const slidesHtml = allImages.map(url => `
    <div class="card-gallery-slide">
      <div class="blur-bg" style="background-image: url('${url}')"></div>
      <img src="${url}" alt="${product.title}">
    </div>
  `).join('');
  const dotsHtml = allImages.map((_, idx) => `<span class="card-dot${idx === 0 ? ' active' : ''}" data-index="${idx}"></span>`).join('');
  let variantsHtml = '';
  let variantStockHtml = '';
  if (product.variants && Array.isArray(product.variants) && product.variants.length > 0) {
    const firstVariant = product.variants[0];
    const available = firstVariant.options.find(o => o.stock > 0);
    const defaultOption = available || firstVariant.options[0];
    variantsHtml = `
      <div class="variant-row" data-variant-name="${firstVariant.name || 'Размер'}">
        ${firstVariant.options.map(opt => `
          <span class="variant-pill${opt.stock === 0 ? ' disabled' : ''}${opt.value === defaultOption.value ? ' active' : ''}"
                data-value="${opt.value}" data-stock="${opt.stock ?? 0}">
            ${opt.value}
          </span>
        `).join('')}
      </div>`;
    variantStockHtml = `<span class="variant-stock">Осталось: ${defaultOption.stock ?? 0} шт.</span>`;
  } else {
    variantsHtml = '<div class="variant-row-placeholder"></div>';
    variantStockHtml = `<span class="stock-badge">Осталось: ${product.stock ?? 0} шт.</span>`;
  }
  let priceBlockHtml = `<div class="price">${product.price.toLocaleString()} ₽</div>`;
  if (product.oldPrice && product.oldPrice > product.price) {
    const discount = Math.round((1 - product.price / product.oldPrice) * 100);
    priceBlockHtml = `
      <div class="price">${product.price.toLocaleString()} ₽</div>
      <div class="old-price">${product.oldPrice.toLocaleString()} ₽</div>
      <div class="discount-badge">-${discount}%</div>
    `;
  }
  return `
    <div class="product-card" data-id="${product.id}">
      <div class="card-gallery">
        <div class="card-gallery-slider">${slidesHtml}</div>
        <div class="card-dots">${dotsHtml}</div>
      </div>
      <div class="product-info">
        <h3>${product.title}</h3>
        <p class="description">${product.description}</p>
        <div class="rating-row">
          <span class="rating-star">★</span>
          <span class="rating-value">0.0</span>
          <span class="review-icon">
            <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg> 0
          </span>
        </div>
        ${variantStockHtml}
        ${variantsHtml}
        <div class="price-block">${priceBlockHtml}</div>
        <div class="cart-controls" id="controls-${product.id}"></div>
      </div>
    </div>
  `;
}

function updateProductCardFromData(card, product) {
  const variantRow = card.querySelector('.variant-row');
  let stockText = '';
  if (product.variants && Array.isArray(product.variants) && product.variants.length > 0 && variantRow) {
    const variant = product.variants[0];
    const activePill = variantRow.querySelector('.variant-pill.active');
    const activeValue = activePill ? activePill.dataset.value : null;
    variantRow.innerHTML = variant.options.map(opt => {
      const isActive = opt.value === activeValue && opt.stock > 0;
      return `<span class="variant-pill${opt.stock === 0 ? ' disabled' : ''}${isActive ? ' active' : ''}"
                   data-value="${opt.value}" data-stock="${opt.stock ?? 0}">${opt.value}</span>`;
    }).join('');
    variantRow.setAttribute('data-variant-name', variant.name || 'Размер');
    if (!variantRow.querySelector('.variant-pill.active')) {
      const firstAvailable = variantRow.querySelector('.variant-pill:not(.disabled)');
      if (firstAvailable) firstAvailable.classList.add('active');
    }
    const newActive = variantRow.querySelector('.variant-pill.active');
    stockText = newActive ? `Осталось: ${newActive.dataset.stock} шт.` : 'Нет в наличии';
  } else {
    stockText = `Осталось: ${product.stock ?? 0} шт.`;
    if (!card.querySelector('.variant-row-placeholder') && !card.querySelector('.variant-row')) {
      const placeholder = document.createElement('div');
      placeholder.className = 'variant-row-placeholder';
      const info = card.querySelector('.product-info');
      const stockEl = info.querySelector('.variant-stock, .stock-badge');
      if (stockEl) stockEl.insertAdjacentElement('afterend', placeholder);
    }
  }
  const stockEl = card.querySelector('.variant-stock') || card.querySelector('.stock-badge');
  if (stockEl) stockEl.textContent = stockText;
  const controls = card.querySelector('.cart-controls');
  if (controls) controls.innerHTML = createCartControls(card, product);
  const priceBlock = card.querySelector('.price-block');
  if (priceBlock) {
    let html = `<div class="price">${product.price.toLocaleString()} ₽</div>`;
    if (product.oldPrice && product.oldPrice > product.price) {
      const discount = Math.round((1 - product.price / product.oldPrice) * 100);
      html += `<div class="old-price">${product.oldPrice.toLocaleString()} ₽</div><div class="discount-badge">-${discount}%</div>`;
    }
    priceBlock.innerHTML = html;
  }
}

function getCachedProducts(ignoreExpiry = false) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw);
    if (!cache.timestamp || !Array.isArray(cache.products)) return null;
    if (!ignoreExpiry && Date.now() - cache.timestamp > CACHE_TTL) return null;
    return cache.products;
  } catch (e) { return null; }
}

function setCachedProducts(products) {
  const cache = { timestamp: Date.now(), products };
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

function clearProductsCache() { localStorage.removeItem(CACHE_KEY); }

function getSelectedVariant(productId) {
  const card = document.querySelector(`.product-card[data-id="${productId}"]`);
  if (!card) return null;
  const activePill = card.querySelector('.variant-pill.active');
  if (!activePill) return null;
  const variantRow = card.querySelector('.variant-row');
  const product = currentProducts.find(p => p.id === productId);
  const variantName = variantRow?.dataset?.variantName || product?.variants?.[0]?.name || 'Размер';
  return { name: variantName, value: activePill.dataset.value, stock: parseInt(activePill.dataset.stock) };
}

function updateCartControlsForCard(productId) {
  const card = document.querySelector(`.product-card[data-id="${productId}"]`);
  if (!card) return;
  const controls = card.querySelector('.cart-controls');
  if (!controls) return;
  const product = currentProducts.find(p => p.id === productId);
  if (!product) return;
  controls.innerHTML = createCartControls(card, product);
  addCardListeners(card);
}

function handleCartAction(e) {
  e.stopPropagation();
  const action = e.target.dataset.action;
  const productId = e.target.dataset.id || e.target.closest('.product-card').dataset.id;
  const product = currentProducts.find(p => p.id === productId);
  if (!product) return;

  const variant = getSelectedVariant(productId);
  const maxStock = variant ? variant.stock : (product.stock ?? 0);

  if (action === 'add') {
    if (maxStock <= 0) return;
    addToCart(product, 1, variant);
  } else if (action === 'increase') {
    const cartItem = cart.find(item => item.id === productId && 
      (variant ? item.variant?.value === variant.value : !item.variant));
    if (cartItem && cartItem.qty < maxStock) {
      addToCart(product, 1, variant);
    }
  } else if (action === 'decrease') {
    const cartItem = cart.find(item => item.id === productId && 
      (variant ? item.variant?.value === variant.value : !item.variant));
    if (cartItem) {
      if (cartItem.qty > 1) {
        addToCart(product, -1, variant);
      } else {
        removeFromCart(productId, variant);
      }
    }
  } else if (action === 'go-cart') {
    document.getElementById('cart-modal').style.display = 'flex';
    renderCart();
  }
  updateCartUI();
  updateCartControlsForCard(productId);
  if (document.getElementById('cart-modal').style.display === 'flex') renderCart();
}

function addToCart(product, delta = 1, variant = null) {
  const maxStock = variant ? variant.stock : (product.stock ?? 0);
  if (maxStock <= 0 && delta > 0) return;

  const existing = cart.find(item => item.id === product.id && 
    (variant ? item.variant?.value === variant.value : !item.variant));
  const currentQty = existing ? existing.qty : 0;
  const newQty = currentQty + delta;

  if (newQty > maxStock) return;
  if (newQty <= 0) {
    cart = cart.filter(item => !(item.id === product.id && 
      (variant ? item.variant?.value === variant.value : !item.variant)));
  } else if (existing) {
    existing.qty = newQty;
  } else {
    cart.push({
      id: product.id,
      title: product.title,
      price: product.price,
      image: product.images?.[0] || product.image,
      qty: delta,
      variant: variant ? { name: variant.name, value: variant.value } : null
    });
  }
  saveCart();
}

function removeFromCart(productId, variant = null) {
  cart = cart.filter(item => !(item.id === productId && 
    (variant ? item.variant?.value === variant.value : !item.variant)));
  saveCart();
}

function setupCart() {
  updateCartUI();
  const modal = document.getElementById('cart-modal');
  const floatBtn = document.getElementById('cart-float-btn');
  const closeBtn = modal.querySelector('.close');
  floatBtn.addEventListener('click', () => { renderCart(); modal.style.display = 'flex'; });
  closeBtn.addEventListener('click', () => modal.style.display = 'none');
  window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
  document.getElementById('checkout-btn').addEventListener('click', () => {
    if (cart.length === 0) alert('Корзина пуста');
    else { modal.style.display = 'none'; showCheckoutForm(); }
  });
}

function saveCart() { localStorage.setItem('cart', JSON.stringify(cart)); }
function updateCartUI() {
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  document.getElementById('cart-count').textContent = count;
}

function renderCart() {
  const container = document.getElementById('cart-items');
  const totalEl = document.getElementById('cart-total-price');
  if (!container || !totalEl) return;
  if (cart.length === 0) { container.innerHTML = '<p>Корзина пуста</p>'; totalEl.textContent = '0'; return; }
  if (!container._renderedItems || container._renderedItems.length !== cart.length) {
    container.innerHTML = cart.map(item => {
      const product = currentProducts.find(p => p.id === item.id);
      let max = product ? (product.stock ?? 0) : 0;
      if (item.variant && product && Array.isArray(product.variants)) {
        const variant = product.variants.find(v => v.name === item.variant.name);
        if (variant && Array.isArray(variant.options)) {
          const option = variant.options.find(o => o.value === item.variant.value);
          if (option) max = option.stock;
        }
      }
      return `
        <div class="cart-item" data-id="${item.id}" data-variant-value="${item.variant?.value || ''}">
          <div class="cart-item-info">
            <img src="${item.image}" alt="${item.title}" class="cart-item-image">
            <div class="cart-item-details">
              <div class="cart-item-title">${item.title}</div>
              ${item.variant ? `<div class="cart-item-variant">${item.variant.name}: ${item.variant.value}</div>` : ''}
              <div class="cart-item-price">${item.price.toLocaleString()} ₽</div>
            </div>
          </div>
          <div class="cart-item-actions">
            <div class="cart-item-qty">
              <button class="cart-qty-btn" data-action="cart-decrease" data-id="${item.id}" data-variant-value="${item.variant?.value || ''}">−</button>
              <span class="cart-item-count">${item.qty}</span>
              <button class="cart-qty-btn" data-action="cart-increase" data-id="${item.id}" data-variant-value="${item.variant?.value || ''}" ${item.qty >= max ? 'disabled' : ''}>+</button>
            </div>
            <button class="cart-remove-btn" data-action="cart-remove" data-id="${item.id}" data-variant-value="${item.variant?.value || ''}">🗑</button>
          </div>
        </div>
      `;
    }).join('');
    container.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', handleCartItemAction));
  } else {
    cart.forEach(item => {
      const cartItemEl = container.querySelector(`.cart-item[data-id="${item.id}"][data-variant-value="${item.variant?.value || ''}"]`);
      if (cartItemEl) {
        const countSpan = cartItemEl.querySelector('.cart-item-count');
        if (countSpan) countSpan.textContent = item.qty;
        const plusBtn = cartItemEl.querySelector('[data-action="cart-increase"]');
        if (plusBtn) {
          const product = currentProducts.find(p => p.id === item.id);
          let max = product ? (product.stock ?? 0) : 0;
          if (item.variant && product && Array.isArray(product.variants)) {
            const variant = product.variants.find(v => v.name === item.variant.name);
            if (variant && Array.isArray(variant.options)) {
              const option = variant.options.find(o => o.value === item.variant.value);
              if (option) max = option.stock;
            }
          }
          plusBtn.disabled = item.qty >= max;
        }
      }
    });
  }
  container._renderedItems = cart.map(item => ({id: item.id, variantValue: item.variant?.value || ''}));
  const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  totalEl.textContent = total.toLocaleString();
}

function handleCartItemAction(e) {
  const action = e.target.dataset.action;
  const productId = e.target.dataset.id;
  const variantValue = e.target.dataset.variantValue;
  const product = currentProducts.find(p => p.id === productId);
  const variantKey = variantValue || undefined;
  const variant = variantKey && product ? { name: product?.variants?.[0]?.name || 'Размер', value: variantKey } : null;
  const cartItem = cart.find(item => item.id === productId && item.variant?.value === variantKey);
  if (!cartItem) return;
  if (action === 'cart-increase') {
    let max = product ? (product.stock ?? 0) : 0;
    if (variant && product && Array.isArray(product.variants)) {
      const foundVariant = product.variants.find(v => v.name === variant.name);
      if (foundVariant && Array.isArray(foundVariant.options)) {
        const option = foundVariant.options.find(o => o.value === variant.value);
        if (option) max = option.stock;
      }
    }
    if (cartItem.qty < max) { cartItem.qty += 1; saveCart(); }
  } else if (action === 'cart-decrease') {
    if (cartItem.qty > 1) { cartItem.qty -= 1; saveCart(); }
    else removeFromCart(productId, variant);
  } else if (action === 'cart-remove') {
    removeFromCart(productId, variant);
  }
  renderCart(); updateCartUI();
  updateCartControlsForCard(productId);
}

function updateAllCartControls() {
  document.querySelectorAll('.product-card').forEach(card => updateCartControlsForCard(card.dataset.id));
}

function showCheckoutForm() {
  const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const overlay = document.createElement('div');
  overlay.className = 'modal';
  overlay.style.display = 'flex';
  overlay.id = 'checkout-modal';
  overlay.innerHTML = `
    <div class="modal-content">
      <button class="close" id="checkout-close">✕</button>
      <h2>Оформление заказа</h2>
      <form id="checkout-form">
        <div class="order-form-group"><label>Имя *</label><input type="text" id="customer-name" required placeholder="Иван Иванов"></div>
        <div class="order-form-group"><label>Телефон *</label><input type="tel" id="customer-phone" required placeholder="+7 999 123-45-67"></div>
        <div class="order-form-group"><label>Email</label><input type="email" id="customer-email" placeholder="email@example.com"></div>
        <div class="order-form-group"><label>Адрес доставки *</label><textarea id="customer-address" rows="2" required placeholder="Город, улица, дом, квартира"></textarea></div>
        <div class="order-total">Итого: ${total.toLocaleString()} ₽</div>
        <button type="submit" class="btn" id="pay-btn">Перейти к оплате</button>
      </form>
      <p id="checkout-error" class="error-message"></p>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('checkout-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.getElementById('checkout-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const payBtn = document.getElementById('pay-btn');
    const errorEl = document.getElementById('checkout-error');
    if (cart.length === 0) { errorEl.textContent = 'Корзина пуста'; return; }
    payBtn.disabled = true;
    payBtn.textContent = 'Создаём платёж...';
    errorEl.textContent = '';
    const orderData = {
      items: cart.map(item => ({ id: item.id, qty: item.qty, variantName: item.variant?.name || null, variantValue: item.variant?.value || null })),
      customerName: document.getElementById('customer-name').value.trim(),
      customerPhone: document.getElementById('customer-phone').value.trim(),
      customerEmail: document.getElementById('customer-email').value.trim(),
      deliveryAddress: document.getElementById('customer-address').value.trim()
    };
    let timeoutId;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 15000);
      const recaptchaToken = await grecaptcha.execute('6Ldue0wtAAAAAI-20EzQTUORuxLArIS9R3zmHOsL', {action: 'checkout'});
      orderData.recaptchaToken = recaptchaToken;
      const response = await fetch(API_URL + '?path=/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        if (errData.error && errData.error.includes('недостаточно')) {
          errorEl.textContent = errData.error;
          cart = [];
          saveCart();
          updateCartUI();
          clearProductsCache();
          loadProductsFromFirestore(true);
          return;
        }
        throw new Error(errData.error || `Ошибка: ${response.status}`);
      }
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      if (result.confirmationUrl) {
        cart = [];
        saveCart();
        updateCartUI();
        window.location.href = result.confirmationUrl;
      } else throw new Error('Нет ссылки на оплату');
    } catch (err) {
      clearTimeout(timeoutId);
      errorEl.textContent = 'Ошибка: ' + err.message;
      payBtn.disabled = false;
      payBtn.textContent = 'Перейти к оплате';
    }
  });
}