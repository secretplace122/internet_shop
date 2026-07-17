const params = new URLSearchParams(window.location.search);
const productId = window.PRODUCT_ID || params.get('id');

let cart = JSON.parse(localStorage.getItem('cart')) || [];

document.addEventListener('DOMContentLoaded', async () => {
  if (!productId) {
    document.body.innerHTML = 'Товар не указан';
    return;
  }
  initNavigation();
  await checkDataVersion();
  await loadProduct();
  setupGallery();
  setupAddToCart();
  setupCart();
  loadReviews();
  document.getElementById('submit-review').addEventListener('click', submitReview);
  subscribeToProduct();
  loadAlsoInteresting();
});

let product = null;
let selectedVariant = null;
let selectedRating = 0;
let currentMaxStock = 0;
let unsubscribeProduct = null;
let galleryImages = [];
let currentGalleryIndex = 0;

function initNavigation() {
  const pill = document.getElementById('nav-pill');
  const toggle = document.getElementById('nav-toggle');
  const navCart = document.getElementById('nav-cart');
  let isOpen = false;
  let hoverTimer = null;
  let closeTimer = null;
  let manualOpen = false;
  let scrollTimeout = null;

  navCart.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('cart-modal').style.display = 'flex';
    renderCart();
  });

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isOpen) {
      closeMenu();
      manualOpen = false;
    } else {
      openMenu();
      manualOpen = true;
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        if (manualOpen && !pill.matches(':hover')) {
          closeMenu();
          manualOpen = false;
        }
      }, 3000);
    }
  });

  pill.addEventListener('mouseenter', () => {
    clearTimeout(hoverTimer);
    clearTimeout(closeTimer);
    if (!isOpen) {
      hoverTimer = setTimeout(() => {
        openMenu();
        manualOpen = false;
      }, 150);
    }
  });

  pill.addEventListener('mouseleave', () => {
    clearTimeout(hoverTimer);
    if (!manualOpen) {
      closeTimer = setTimeout(() => {
        if (!pill.matches(':hover')) closeMenu();
      }, 200);
    }
  });

  window.addEventListener('scroll', () => {
    if (isOpen) {
      closeMenu();
      manualOpen = false;
    }
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      if (pill.matches(':hover') && !isOpen) {
        openMenu();
        manualOpen = false;
      }
    }, 1000);
  }, { passive: true });

  function openMenu() {
    pill.classList.add('open');
    isOpen = true;
  }
  function closeMenu() {
    pill.classList.remove('open');
    isOpen = false;
  }
}

document.querySelectorAll('#star-rating span').forEach(star => {
  star.addEventListener('click', function() {
    selectedRating = parseInt(this.dataset.rating);
    updateStars();
  });
  star.addEventListener('mouseenter', function() {
    highlightStars(parseInt(this.dataset.rating));
  });
  star.addEventListener('mouseleave', updateStars);
});

function highlightStars(rating) {
  document.querySelectorAll('#star-rating span').forEach(s => s.classList.toggle('active', parseInt(s.dataset.rating) <= rating));
}
function updateStars() {
  document.querySelectorAll('#star-rating span').forEach(s => s.classList.toggle('active', parseInt(s.dataset.rating) <= selectedRating));
}

const PRODUCT_CACHE_PREFIX = 'productCache_';
const PRODUCT_CACHE_TTL = 5 * 60 * 1000;
const VERSION_KEY = 'dataVersion';

async function checkDataVersion() {
  try {
    const remoteVersionDoc = await db.collection('counters').doc('dataVersion').get();
    const remoteVersion = remoteVersionDoc.exists ? remoteVersionDoc.data().version : 0;
    const localVersion = parseInt(localStorage.getItem(VERSION_KEY)) || 0;
    if (remoteVersion !== localVersion) {
      localStorage.setItem(VERSION_KEY, remoteVersion);
      clearAllProductCaches();
    }
  } catch (e) {}
}

function clearAllProductCaches() {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key.startsWith(PRODUCT_CACHE_PREFIX)) localStorage.removeItem(key);
  }
}

function getCachedProduct(id) {
  try {
    const raw = localStorage.getItem(PRODUCT_CACHE_PREFIX + id);
    if (!raw) return null;
    const cache = JSON.parse(raw);
    if (Date.now() - cache.timestamp > PRODUCT_CACHE_TTL) return null;
    return cache.product;
  } catch (e) { return null; }
}

