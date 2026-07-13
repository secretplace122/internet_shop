const API_URL = 'https://functions.yandexcloud.net/d4eengms62slq876jbka';
const CACHE_KEY = 'productsCache';
const CACHE_TTL = 5 * 60 * 1000;
const VERSION_KEY = 'dataVersion';

document.addEventListener('DOMContentLoaded', async () => {
  await checkDataVersion();
  const urlParams = new URLSearchParams(window.location.search);
  const forceRefresh = urlParams.has('refresh');
  loadProducts(forceRefresh);
  setupCart();
});

let cart = JSON.parse(localStorage.getItem('cart')) || [];
let currentProducts = [];

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

async function loadProducts(forceRefresh = false) {
  const container = document.getElementById('products-container');
  container.innerHTML = '<p>Загрузка товаров…</p>';

  if (!forceRefresh) {
    const cached = getCachedProducts();
    if (cached) {
      currentProducts = cached;
      const reviewsData = await fetchReviewsData(cached.map(p => p.id));
      renderProducts(cached, reviewsData);
      return;
    }
  }

  try {
    if (typeof db === 'undefined') throw new Error('Firebase не подключена');
    const snapshot = await db.collection('products').get();
    const products = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      products.push({ id: doc.id, ...data });
    });
    currentProducts = products;
    setCachedProducts(products);
    const reviewsData = await fetchReviewsData(products.map(p => p.id));
    renderProducts(products, reviewsData);
  } catch (error) {
    console.warn('Ошибка загрузки:', error);
    const cached = getCachedProducts(true);
    if (cached) {
      currentProducts = cached;
      renderProducts(cached, {});
    } else {
      renderProducts([], {});
    }
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
  } catch (e) {
    return null;
  }
}

