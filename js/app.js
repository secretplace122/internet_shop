const API_URL = 'https://functions.yandexcloud.net/d4eengms62slq876jbka';

document.addEventListener('DOMContentLoaded', () => {
  loadProducts();
  setupCart();
});

let cart = JSON.parse(localStorage.getItem('cart')) || [];
let currentProducts = []; // глобальный список товаров для быстрого доступа

// ==================== ЗАГРУЗКА ТОВАРОВ ====================
async function loadProducts() {
  const container = document.getElementById('products-container');
  container.innerHTML = '<p>Загрузка товаров…</p>';

  try {
    if (typeof db === 'undefined') throw new Error('Firebase не подключена');
    const snapshot = await db.collection('products').where('stock', '>', 0).get();
    const products = [];
    snapshot.forEach(doc => products.push({ id: doc.id, ...doc.data() }));
    currentProducts = products;
    renderProducts(products);
  } catch (error) {
    console.warn('Ошибка загрузки, мок-данные:', error);
    const mockProducts = [
      { id: '1', title: 'Умные часы', description: 'Стильные часы.', price: 4990, stock: 10, image: 'https://via.placeholder.com/300x200?text=Watch', badge: { text: 'Хит', color: '#fff', bgColor: '#e53e3e' } },
      { id: '2', title: 'Беспроводные наушники', description: 'Качественный звук.', price: 3490, stock: 5, image: 'https://via.placeholder.com/300x200?text=Headphones', badge: null }
    ];
    currentProducts = mockProducts;
    renderProducts(mockProducts);
  }
}

function getCartQty(productId) {
  const item = cart.find(i => i.id === productId);
  return item ? item.qty : 0;
}

function getMaxQty(productId) {
  const product = currentProducts.find(p => p.id === productId);
  return product ? product.stock : 0;
}

function renderProducts(products) {
  const container = document.getElementById('products-container');
  if (products.length === 0) {
    container.innerHTML = '<p>Товаров пока нет.</p>';
    return;
  }

  container.innerHTML = products.map(p => {
    const badgeHtml = p.badge && p.badge.text
      ? `<span class="badge" style="background-color:${p.badge.bgColor};color:${p.badge.color}">${p.badge.text}</span>`
      : '';
    const currentQty = getCartQty(p.id);
    const max = p.stock;

    return `
      <div class="product-card" data-id="${p.id}">
        <div style="position: relative;">
          <img src="${p.image}" alt="${p.title}" loading="lazy">
          ${badgeHtml}
        </div>
        <div class="product-info">
          <h3>${p.title}</h3>
          <p class="description">${p.description}</p>
          <span class="price">${p.price.toLocaleString()} ₽</span>
          <div class="cart-controls" id="controls-${p.id}">
            ${currentQty > 0 ? `
              <div class="quantity-picker">
                <button class="qty-btn" data-action="decrease" data-id="${p.id}" ${currentQty <= 1 ? 'disabled' : ''}>−</button>
                <span class="qty-value">${currentQty}</span>
                <button class="qty-btn" data-action="increase" data-id="${p.id}" ${currentQty >= max ? 'disabled' : ''}>+</button>
              </div>
              <span class="in-cart-indicator">В корзине</span>
            ` : `
              <button class="add-to-cart" data-id="${p.id}" data-action="add">В корзину</button>
            `}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Обработчики кнопок
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', handleCartAction);
  });
}

function handleCartAction(e) {
  const action = e.target.dataset.action;
  const productId = e.target.dataset.id;
  const product = currentProducts.find(p => p.id === productId);
  if (!product) return;

  if (action === 'add') {
    addToCart(product, 1);
  } else if (action === 'increase') {
    const item = cart.find(i => i.id === productId);
    if (item && item.qty < product.stock) {
      addToCart(product, 1);
    }
  } else if (action === 'decrease') {
    const item = cart.find(i => i.id === productId);
    if (item && item.qty > 1) {
      addToCart(product, -1);
    } else if (item && item.qty === 1) {
      removeFromCart(productId);
    }
  }
  renderProducts(currentProducts); // обновить карточки
  updateCartUI();
}

function addToCart(product, delta = 1) {
  const existing = cart.find(item => item.id === product.id);
  if (existing) {
    existing.qty += delta;
    if (existing.qty <= 0) {
      cart = cart.filter(item => item.id !== product.id);
    }
  } else if (delta > 0) {
    cart.push({
      id: product.id,
      title: product.title,
      price: product.price,
      image: product.image,
      qty: delta
    });
  }
  saveCart();
}

function removeFromCart(id) {
  cart = cart.filter(item => item.id !== id);
  saveCart();
  renderProducts(currentProducts);
  updateCartUI();
  if (document.getElementById('cart-modal').style.display === 'flex') {
    renderCart();
  }
}

// ==================== КОРЗИНА ====================
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

function saveCart() {
  localStorage.setItem('cart', JSON.stringify(cart));
}

function updateCartUI() {
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  const el = document.getElementById('cart-count');
  if (el) el.textContent = count;
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
    const max = getMaxQty(item.id);
    return `
      <div class="cart-item">
        <div class="cart-item-info">
          <img src="${item.image}" alt="${item.title}" class="cart-item-image">
          <div class="cart-item-details">
            <div class="cart-item-title">${item.title}</div>
            <div class="cart-item-price">${item.price.toLocaleString()} ₽</div>
          </div>
        </div>
        <div class="cart-item-actions">
          <div class="cart-item-qty">
            <button class="cart-qty-btn" data-id="${item.id}" data-action="cart-decrease">−</button>
            <span>${item.qty}</span>
            <button class="cart-qty-btn" data-id="${item.id}" data-action="cart-increase" ${item.qty >= max ? 'disabled' : ''}>+</button>
          </div>
          <button class="cart-remove-btn" data-id="${item.id}" data-action="cart-remove">🗑</button>
        </div>
      </div>
    `;
  }).join('');

  // обработчики изменения в корзине
  container.querySelectorAll('[data-action="cart-increase"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const product = currentProducts.find(p => p.id === id);
      if (product) addToCart(product, 1);
      renderCart();
      renderProducts(currentProducts);
      updateCartUI();
    });
  });

  container.querySelectorAll('[data-action="cart-decrease"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const item = cart.find(i => i.id === id);
      if (item && item.qty > 1) {
        addToCart(currentProducts.find(p => p.id === id), -1);
        renderCart();
        renderProducts(currentProducts);
        updateCartUI();
      } else {
        removeFromCart(id);
        renderCart();
        renderProducts(currentProducts);
        updateCartUI();
      }
    });
  });

  container.querySelectorAll('[data-action="cart-remove"]').forEach(btn => {
    btn.addEventListener('click', () => {
      removeFromCart(btn.dataset.id);
      renderCart();
      renderProducts(currentProducts);
      updateCartUI();
    });
  });

  const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  totalEl.textContent = total.toLocaleString();
}

// ==================== ОФОРМЛЕНИЕ ЗАКАЗА ====================
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
      items: cart.map(item => ({ id: item.id, qty: item.qty })),
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