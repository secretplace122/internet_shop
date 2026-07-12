const params = new URLSearchParams(window.location.search);
const productId = params.get('id');

document.addEventListener('DOMContentLoaded', async () => {
  if (!productId) {
    document.body.innerHTML = 'Товар не указан';
    return;
  }
  await loadProduct();
  setupGallery();
  setupAddToCart();
  loadReviews();
  document.getElementById('submit-review').addEventListener('click', submitReview);
});

let product = null;
let selectedVariant = null;
let selectedRating = 0;
let currentMaxStock = 0;

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
    let cart = JSON.parse(localStorage.getItem('cart')) || [];
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
    messageEl.textContent = 'Товар добавлен в корзину!';
  });
}

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