function setCachedProducts(products) {
  const cache = { timestamp: Date.now(), products };
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

function clearProductsCache() {
  localStorage.removeItem(CACHE_KEY);
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

function renderProducts(products, reviewsData) {
  const container = document.getElementById('products-container');
  if (products.length === 0) {
    container.innerHTML = '<p>Товаров пока нет.</p>';
    return;
  }

  container.innerHTML = products.map(p => {
    const badgeHtml = p.badge ? `<span class="badge" style="background:${p.badge.bgColor};color:${p.badge.color}">${p.badge.text}</span>` : '';
    const images = (p.images && p.images.length) ? p.images : [p.image];
    const galleryHtml = `
      <div class="card-gallery">
        <div class="card-gallery-scroll">
          ${images.map(url => `<img src="${url}" alt="${p.title}" loading="lazy">`).join('')}
        </div>
        ${badgeHtml}
      </div>`;

    const rev = reviewsData[p.id] || { avg: '0', count: 0 };

    let variantsHtml = '';
    let variantStockHtml = '';
    let activeVariantValue = null;
    let activeVariantStock = p.stock || 0;

    if (p.variants && Array.isArray(p.variants) && p.variants.length > 0) {
      const firstVariant = p.variants[0];
      const available = firstVariant.options.find(o => o.stock > 0);
      const defaultOption = available || firstVariant.options[0];
      variantsHtml = `
        <div class="variant-row" data-variant-name="${firstVariant.name}">
          ${firstVariant.options.map(opt => `
            <span class="variant-pill${opt.stock === 0 ? ' disabled' : ''}${opt.value === defaultOption.value ? ' active' : ''}"
                  data-value="${opt.value}" data-stock="${opt.stock}">
              ${opt.value}
            </span>
          `).join('')}
        </div>`;
      variantStockHtml = `<span class="variant-stock" id="stock-${p.id}">Осталось: ${defaultOption.stock} шт.</span>`;
      activeVariantValue = defaultOption.value;
      activeVariantStock = defaultOption.stock;
    } else {
      variantStockHtml = `<span class="stock-badge">Осталось: ${p.stock || 0} шт.</span>`;
    }

    const cartItem = cart.find(item => item.id === p.id && item.variant?.value === activeVariantValue);
    const currentQty = cartItem ? cartItem.qty : 0;
    const maxQty = activeVariantStock;

    let cartControlsHtml;
    if (maxQty === 0) {
      cartControlsHtml = '<span class="out-of-stock">Нет в наличии</span>';
    } else if (currentQty > 0) {
      cartControlsHtml = `
        <div class="quantity-picker">
          <button class="qty-btn" data-action="decrease" data-id="${p.id}">−</button>
          <span class="qty-value">${currentQty}</span>
          <button class="qty-btn" data-action="increase" data-id="${p.id}" ${currentQty >= maxQty ? 'disabled' : ''}>+</button>
        </div>
        <button class="go-to-cart" data-action="go-cart">🛒</button>
      `;
    } else {
      cartControlsHtml = `
        <button class="add-to-cart" data-id="${p.id}" data-action="add">В корзину</button>
      `;
    }

    return `
      <div class="product-card" data-id="${p.id}">
        ${galleryHtml}
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
          <div class="price">${p.price.toLocaleString()} ₽</div>
          <div class="cart-controls" id="controls-${p.id}">
            ${cartControlsHtml}
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('.variant-pill')) return;
      window.location.href = `products/${card.dataset.id}/`;
    });
  });

  container.querySelectorAll('.variant-pill:not(.disabled)').forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      const row = pill.parentElement;
      row.querySelectorAll('.variant-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const productId = pill.closest('.product-card').dataset.id;
      const stockEl = document.getElementById(`stock-${productId}`);
      if (stockEl) {
        stockEl.textContent = `Осталось: ${pill.dataset.stock} шт.`;
      }
      updateCartControlsForCard(productId);
    });
  });

  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleCartAction(e);
    });
  });
}

function getSelectedVariant(productId) {
  const card = document.querySelector(`.product-card[data-id="${productId}"]`);
  if (!card) return null;
  const activePill = card.querySelector('.variant-pill.active');
  if (!activePill) return null;
  const variantName = card.querySelector('.variant-row')?.dataset.variantName;
  return { name: variantName, value: activePill.dataset.value, stock: parseInt(activePill.dataset.stock) };
}

function updateCartControlsForCard(productId) {
  const card = document.querySelector(`.product-card[data-id="${productId}"]`);
  if (!card) return;
  const controls = card.querySelector('.cart-controls');
  const product = currentProducts.find(p => p.id === productId);
  if (!product) return;

  let max = product.stock || 0;
  let variant = null;

  if (product.variants && Array.isArray(product.variants) && product.variants.length > 0) {
    const activePill = card.querySelector('.variant-pill.active');
    if (activePill) {
      const variantName = card.querySelector('.variant-row')?.dataset.variantName;
      const value = activePill.dataset.value;
      max = parseInt(activePill.dataset.stock) || 0;
      variant = { name: variantName, value, stock: max };
    }
  }

  const cartItem = variant
    ? cart.find(item => item.id === productId && item.variant?.value === variant.value)
    : cart.find(item => item.id === productId && !item.variant);
  const currentQty = cartItem ? cartItem.qty : 0;

  if (max === 0) {
    controls.innerHTML = '<span class="out-of-stock">Нет в наличии</span>';
  } else if (currentQty > 0) {
    controls.innerHTML = `
      <div class="quantity-picker">
        <button class="qty-btn" data-action="decrease" data-id="${productId}">−</button>
        <span class="qty-value">${currentQty}</span>
        <button class="qty-btn" data-action="increase" data-id="${productId}" ${currentQty >= max ? 'disabled' : ''}>+</button>
      </div>
      <button class="go-to-cart" data-action="go-cart">🛒</button>
    `;
  } else {
    controls.innerHTML = `
      <button class="add-to-cart" data-id="${productId}" data-action="add">В корзину</button>
    `;
  }

  controls.querySelectorAll('[data-action]').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      handleCartAction(e);
    });
  });
}

function handleCartAction(e) {
  e.stopPropagation();
  const action = e.target.dataset.action;
  const productId = e.target.dataset.id || e.target.closest('.product-card').dataset.id;
  const product = currentProducts.find(p => p.id === productId);
  if (!product) return;

  const variant = getSelectedVariant(productId);
  const maxStock = variant ? variant.stock : (product.stock || 0);

  if (action === 'add') {
    if (maxStock <= 0) return;
    addToCart(product, 1, variant);
  } else if (action === 'increase') {
    const cartItem = cart.find(item => item.id === productId && item.variant?.value === variant?.value);
    if (cartItem && cartItem.qty < maxStock) {
      addToCart(product, 1, variant);
    }
  } else if (action === 'decrease') {
    const cartItem = cart.find(item => item.id === productId && item.variant?.value === variant?.value);
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
  updateAllCartControls();
  if (document.getElementById('cart-modal').style.display === 'flex') {
    renderCart();
  }
}

function addToCart(product, delta = 1, variant = null) {
  const existing = cart.find(item => item.id === product.id && item.variant?.value === variant?.value);
  const maxStock = variant ? variant.stock : (product.stock || 0);
  if (existing) {
    const newQty = existing.qty + delta;
    if (newQty > maxStock) return;
    if (newQty <= 0) {
      cart = cart.filter(item => !(item.id === product.id && item.variant?.value === variant?.value));
    } else {
      existing.qty = newQty;
    }
  } else if (delta > 0 && maxStock >= delta) {
    cart.push({
      id: product.id,
      title: product.title,
      price: product.price,
      image: product.images?.[0] || product.image,
      qty: delta,
      variant: variant
    });
  }
  saveCart();
}

function removeFromCart(productId, variant = null) {
  cart = cart.filter(item => !(item.id === productId && item.variant?.value === variant?.value));
  saveCart();
}

function setupCart() {
  updateCartUI();
  const modal = document.getElementById('cart-modal');
  const floatBtn = document.getElementById('cart-float-btn');
  const closeBtn = modal.querySelector('.close');

  floatBtn.addEventListener('click', () => {
    renderCart();
    modal.style.display = 'flex';
  });
  closeBtn.addEventListener('click', () => modal.style.display = 'none');
  window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

  document.getElementById('checkout-btn').addEventListener('click', () => {
    if (cart.length === 0) {
      alert('Корзина пуста');
      return;
    }
    modal.style.display = 'none';
    showCheckoutForm();
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

  if (cart.length === 0) {
    container.innerHTML = '<p>Корзина пуста</p>';
    totalEl.textContent = '0';
    return;
  }

  container.innerHTML = cart.map(item => {
    const product = currentProducts.find(p => p.id === item.id);
    let max = product ? (product.stock || 0) : 0;

    if (item.variant && product && Array.isArray(product.variants)) {
      const variant = product.variants.find(v => v.name === item.variant.name);
      if (variant && Array.isArray(variant.options)) {
        const option = variant.options.find(o => o.value === item.variant.value);
        if (option) max = option.stock;
      }
    }

    return `
      <div class="cart-item">
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
            <span>${item.qty}</span>
            <button class="cart-qty-btn" data-action="cart-increase" data-id="${item.id}" data-variant-value="${item.variant?.value || ''}" ${item.qty >= max ? 'disabled' : ''}>+</button>
          </div>
          <button class="cart-remove-btn" data-action="cart-remove" data-id="${item.id}" data-variant-value="${item.variant?.value || ''}">🗑</button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', handleCartItemAction);
  });

  const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  totalEl.textContent = total.toLocaleString();
}

function handleCartItemAction(e) {
  const action = e.target.dataset.action;
  const productId = e.target.dataset.id;
  const variantValue = e.target.dataset.variantValue;
  const product = currentProducts.find(p => p.id === productId);
  const variant = variantValue && product ? { name: product?.variants?.[0]?.name, value: variantValue } : null;
  const cartItem = cart.find(item => item.id === productId && item.variant?.value === variant?.value);

  if (action === 'cart-increase' && cartItem && product) {
    let max = product.stock || 0;
    if (variant && Array.isArray(product.variants)) {
      const foundVariant = product.variants.find(v => v.name === variant.name);
      if (foundVariant && Array.isArray(foundVariant.options)) {
        const option = foundVariant.options.find(o => o.value === variant.value);
        if (option) max = option.stock;
      }
    }
    if (cartItem.qty < max) {
      cartItem.qty += 1;
      saveCart();
    }
  } else if (action === 'cart-decrease' && cartItem) {
    if (cartItem.qty > 1) {
      cartItem.qty -= 1;
      saveCart();
    } else {
      removeFromCart(productId, variant);
    }
  } else if (action === 'cart-remove') {
    removeFromCart(productId, variant);
  }
  renderCart();
  updateCartUI();
  updateAllCartControls();
}

function updateAllCartControls() {
  document.querySelectorAll('.product-card').forEach(card => {
    updateCartControlsForCard(card.dataset.id);
  });
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
        <div class="order-form-group">
          <label>Имя *</label>
          <input type="text" id="customer-name" required placeholder="Иван Иванов">
        </div>
        <div class="order-form-group">
          <label>Телефон *</label>
          <input type="tel" id="customer-phone" required placeholder="+7 999 123-45-67">
        </div>
        <div class="order-form-group">
          <label>Email</label>
          <input type="email" id="customer-email" placeholder="email@example.com">
        </div>
        <div class="order-form-group">
          <label>Адрес доставки *</label>
          <textarea id="customer-address" rows="2" required placeholder="Город, улица, дом, квартира"></textarea>
        </div>
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
    if (cart.length === 0) {
      errorEl.textContent = 'Корзина пуста';
      return;
    }
    payBtn.disabled = true;
    payBtn.textContent = 'Создаём платёж...';
    errorEl.textContent = '';

    const orderData = {
      items: cart.map(item => ({
        id: item.id,
        qty: item.qty,
        variantName: item.variant ? item.variant.name : null,
        variantValue: item.variant ? item.variant.value : null
      })),
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
          loadProducts(true);
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
      } else {
        throw new Error('Нет ссылки на оплату');
      }
    } catch (err) {
      clearTimeout(timeoutId);
      errorEl.textContent = 'Ошибка: ' + err.message;
      payBtn.disabled = false;
      payBtn.textContent = 'Перейти к оплате';
    }
  });
}