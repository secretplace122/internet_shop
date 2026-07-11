document.addEventListener('DOMContentLoaded', () => {
  const auth = firebase.auth();
  const db = firebase.firestore();
  const loginScreen = document.getElementById('login-screen');
  const adminScreen = document.getElementById('admin-screen');

  // Вход
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    try {
      await auth.signInWithEmailAndPassword(email, password);
    } catch (err) {
      errorEl.textContent = 'Ошибка входа: ' + err.message;
    }
  });

  auth.onAuthStateChanged((user) => {
    if (user) {
      loginScreen.style.display = 'none';
      adminScreen.style.display = 'block';
      loadProducts();
      loadOrders();
    } else {
      loginScreen.style.display = 'block';
      adminScreen.style.display = 'none';
    }
  });

  document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());

  // Вкладки
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'orders') loadOrders();
    });
  });

  const productModal = document.getElementById('product-modal');
  const supplyModal = document.getElementById('supply-modal');
  document.querySelectorAll('.close').forEach(closeBtn => {
    closeBtn.addEventListener('click', () => {
      productModal.style.display = 'none';
      supplyModal.style.display = 'none';
    });
  });
  window.addEventListener('click', (e) => {
    if (e.target === productModal) productModal.style.display = 'none';
    if (e.target === supplyModal) supplyModal.style.display = 'none';
  });

  document.getElementById('product-has-badge').addEventListener('change', (e) => {
    document.getElementById('badge-settings').style.display = e.target.checked ? 'block' : 'none';
  });

  // Добавить товар
  document.getElementById('add-product-btn').addEventListener('click', () => {
    document.getElementById('modal-title').textContent = 'Добавить товар';
    document.getElementById('product-form').reset();
    document.getElementById('product-id').value = '';
    document.getElementById('badge-settings').style.display = 'none';
    productModal.style.display = 'flex';
  });

  // Сохранение товара
  document.getElementById('product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('product-id').value;
    const hasBadge = document.getElementById('product-has-badge').checked;
    const variantsText = document.getElementById('product-variants').value.trim();
    let variants = null;
    if (variantsText) {
      try {
        variants = JSON.parse(variantsText);
      } catch (e) {
        alert('Неверный JSON вариантов');
        return;
      }
    }

    const productData = {
      title: document.getElementById('product-title').value,
      description: document.getElementById('product-description').value,
      price: parseInt(document.getElementById('product-price').value),
      stock: variants ? 0 : parseInt(document.getElementById('product-stock').value),
      image: document.getElementById('product-image').value,
      images: document.getElementById('product-images').value.split(',').map(s => s.trim()).filter(Boolean),
      variants: variants,
      badge: null
    };

    if (hasBadge) {
      productData.badge = {
        text: document.getElementById('badge-text').value || 'Акция',
        bgColor: document.getElementById('badge-bg').value,
        color: document.getElementById('badge-color').value
      };
    }

    try {
      if (id) {
        await db.collection('products').doc(id).update(productData);
      } else {
        await db.collection('products').add(productData);
      }
      productModal.style.display = 'none';
      loadProducts();
    } catch (err) {
      alert('Ошибка: ' + err.message);
    }
  });

  // Поставка
  document.getElementById('supply-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('supply-product-id').value;
    const qty = parseInt(document.getElementById('supply-qty').value);
    const currentStock = parseInt(document.getElementById('supply-current-stock').textContent);
    try {
      await db.collection('products').doc(id).update({ stock: currentStock + qty });
      supplyModal.style.display = 'none';
      loadProducts();
    } catch (err) {
      alert('Ошибка: ' + err.message);
    }
  });

  // Загрузка товаров
  async function loadProducts() {
    const container = document.getElementById('products-list');
    container.innerHTML = '<p>Загрузка...</p>';
    try {
      const snapshot = await db.collection('products').get();
      const products = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        let totalStock = data.stock || 0;
        if (data.variants && data.variants.length) {
          totalStock = 0;
          data.variants.forEach(v => v.options.forEach(o => totalStock += o.stock));
        }
        products.push({ id: doc.id, ...data, totalStock });
      });
      if (products.length === 0) {
        container.innerHTML = '<p>Товаров пока нет.</p>';
        return;
      }
      container.innerHTML = `<table><thead><tr><th>Фото</th><th>Название</th><th>Цена</th><th>Остаток</th><th>Бирка</th><th>Действия</th></tr></thead><tbody>
        ${products.map(p => `
          <tr>
            <td><img src="${p.images && p.images.length ? p.images[0] : p.image}" alt="${p.title}"></td>
            <td>${p.title}</td>
            <td>${p.price.toLocaleString()} ₽</td>
            <td>${p.totalStock}</td>
            <td>${p.badge ? `<span class="badge-preview" style="background:${p.badge.bgColor};color:${p.badge.color}">${p.badge.text}</span>` : '—'}</td>
            <td class="actions">
              <button class="btn-sm supply" data-id="${p.id}" data-name="${p.title}" data-stock="${p.totalStock}">Поставка</button>
              <button class="btn-sm edit" data-id="${p.id}">✏️</button>
              <button class="btn-sm danger delete" data-id="${p.id}">🗑</button>
            </td>
          </tr>
        `).join('')}
      </tbody></table>`;

      container.querySelectorAll('.edit').forEach(btn => {
        btn.addEventListener('click', () => {
          const product = products.find(p => p.id === btn.dataset.id);
          editProduct(product);
        });
      });
      container.querySelectorAll('.delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (confirm('Удалить товар?')) {
            await db.collection('products').doc(btn.dataset.id).delete();
            loadProducts();
          }
        });
      });
      container.querySelectorAll('.supply').forEach(btn => {
        btn.addEventListener('click', () => {
          document.getElementById('supply-product-id').value = btn.dataset.id;
          document.getElementById('supply-product-name').textContent = btn.dataset.name;
          document.getElementById('supply-current-stock').textContent = btn.dataset.stock;
          document.getElementById('supply-qty').value = '';
          supplyModal.style.display = 'flex';
        });
      });
    } catch (err) {
      container.innerHTML = '<p>Ошибка: ' + err.message + '</p>';
    }
  }

  function editProduct(product) {
    document.getElementById('modal-title').textContent = 'Редактировать товар';
    document.getElementById('product-id').value = product.id;
    document.getElementById('product-title').value = product.title;
    document.getElementById('product-description').value = product.description;
    document.getElementById('product-price').value = product.price;
    document.getElementById('product-stock').value = product.stock || 0;
    document.getElementById('product-image').value = product.image;
    document.getElementById('product-images').value = product.images ? product.images.join(', ') : '';
    document.getElementById('product-variants').value = product.variants ? JSON.stringify(product.variants) : '';
    if (product.badge) {
      document.getElementById('product-has-badge').checked = true;
      document.getElementById('badge-settings').style.display = 'block';
      document.getElementById('badge-text').value = product.badge.text;
      document.getElementById('badge-bg').value = product.badge.bgColor;
      document.getElementById('badge-color').value = product.badge.color;
    } else {
      document.getElementById('product-has-badge').checked = false;
      document.getElementById('badge-settings').style.display = 'none';
    }
    productModal.style.display = 'flex';
  }

  // Заказы
  async function loadOrders() {
    const container = document.getElementById('orders-list');
    container.innerHTML = '<p>Загрузка заказов…</p>';
    try {
      const snapshot = await db.collection('orders').orderBy('createdAt', 'desc').limit(50).get();
      const orders = [];
      snapshot.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));
      if (orders.length === 0) {
        container.innerHTML = '<p>Заказов пока нет.</p>';
        return;
      }
      container.innerHTML = `<div class="orders-grid">` + orders.map(order => {
        const items = order.items || [];
        const itemsHtml = items.map(item =>
          `<li>${item.title}${item.variantName ? ` (${item.variantName}: ${item.variantValue})` : ''} x${item.qty} = ${(item.price * item.qty).toLocaleString()} ₽</li>`
        ).join('');
        const date = order.createdAt ? new Date(order.createdAt.seconds * 1000).toLocaleString('ru-RU') : '—';
        return `
          <div class="order-card">
            <h3>Заказ №${order.orderNumber || order.id}</h3>
            <p><strong>Дата:</strong> ${date}</p>
            <p><strong>Статус:</strong> <span class="order-status">${order.status}</span></p>
            <p><strong>Сумма:</strong> ${order.amount} ${order.currency}</p>
            <p><strong>Чек:</strong> ${order.paymentId}</p>
            <p><strong>Покупатель:</strong> ${order.customerName}</p>
            <p><strong>Телефон:</strong> ${order.customerPhone}</p>
            <p><strong>Email:</strong> ${order.customerEmail || '—'}</p>
            <p><strong>Адрес:</strong> ${order.deliveryAddress}</p>
            <ul>${itemsHtml}</ul>
          </div>
        `;
      }).join('') + `</div>`;
    } catch (err) {
      container.innerHTML = '<p>Ошибка загрузки заказов: ' + err.message + '</p>';
    }
  }
});