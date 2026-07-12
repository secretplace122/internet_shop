const params = new URLSearchParams(window.location.search);
const productId = params.get('id');

// Корзина (аналогично главной)
let cart = JSON.parse(localStorage.getItem('cart')) || [];

document.addEventListener('DOMContentLoaded', async () => {
  if (!productId) {
    document.body.innerHTML = 'Товар не указан';
    return;
  }
  await loadProduct();
  setupGallery();
  setupAddToCart();
  setupCart();
  loadReviews();
  document.getElementById('submit-review').addEventListener('click', submitReview);
});

let product = null;
let selectedVariant = null;
let selectedRating = 0;
let currentMaxStock = 0;

/* --- star rating helpers --- */
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
  document.querySelectorAll('#star-rating span').forEach(s => {
    s.classList.toggle('active', parseInt(s.dataset.rating) <= rating);
  });
}

function updateStars() {
  document.querySelectorAll('#star-rating span').forEach(s => {
    s.classList.toggle('active', parseInt(s.dataset.rating) <= selectedRating);
  });
}

/* --- загрузка товара --- */
async function loadProduct() {
  try {
    const doc = await db.collection('products').doc(productId).get();
    if (!doc.exists) {
      document.body.innerHTML = 'Товар не найден';
      return;
    }
    product = { id: doc.id, ...doc.data() };
    const reviewsSnapshot = await db.collection('reviews')
      .where('productId', '==', productId)
      .where('approved', '==', true)
      .get();
    let totalRating = 0, count = 0;
    reviewsSnapshot.forEach(doc => {
      totalRating += doc.data().rating;
      count++;
    });
    const avg = count > 0 ? (totalRating / count).toFixed(1) : '0.0';
    document.getElementById('avg-rating').textContent = avg;
    document.getElementById('review-count').textContent = count;
    renderProduct();
    if (product.variants && product.variants.length > 0) {
      setupVariantSelector();
    } else {
      currentMaxStock = product.stock || 0;
      updateControlsForStock(currentMaxStock);
    }
    updateCartUI();
  } catch (err) {
    console.error(err);
  }
}

function renderProduct() {
  document.getElementById('product-title').textContent = product.title;
  document.getElementById('product-description').textContent = product.description;
  document.getElementById('product-price').textContent = product.price.toLocaleString() + ' ₽';

  const images = product.images?.length ? product.images : [product.image];
  const mainImage = document.getElementById('main-image');
  mainImage.src = images[0];
  mainImage.dataset.index = 0;
  const thumbsContainer = document.getElementById('gallery-thumbs');
  thumbsContainer.innerHTML = images.map((url, idx) =>
    `<img src="${url}" class="gallery-thumb ${idx === 0 ? 'active' : ''}" data-index="${idx}" loading="lazy">`
  ).join('');
  document.querySelectorAll('.gallery-thumb').forEach(thumb => {
    thumb.addEventListener('click', () => {
      const idx = parseInt(thumb.dataset.index);
      mainImage.src = images[idx];
      mainImage.dataset.index = idx;
      document.querySelectorAll('.gallery-thumb').forEach(t => t.classList.remove('active'));
      thumb.classList.add('active');
    });
  });
}

function setupGallery() {
  const images = product.images?.length ? product.images : [product.image];
  const mainImage = document.getElementById('main-image');
  let currentIndex = 0;

  document.getElementById('gallery-left').addEventListener('click', () => {
    currentIndex = (currentIndex - 1 + images.length) % images.length;
    mainImage.src = images[currentIndex];
    mainImage.dataset.index = currentIndex;
    updateThumbs(currentIndex);
  });
  document.getElementById('gallery-right').addEventListener('click', () => {
    currentIndex = (currentIndex + 1) % images.length;
    mainImage.src = images[currentIndex];
    mainImage.dataset.index = currentIndex;
    updateThumbs(currentIndex);
  });

  function updateThumbs(idx) {
    document.querySelectorAll('.gallery-thumb').forEach((thumb, i) => {
      thumb.classList.toggle('active', i === idx);
    });
  }
}

