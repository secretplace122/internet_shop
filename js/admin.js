const API_URL = 'https://functions.yandexcloud.net/d4eengms62slq876jbka';

document.addEventListener('DOMContentLoaded', () => {
  const auth = firebase.auth();
  const db = firebase.firestore();
  const loginScreen = document.getElementById('login-screen');
  const adminScreen = document.getElementById('admin-screen');

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

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'orders') loadOrders();
    });
  });

  document.getElementById('deploy-btn').addEventListener('click', async () => {
    const btn = document.getElementById('deploy-btn');
    const status = document.getElementById('deploy-status');
    btn.disabled = true;
    btn.textContent = '⏳ Обновляем...';
    status.textContent = '';

    try {
      const response = await fetch(API_URL + '?path=/trigger-deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: 'my-super-secret-2024' })
      });

      if (response.ok) {
        status.textContent = '✅ Сайт обновляется! Через 1-2 минуты изменения появятся.';
        btn.textContent = '✅ Готово';
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = '🚀 Обновить сайт';
          status.textContent = '';
        }, 5000);
      } else {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Ошибка запуска');
      }
    } catch (err) {
      status.textContent = '❌ Ошибка: ' + err.message;
      btn.disabled = false;
      btn.textContent = '🚀 Обновить сайт';
    }
  });

  const productModal = document.getElementById('product-modal');
  const supplyModal = document.getElementById('supply-modal');

  document.querySelectorAll('.close').forEach(closeBtn => {
    closeBtn.addEventListener('click', () => {
      productModal.style.display = 'none';
      supplyModal.style.display = 'none';
    });
  });

  document.getElementById('product-has-badge').addEventListener('change', (e) => {
    document.getElementById('badge-settings').style.display = e.target.checked ? 'block' : 'none';
  });

  document.getElementById('add-image-btn').addEventListener('click', () => {
    const container = document.getElementById('additional-images-container');
    const div = document.createElement('div');
    div.className = 'image-input-row';
    div.innerHTML = '<input type="url" class="product-image-extra" placeholder="URL изображения" style="width:80%; margin-right:5px;"><button type="button" class="btn-sm danger remove-image-btn">🗑</button>';
    container.appendChild(div);
    div.querySelector('.remove-image-btn').addEventListener('click', () => div.remove());
  });

  function updateTotalStock() {
    const stocks = document.querySelectorAll('.variant-stock');
    let total = 0;
    stocks.forEach(input => total += parseInt(input.value) || 0);
    const totalStockField = document.getElementById('product-stock');
    totalStockField.value = total;
    totalStockField.disabled = stocks.length > 0;
  }

  document.getElementById('add-variant-btn').addEventListener('click', () => {
    const container = document.getElementById('variants-list');
    const row = document.createElement('div');
    row.className = 'variant-row-dynamic';
    row.innerHTML = '<input type="text" class="variant-value" placeholder="Размер (например XL)" style="width:40%;"><input type="number" class="variant-stock" placeholder="Остаток" value="0" style="width:40%;"><button type="button" class="btn-sm danger remove-variant">🗑</button>';
    container.appendChild(row);
    row.querySelector('.remove-variant').addEventListener('click', () => {
      row.remove();
      updateTotalStock();
    });
    row.querySelector('.variant-stock').addEventListener('input', updateTotalStock);
    updateTotalStock();
  });

  document.getElementById('add-product-btn').addEventListener('click', () => {
    document.getElementById('modal-title').textContent = 'Добавить товар';
    document.getElementById('product-form').reset();
    document.getElementById('product-id').value = '';
    document.getElementById('additional-images-container').innerHTML = '';
    document.getElementById('variants-list').innerHTML = '';
    document.getElementById('product-stock').disabled = false;
    document.getElementById('product-stock').value = 0;
    document.getElementById('badge-settings').style.display = 'none';
    productModal.style.display = 'flex';
  });

  document.getElementById('product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('product-id').value;
    const hasBadge = document.getElementById('product-has-badge').checked;
    const mainImage = document.getElementById('product-image').value.trim();
    if (!mainImage) { alert('Укажите главное изображение'); return; }

    const imageInputs = document.querySelectorAll('.product-image-extra');
    const images = Array.from(imageInputs).map(inp => inp.value.trim()).filter(v => v);

    const variantRows = document.querySelectorAll('.variant-row-dynamic');
    const options = [];
    variantRows.forEach(row => {
      const value = row.querySelector('.variant-value').value.trim();
      const stock = parseInt(row.querySelector('.variant-stock').value) || 0;
      if (value) options.push({ value, stock });
    });

    let variants = null;
    let stock = parseInt(document.getElementById('product-stock').value) || 0;

    if (options.length > 0) {
      variants = [{ name: 'Размер', options }];
      stock = 0;
    }

    const productData = {
      title: document.getElementById('product-title').value,
      description: document.getElementById('product-description').value,
      price: parseInt(document.getElementById('product-price').value),
      stock: stock,
      image: mainImage,
      images: images.length ? images : [mainImage],
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
        const newId = await db.runTransaction(async (t) => {
          const counterRef = db.collection('counters').doc('products');
          const snap = await t.get(counterRef);
          const current = snap.exists ? (snap.data().value || 0) : 0;
          const next = current + 1;
          t.set(counterRef, { value: next }, { merge: true });
          return `item${next}`;
        });
        await db.collection('products').doc(newId).set(productData);
      }
      await db.collection('counters').doc('dataVersion').set({
        version: firebase.firestore.FieldValue.increment(1)
      }, { merge: true });
      productModal.style.display = 'none';
      loadProducts();
    } catch (err) {
      alert('Ошибка: ' + err.message);
    }
  });

  async function loadProducts() {
    const container = document.getElementById('products-list');
    container.innerHTML = '<p>Загрузка...</p>';
    try {
      const snapshot = await db.collection('products').get();
      const products = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        let totalStock = data.stock || 0;
        if (data.variants && Array.isArray(data.variants) && data.variants.length) {
          totalStock = 0;
          data.variants.forEach(v => {
            if (v.options && Array.isArray(v.options)) {
              v.options.forEach(o => totalStock += o.stock || 0);
            }
          });
        }
        products.push({ id: doc.id, ...data, totalStock });
      });
      if (products.length === 0) {
        container.innerHTML = '<p>Товаров пока нет.</p>';
        return;
      }
      container.innerHTML = '<table><thead><tr><th>Фото</th><th>Название</th><th>Цена</th><th>Остаток</th><th>Бирка</th><th>Действия</th></tr></thead><tbody>' +
        products.map(p => '<tr><td data-label="Фото"><img src="' + (p.images && p.images.length ? p.images[0] : p.image) + '" alt="' + p.title + '"></td><td data-label="Название">' + p.title + '</td><td data-label="Цена">' + p.price.toLocaleString() + ' ₽</td><td data-label="Остаток">' + p.totalStock + '</td><td data-label="Бирка">' + (p.badge ? '<span class="badge-preview" style="background:' + p.badge.bgColor + ';color:' + p.badge.color + '">' + p.badge.text + '</span>' : '—') + '</td><td data-label="Действия" class="actions"><button class="btn-sm edit" data-id="' + p.id + '">✏️</button><button class="btn-sm danger delete" data-id="' + p.id + '">🗑</button></td></tr>').join('') +
        '</tbody></table>';

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
            await db.collection('counters').doc('dataVersion').set({
              version: firebase.firestore.FieldValue.increment(1)
            }, { merge: true });
            loadProducts();
          }
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

    document.getElementById('additional-images-container').innerHTML = '';
    document.getElementById('variants-list').innerHTML = '';

    if (product.images && product.images.length) {
      product.images.forEach(url => {
        const div = document.createElement('div');
        div.className = 'image-input-row';
        div.innerHTML = '<input type="url" class="product-image-extra" value="' + url + '" style="width:80%;"><button type="button" class="btn-sm danger remove-image-btn">🗑</button>';
        document.getElementById('additional-images-container').appendChild(div);
        div.querySelector('.remove-image-btn').addEventListener('click', () => div.remove());
      });
    }

    if (product.variants && Array.isArray(product.variants) && product.variants.length > 0) {
      const variant = product.variants[0];
      if (variant.options && Array.isArray(variant.options)) {
        variant.options.forEach(opt => {
          const row = document.createElement('div');
          row.className = 'variant-row-dynamic';
          row.innerHTML = '<input type="text" class="variant-value" value="' + opt.value + '" style="width:40%;"><input type="number" class="variant-stock" value="' + opt.stock + '" style="width:40%;"><button type="button" class="btn-sm danger remove-variant">🗑</button>';
          document.getElementById('variants-list').appendChild(row);
          row.querySelector('.remove-variant').addEventListener('click', () => { row.remove(); updateTotalStock(); });
          row.querySelector('.variant-stock').addEventListener('input', updateTotalStock);
        });
      }
    }
    updateTotalStock();

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
      container.innerHTML = '<div class="orders-grid">' + orders.map(order => {
        const items = order.items || [];
        const itemsHtml = items.map(item => '<li>' + item.title + (item.variantName ? ' (' + item.variantName + ': ' + item.variantValue + ')' : '') + ' x' + item.qty + ' = ' + (item.price * item.qty).toLocaleString() + ' ₽</li>').join('');
        const date = order.createdAt ? new Date(order.createdAt.seconds * 1000).toLocaleString('ru-RU') : '—';
        return '<div class="order-card"><h3>Заказ №' + (order.orderNumber || order.id) + '</h3><p><strong>Дата:</strong> ' + date + '</p><p><strong>Статус:</strong> <span class="order-status">' + order.status + '</span></p><p><strong>Сумма:</strong> ' + order.amount + ' ' + order.currency + '</p><p><strong>Чек:</strong> ' + order.paymentId + '</p><p><strong>Покупатель:</strong> ' + order.customerName + '</p><p><strong>Телефон:</strong> ' + order.customerPhone + '</p><p><strong>Email:</strong> ' + (order.customerEmail || '—') + '</p><p><strong>Адрес:</strong> ' + order.deliveryAddress + '</p><ul>' + itemsHtml + '</ul></div>';
      }).join('') + '</div>';
    } catch (err) {
      container.innerHTML = '<p>Ошибка загрузки заказов: ' + err.message + '</p>';
    }
  }
});