function setCachedProduct(id, product) {
  const cache = { timestamp: Date.now(), product };
  localStorage.setItem(PRODUCT_CACHE_PREFIX + id, JSON.stringify(cache));
}

async function loadProduct() {
  try {
    const cached = getCachedProduct(productId);
    if (cached) {
      product = { id: productId, ...cached };
      afterProductLoad();
      return;
    }
    const doc = await db.collection('products').doc(productId).get();
    if (!doc.exists) { document.body.innerHTML = 'Товар не найден'; return; }
    product = { id: doc.id, ...doc.data() };
    setCachedProduct(productId, product);
    afterProductLoad();
  } catch (err) {
    console.error(err);
    const cached = getCachedProduct(productId);
    if (cached) { product = { id: productId, ...cached }; afterProductLoad(); }
  }
}

function subscribeToProduct() {
  if (unsubscribeProduct) unsubscribeProduct();
  unsubscribeProduct = db.collection('products').doc(productId).onSnapshot((doc) => {
    if (doc.exists) {
      const newData = doc.data();
      setCachedProduct(productId, newData);
      product = { id: productId, ...newData };
      updateProductInfo();
      loadReviewsData();
    } else {
      document.body.innerHTML = 'Товар больше не доступен';
    }
  });
}

function updateProductInfo() {
  if (!product) return;
  document.getElementById('product-title').textContent = product.title;
  document.getElementById('product-description').textContent = product.description;
  document.getElementById('product-price').textContent = product.price.toLocaleString() + ' ₽';

  const oldPriceBlock = document.getElementById('old-price-block');
  if (product.oldPrice && product.oldPrice > product.price) {
    const discount = Math.round((1 - product.price / product.oldPrice) * 100);
    document.getElementById('old-price-value').textContent = product.oldPrice.toLocaleString() + ' ₽';
    document.getElementById('discount-badge').textContent = '-' + discount + '%';
    oldPriceBlock.style.display = 'flex';
  } else {
    oldPriceBlock.style.display = 'none';
  }

  galleryImages = [product.image, ...(product.images || [])];
  renderGallery();

  const container = document.getElementById('variant-pills');
  const stockInfo = document.getElementById('stock-info');
  if (product.variants && Array.isArray(product.variants) && product.variants.length > 0) {
    const variant = product.variants[0];
    const options = variant.options;
    const activeValue = selectedVariant && options.some(o => o.value === selectedVariant.value && o.stock > 0)
      ? selectedVariant.value : (options.find(o => o.stock > 0) || options[0])?.value;
    if (container) container.innerHTML = options.map(opt => `<span class="variant-pill${opt.value === activeValue ? ' active' : ''}${opt.stock === 0 ? ' disabled' : ''}" data-value="${opt.value}" data-stock="${opt.stock ?? 0}">${opt.value}</span>`).join('');
    const activeOption = options.find(o => o.value === activeValue);
    if (activeOption) { selectedVariant = { name: variant.name || 'Размер', value: activeOption.value }; currentMaxStock = activeOption.stock; if (stockInfo) stockInfo.textContent = `Доступно: ${activeOption.stock} шт.`; }
    else { selectedVariant = null; currentMaxStock = 0; if (stockInfo) stockInfo.textContent = 'Нет в наличии'; }
    if (container) container.querySelectorAll('.variant-pill:not(.disabled)').forEach(pill => pill.addEventListener('click', () => {
      container.querySelectorAll('.variant-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const value = pill.dataset.value; const stock = parseInt(pill.dataset.stock);
      selectedVariant = { name: variant.name || 'Размер', value }; currentMaxStock = stock;
      if (stockInfo) stockInfo.textContent = `Доступно: ${stock} шт.`;
      updateControlsForStock(stock);
    }));
  } else {
    currentMaxStock = product.stock ?? 0;
    selectedVariant = null;
    if (stockInfo) stockInfo.textContent = `Осталось: ${currentMaxStock} шт.`;
  }
  updateControlsForStock(currentMaxStock);
}

function renderGallery() {
  const slider = document.getElementById('gallery-slider');
  const dotsContainer = document.getElementById('gallery-dots');
  slider.innerHTML = galleryImages.map(url => `
    <div class="gallery-slide">
      <div class="blur-bg" style="background-image: url('${url}')"></div>
      <img src="${url}" alt="">
    </div>
  `).join('');
  dotsContainer.innerHTML = galleryImages.map((_, idx) => `<span class="gallery-dot${idx === 0 ? ' active' : ''}" data-index="${idx}"></span>`).join('');
  currentGalleryIndex = 0;
  slider.scrollLeft = 0;
  document.querySelectorAll('.gallery-dot').forEach(dot => dot.addEventListener('click', () => {
    const idx = parseInt(dot.dataset.index);
    slider.scrollTo({ left: idx * slider.clientWidth, behavior: 'smooth' });
  }));
  slider.addEventListener('scroll', () => {
    const idx = Math.round(slider.scrollLeft / slider.clientWidth);
    if (idx !== currentGalleryIndex) {
      currentGalleryIndex = idx;
      document.querySelectorAll('.gallery-dot').forEach(d => d.classList.remove('active'));
      const activeDot = document.querySelector(`.gallery-dot[data-index="${idx}"]`);
      if (activeDot) activeDot.classList.add('active');
    }
  });
}

function setupGallery() {
  document.getElementById('gallery-left').addEventListener('click', () => {
    const slider = document.getElementById('gallery-slider');
    currentGalleryIndex = (currentGalleryIndex - 1 + galleryImages.length) % galleryImages.length;
    slider.scrollTo({ left: currentGalleryIndex * slider.clientWidth, behavior: 'smooth' });
  });
  document.getElementById('gallery-right').addEventListener('click', () => {
    const slider = document.getElementById('gallery-slider');
    currentGalleryIndex = (currentGalleryIndex + 1) % galleryImages.length;
    slider.scrollTo({ left: currentGalleryIndex * slider.clientWidth, behavior: 'smooth' });
  });
}

function afterProductLoad() {
  loadReviewsData().then(() => {
    renderProduct();
    if (product.variants && product.variants.length > 0) setupVariantSelector();
    else { currentMaxStock = product.stock ?? 0; updateControlsForStock(currentMaxStock); }
    updateCartUI();
  });
}

async function loadReviewsData() {
  try {
    const snapshot = await db.collection('reviews').where('productId', '==', productId).where('approved', '==', true).get();
    let totalRating = 0, count = 0;
    snapshot.forEach(doc => { totalRating += doc.data().rating; count++; });
    const avg = count > 0 ? (totalRating / count).toFixed(1) : '0.0';
    document.getElementById('avg-rating').textContent = avg;
    document.getElementById('review-count').textContent = count;
  } catch (e) {}
}

function renderProduct() {
  document.getElementById('product-title').textContent = product.title;
  document.getElementById('product-description').textContent = product.description;
  document.getElementById('product-price').textContent = product.price.toLocaleString() + ' ₽';
  if (product.oldPrice && product.oldPrice > product.price) {
    const discount = Math.round((1 - product.price / product.oldPrice) * 100);
    document.getElementById('old-price-value').textContent = product.oldPrice.toLocaleString() + ' ₽';
    document.getElementById('discount-badge').textContent = '-' + discount + '%';
    document.getElementById('old-price-block').style.display = 'flex';
  } else document.getElementById('old-price-block').style.display = 'none';
  galleryImages = [product.image, ...(product.images || [])];
  renderGallery();
}

function setupVariantSelector() {
  const container = document.getElementById('variant-pills');
  if (!container) return;
  const variant = product.variants[0];
  const options = variant.options;
  const firstAvailable = options.find(o => o.stock > 0);
  const activeValue = firstAvailable ? firstAvailable.value : (options.length ? options[0].value : null);
  container.innerHTML = options.map(opt => `<span class="variant-pill ${opt.value === activeValue ? ' active' : ''} ${opt.stock === 0 ? ' disabled' : ''}" data-value="${opt.value}" data-stock="${opt.stock ?? 0}">${opt.value}</span>`).join('');
  if (firstAvailable) { selectedVariant = { name: variant.name || 'Размер', value: firstAvailable.value }; currentMaxStock = firstAvailable.stock; document.getElementById('stock-info').textContent = `Доступно: ${firstAvailable.stock} шт.`; }
  else { selectedVariant = null; currentMaxStock = 0; document.getElementById('stock-info').textContent = 'Нет в наличии'; }
  updateControlsForStock(currentMaxStock);
  container.querySelectorAll('.variant-pill:not(.disabled)').forEach(pill => pill.addEventListener('click', () => {
    container.querySelectorAll('.variant-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    const value = pill.dataset.value; const stock = parseInt(pill.dataset.stock);
    selectedVariant = { name: variant.name || 'Размер', value }; currentMaxStock = stock;
    document.getElementById('stock-info').textContent = `Доступно: ${stock} шт.`;
    updateControlsForStock(stock);
  }));
}

function getCartQuantity(variant) {
  if (!product) return 0;
  const item = cart.find(i => i.id === product.id && i.variant?.value === (variant ? variant.value : undefined));
  return item ? item.qty : 0;
}

function updateControlsForStock(maxStock) {
  const picker = document.getElementById('quantity-picker');
  const goToCartBtn = document.getElementById('go-to-cart-btn');
  const qtyValueEl = document.getElementById('qty-value');
  const decreaseBtn = document.getElementById('qty-decrease');
  const increaseBtn = document.getElementById('qty-increase');
  const messageEl = document.getElementById('product-message');
  if (!picker) return;
  const currentQty = getCartQuantity(selectedVariant);
  if (maxStock <= 0) {
    picker.style.display = 'none'; if (goToCartBtn) goToCartBtn.style.display = 'none';
    messageEl.textContent = 'Нет в наличии'; return;
  }
  picker.style.display = 'flex';
  qtyValueEl.textContent = currentQty;
  decreaseBtn.disabled = currentQty <= 0;
  increaseBtn.disabled = currentQty >= maxStock;
  if (goToCartBtn) goToCartBtn.style.display = currentQty > 0 ? 'inline-flex' : 'none';
  messageEl.textContent = '';
}

function setupAddToCart() {
  const decreaseBtn = document.getElementById('qty-decrease');
  const increaseBtn = document.getElementById('qty-increase');
  const goToCartBtn = document.getElementById('go-to-cart-btn');
  const messageEl = document.getElementById('product-message');

  decreaseBtn.addEventListener('click', () => {
    if (!product) return;
    const currentQty = getCartQuantity(selectedVariant);
    if (currentQty <= 0) return;
    if (currentQty === 1) cart = cart.filter(i => !(i.id === product.id && i.variant?.value === (selectedVariant ? selectedVariant.value : undefined)));
    else { const item = cart.find(i => i.id === product.id && i.variant?.value === (selectedVariant ? selectedVariant.value : undefined)); if (item) item.qty = currentQty - 1; }
    localStorage.setItem('cart', JSON.stringify(cart));
    updateControlsForStock(currentMaxStock);
    updateCartUI();
    messageEl.textContent = '';
  });

  increaseBtn.addEventListener('click', () => {
    if (!product) return;
    const currentQty = getCartQuantity(selectedVariant);
    if (currentQty >= currentMaxStock) { messageEl.textContent = `Максимально доступно: ${currentMaxStock}`; return; }
    const item = cart.find(i => i.id === product.id && i.variant?.value === (selectedVariant ? selectedVariant.value : undefined));
    if (item) item.qty = currentQty + 1;
    else cart.push({
      id: product.id, title: product.title, price: product.price, image: product.image,
      qty: 1, variant: selectedVariant ? { name: selectedVariant.name, value: selectedVariant.value } : null
    });
    localStorage.setItem('cart', JSON.stringify(cart));
    updateControlsForStock(currentMaxStock);
    updateCartUI();
    messageEl.textContent = 'Товар добавлен в корзину!';
  });

  if (goToCartBtn) goToCartBtn.addEventListener('click', () => { document.getElementById('cart-modal').style.display = 'flex'; renderCart(); });
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
    else window.location.href = 'index.html?checkout=open';
  });
}

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
    const actionButtons = container.querySelectorAll('[data-action]');
    actionButtons.forEach(btn => { btn.removeEventListener('click', handleCartAction); btn.addEventListener('click', handleCartAction); });
  } else {
    cart.forEach(item => {
      const cartItemEl = container.querySelector(`.cart-item[data-id="${item.id}"][data-variant-value="${item.variant?.value || ''}"]`);
      if (cartItemEl) {
        const countSpan = cartItemEl.querySelector('.cart-item-count');
        if (countSpan) countSpan.textContent = item.qty;
        const plusBtn = cartItemEl.querySelector('[data-action="cart-increase"]');
        if (plusBtn) {
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

function handleCartAction(e) {
  const action = e.target.dataset.action;
  const productId = e.target.dataset.id;
  const variantValue = e.target.dataset.variantValue;
  const variantKey = variantValue || undefined;
  const item = cart.find(i => i.id === productId && i.variant?.value === variantKey);
  if (!item) return;
  if (action === 'cart-increase') {
    let max = product ? (product.stock ?? 0) : 0;
    if (item.variant && product && Array.isArray(product.variants)) {
      const foundVariant = product.variants.find(v => v.name === item.variant.name);
      if (foundVariant && Array.isArray(foundVariant.options)) {
        const option = foundVariant.options.find(o => o.value === item.variant.value);
        if (option) max = option.stock;
      }
    }
    if (item.qty < max) item.qty += 1;
  } else if (action === 'cart-decrease') {
    if (item.qty > 1) item.qty -= 1;
    else cart = cart.filter(i => !(i.id === productId && i.variant?.value === variantKey));
  } else if (action === 'cart-remove') {
    cart = cart.filter(i => !(i.id === productId && i.variant?.value === variantKey));
  }
  localStorage.setItem('cart', JSON.stringify(cart));
  updateCartUI(); renderCart();
  if (product && productId === product.id) updateControlsForStock(currentMaxStock);
}

async function loadReviews() {
  const container = document.getElementById('reviews-list');
  try {
    const snapshot = await db.collection('reviews').where('productId', '==', productId).where('approved', '==', true).orderBy('createdAt', 'desc').get();
    const reviews = [];
    snapshot.forEach(doc => reviews.push({ id: doc.id, ...doc.data() }));
    if (!reviews.length) container.innerHTML = '<p>Пока нет отзывов.</p>';
    else container.innerHTML = reviews.map(r => {
      const date = r.createdAt ? new Date(r.createdAt.seconds * 1000).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
      return `
        <div class="review-card">
          <div class="review-avatar">👤</div>
          <div class="review-body">
            <div class="review-header">
              <span class="review-author">${r.author}</span>
              <span class="review-date">${date}</span>
            </div>
            <div class="review-rating">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
            <div class="review-text">${r.text}</div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) { container.innerHTML = '<p>Ошибка загрузки отзывов</p>'; }
}

function submitReview() {
  const author = document.getElementById('review-author').value.trim();
  const text = document.getElementById('review-text').value.trim();
  if (!author || !text || selectedRating === 0) { document.getElementById('review-message').textContent = 'Заполните все поля и поставьте оценку'; return; }
  db.collection('reviews').add({
    productId, author, text, rating: selectedRating, createdAt: firebase.firestore.FieldValue.serverTimestamp(), approved: true
  }).then(() => {
    document.getElementById('review-message').textContent = 'Спасибо за отзыв!';
    document.getElementById('review-author').value = ''; document.getElementById('review-text').value = '';
    selectedRating = 0; updateStars(); loadReviews();
  }).catch(err => { document.getElementById('review-message').textContent = 'Ошибка: ' + err.message; });
}

async function loadAlsoInteresting() {
  const container = document.getElementById('also-interesting-scroll');
  if (!container) return;
  try {
    const snapshot = await db.collection('products').get();
    const allProducts = [];
    snapshot.forEach(doc => allProducts.push({ id: doc.id, ...doc.data() }));
    const filtered = allProducts.filter(p => p.id !== productId);
    const shuffled = filtered.sort(() => 0.5 - Math.random()).slice(0, 8);
    const productIds = shuffled.map(p => p.id);
    const reviewsData = await fetchReviewsData(productIds);
    container.innerHTML = shuffled.map(p => {
      const rev = reviewsData[p.id] || { avg: '0.0', count: 0 };
      const badgeHtml = p.badge ? `<span class="badge" style="background:${p.badge.bgColor};color:${p.badge.color}">${p.badge.text}</span>` : '';
      let priceBlock = `<span class="also-price">${p.price.toLocaleString()} ₽</span>`;
      if (p.oldPrice && p.oldPrice > p.price) {
        const discount = Math.round((1 - p.price / p.oldPrice) * 100);
        priceBlock = `<span class="also-price">${p.price.toLocaleString()} ₽</span> <span class="old-price" style="font-size:0.7rem;">${p.oldPrice.toLocaleString()} ₽</span> <span class="discount-badge">-${discount}%</span>`;
      }
      return `
        <div class="also-card" data-id="${p.id}" onclick="window.location.href='products/${p.id}/'">
          <div class="card-gallery">
            <div class="card-gallery-slide">
              <div class="blur-bg" style="background-image: url('${p.image}')"></div>
              <img src="${p.image}" alt="${p.title}">
            </div>
            ${badgeHtml}
          </div>
          <div class="also-info">
            <div class="also-title">${p.title}</div>
            <div class="rating-row" style="font-size:0.65rem;">
              <span class="rating-star">★</span>
              <span class="rating-value">${rev.avg}</span>
              <span class="review-icon">
                <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                ${rev.count}
              </span>
            </div>
            ${priceBlock}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {}
}