function setupVariantSelector() {
  const container = document.getElementById('variant-pills');
  if (!container) return;
  const variant = product.variants[0];
  const options = variant.options;

  const firstAvailable = options.find(o => o.stock > 0);
  const activeValue = firstAvailable ? firstAvailable.value : (options.length ? options[0].value : null);

  container.innerHTML = options.map(opt =>
    `<span class="variant-pill ${opt.value === activeValue ? ' active' : ''} ${opt.stock === 0 ? ' disabled' : ''}"
           data-value="${opt.value}" data-stock="${opt.stock}">
       ${opt.value}
     </span>`
  ).join('');

  if (firstAvailable) {
    selectedVariant = { name: variant.name, value: firstAvailable.value };
    currentMaxStock = firstAvailable.stock;
    document.getElementById('stock-info').textContent = `Доступно: ${firstAvailable.stock} шт.`;
    updateControlsForStock(currentMaxStock);
  } else {
    selectedVariant = null;
    currentMaxStock = 0;
    document.getElementById('stock-info').textContent = 'Нет в наличии';
    updateControlsForStock(0);
  }

  container.querySelectorAll('.variant-pill:not(.disabled)').forEach(pill => {
    pill.addEventListener('click', () => {
      container.querySelectorAll('.variant-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const value = pill.dataset.value;
      const stock = parseInt(pill.dataset.stock);
      selectedVariant = { name: variant.name, value };
      currentMaxStock = stock;
      document.getElementById('stock-info').textContent = `Доступно: ${stock} шт.`;
      updateControlsForStock(stock);
    });
  });
}

function updateControlsForStock(maxStock) {
  const qtyValueEl = document.getElementById('qty-value');
  const decreaseBtn = document.getElementById('qty-decrease');
  const increaseBtn = document.getElementById('qty-increase');
  const addToCartBtn = document.getElementById('add-to-cart-btn');

  if (maxStock <= 0) {
    qtyValueEl.textContent = '0';
    decreaseBtn.disabled = true;
    increaseBtn.disabled = true;
    addToCartBtn.disabled = true;
    addToCartBtn.textContent = 'Нет в наличии';
    return;
  }

  let qty = parseInt(qtyValueEl.textContent) || 1;
  if (qty > maxStock) qty = maxStock;
  if (qty < 1) qty = 1;
  qtyValueEl.textContent = qty;

  decreaseBtn.disabled = qty <= 1;
  increaseBtn.disabled = qty >= maxStock;
  addToCartBtn.disabled = false;
  addToCartBtn.textContent = 'В корзину';
}

function setupAddToCart() {
  const qtyValueEl = document.getElementById('qty-value');
  const decreaseBtn = document.getElementById('qty-decrease');
  const increaseBtn = document.getElementById('qty-increase');
  const addToCartBtn = document.getElementById('add-to-cart-btn');
  const messageEl = document.getElementById('product-message');

  decreaseBtn.addEventListener('click', () => {
    let qty = parseInt(qtyValueEl.textContent) || 1;
    if (qty > 1) {
      qty--;
      qtyValueEl.textContent = qty;
      updateControlsForStock(currentMaxStock);
    }
  });

  increaseBtn.addEventListener('click', () => {
    let qty = parseInt(qtyValueEl.textContent) || 1;
    if (qty < currentMaxStock) {
      qty++;
      qtyValueEl.textContent = qty;
      updateControlsForStock(currentMaxStock);
    }
  });

  addToCartBtn.addEventListener('click', () => {
    if (!product) return;
    const qty = parseInt(qtyValueEl.textContent) || 1;
    if (qty <= 0 || currentMaxStock <= 0) {
      messageEl.textContent = 'Товара нет в наличии';
      return;
    }
    if (product.variants?.length && !selectedVariant) {
      messageEl.textContent = 'Выберите вариант';
      return;
    }
    const existing = cart.find(item => item.id === product.id && item.variant?.value === selectedVariant?.value);
    const maxStock = selectedVariant ? currentMaxStock : (product.stock || 0);

    if (existing) {
      const newQty = existing.qty + qty;
      if (newQty > maxStock) {
        messageEl.textContent = `Максимально доступно: ${maxStock}`;
        return;
      }
      existing.qty = newQty;
    } else {
      if (qty > maxStock) {
        messageEl.textContent = `Максимально доступно: ${maxStock}`;
        return;
      }
      cart.push({
        id: product.id,
        title: product.title,
        price: product.price,
        image: product.images?.[0] || product.image,
        qty: qty,
        variant: selectedVariant
      });
    }
    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartUI();
    messageEl.textContent = 'Товар добавлен в корзину!';
  });
}

/* --- корзина (копия логики с главной) --- */
function setupCart() {
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
    // Перенаправляем на главную для оформления заказа
    window.location.href = 'index.html?checkout=open';
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

  if (cart.length === 0) {
    container.innerHTML = '<p>Корзина пуста</p>';
    totalEl.textContent = '0';
    return;
  }

  container.innerHTML = cart.map(item => {
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
            <button class="cart-qty-btn" data-action="cart-increase" data-id="${item.id}" data-variant-value="${item.variant?.value || ''}">+</button>
          </div>
          <button class="cart-remove-btn" data-action="cart-remove" data-id="${item.id}" data-variant-value="${item.variant?.value || ''}">🗑</button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', handleCartAction);
  });

  const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  totalEl.textContent = total.toLocaleString();
}

function handleCartAction(e) {
  const action = e.target.dataset.action;
  const productId = e.target.dataset.id;
  const variantValue = e.target.dataset.variantValue;
  const item = cart.find(i => i.id === productId && i.variant?.value === variantValue);
  if (!item) return;

  if (action === 'cart-increase') {
    // здесь нет проверки остатка, т.к. на странице товара товар может быть изменён, но для простоты допустим
    item.qty += 1;
  } else if (action === 'cart-decrease') {
    if (item.qty > 1) {
      item.qty -= 1;
    } else {
      cart = cart.filter(i => !(i.id === productId && i.variant?.value === variantValue));
    }
  } else if (action === 'cart-remove') {
    cart = cart.filter(i => !(i.id === productId && i.variant?.value === variantValue));
  }
  localStorage.setItem('cart', JSON.stringify(cart));
  updateCartUI();
  renderCart();
}

/* --- отзывы --- */
async function loadReviews() {
  const container = document.getElementById('reviews-list');
  try {
    const snapshot = await db.collection('reviews')
      .where('productId', '==', productId)
      .where('approved', '==', true)
      .orderBy('createdAt', 'desc')
      .get();
    const reviews = [];
    snapshot.forEach(doc => reviews.push(doc.data()));
    if (!reviews.length) {
      container.innerHTML = '<p>Пока нет отзывов.</p>';
      return;
    }
    container.innerHTML = reviews.map(r => `
      <div class="review-card">
        <div class="review-author">${r.author}</div>
        <div class="review-rating">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
        <div class="review-text">${r.text}</div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<p>Ошибка загрузки отзывов</p>';
  }
}

function submitReview() {
  const author = document.getElementById('review-author').value.trim();
  const text = document.getElementById('review-text').value.trim();
  if (!author || !text || selectedRating === 0) {
    document.getElementById('review-message').textContent = 'Заполните все поля и поставьте оценку';
    return;
  }
  db.collection('reviews').add({
    productId,
    author,
    text,
    rating: selectedRating,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    approved: true
  }).then(() => {
    document.getElementById('review-message').textContent = 'Спасибо за отзыв!';
    document.getElementById('review-author').value = '';
    document.getElementById('review-text').value = '';
    selectedRating = 0;
    updateStars();
    loadReviews();
  }).catch(err => {
    document.getElementById('review-message').textContent = 'Ошибка: ' + err.message;
  });
}