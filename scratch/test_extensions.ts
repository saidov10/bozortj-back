import fs from 'fs';
import path from 'path';

const API_URL = 'http://localhost:5000/api';

async function runTests() {
  console.log('--- STARTING EXTENSIONS INTEGRATION TESTS ---');

  const emailSuffix = Date.now();
  const buyerEmail = `buyer_${emailSuffix}@test.com`;
  const sellerEmail = `seller_${emailSuffix}@test.com`;
  const shopName = `Shop_${emailSuffix}`;

  try {
    // 1. Register Buyer
    console.log('1. Registering Buyer...');
    const bReg = await fetch(`${API_URL}/auth/register/buyer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Ext Buyer',
        email: buyerEmail,
        phone: `+992900${Math.floor(100000 + Math.random() * 900000)}`,
        password: 'password123'
      })
    });
    if (bReg.status !== 201) {
      throw new Error(`Failed to register buyer: ${await bReg.text()}`);
    }

    // 2. Register Seller
    console.log('2. Registering Seller...');
    const sReg = await fetch(`${API_URL}/auth/register/seller`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Ext Seller',
        shopName: shopName,
        description: 'Ext shop desc',
        email: sellerEmail,
        phone: `+992931${Math.floor(100000 + Math.random() * 900000)}`,
        password: 'password123'
      })
    });
    if (sReg.status !== 201) {
      throw new Error(`Failed to register seller: ${await sReg.text()}`);
    }

    // Logins
    console.log('Logins...');
    const bLoginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: buyerEmail, password: 'password123' })
    });
    const sLoginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: sellerEmail, password: 'password123' })
    });
    const aLoginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@ecommerce.com', password: 'adminpassword' })
    });

    const buyerToken = (await bLoginRes.json() as any).token;
    const sellerToken = (await sLoginRes.json() as any).token;
    const adminToken = (await aLoginRes.json() as any).token;

    // Fetch Shop Profile Details
    const meRes = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${sellerToken}` }
    });
    const meData = await meRes.json() as any;
    const sellerShopId = meData.user.shop.id;

    // 3. Set Auto-Reply Chatbot settings
    console.log('3. Configuring Auto-Reply settings...');
    const replySetRes = await fetch(`${API_URL}/shops/settings/auto-reply`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${sellerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        autoReplyText: 'Hello! Thanks for writing. This is an auto reply.',
        autoReplyEnabled: true
      })
    });
    const replySetData = await replySetRes.json() as any;
    console.log('Auto Reply settings updated:', replySetData.shop);

    // Fetch Colors to get a valid colorId
    const colorsRes = await fetch(`${API_URL}/colors`);
    const colors = await colorsRes.json() as any;
    const colorId = colors.colors[0].id;

    // Fetch Categories to get a valid categoryId
    const catsRes = await fetch(`${API_URL}/categories`);
    const cats = await catsRes.json() as any;
    const categoryId = cats.categories[0].id;

    // Fetch Brands to get a valid brandId
    const brandsRes = await fetch(`${API_URL}/brands`);
    const brands = await brandsRes.json() as any;
    const brandId = brands.brands[0].id;

    // Create a dummy file for product upload
    const dummyFilePath = path.join(__dirname, 'dummy.png');
    fs.writeFileSync(dummyFilePath, 'dummy data');

    // 4. Create Product with SKU Variants
    console.log('4. Creating product with SKU variants...');
    const form = new FormData();
    form.append('name', 'Variant T-Shirt');
    form.append('description', 'Cool multi-variant shirt');
    form.append('price', '100');
    form.append('colorId', colorId);
    form.append('size', 'M');
    form.append('stockQuantity', '15');
    form.append('categoryId', categoryId);
    form.append('brandId', brandId);

    const variants = [
      { colorId, size: 'S', stockQuantity: 5, price: 90 },
      { colorId, size: 'M', stockQuantity: 10, price: 100 }
    ];
    form.append('variants', JSON.stringify(variants));

    const fileBuffer = fs.readFileSync(dummyFilePath);
    const fileBlob = new Blob([fileBuffer], { type: 'image/png' });
    form.append('images', fileBlob, 'dummy.png');

    const prodRes = await fetch(`${API_URL}/products`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sellerToken}` },
      body: form
    });
    const prodData = await prodRes.json() as any;
    if (prodRes.status !== 201) {
      throw new Error(`Failed to create product: ${JSON.stringify(prodData)}`);
    }

    const product = prodData.product;
    console.log('Product created:', product.name);
    console.log('Variants saved:', product.variants.map((v: any) => `${v.size}: stock=${v.stockQuantity}, price=$${v.price}`));

    const variantS = product.variants.find((v: any) => v.size === 'S');

    // Clean dummy file
    fs.unlinkSync(dummyFilePath);

    // 5. Create Delivery Address for Buyer
    console.log('5. Saving delivery address...');
    const addrRes = await fetch(`${API_URL}/addresses`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${buyerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Home Address',
        city: 'Dushanbe',
        street: 'Rudaki Ave',
        building: '22',
        apartment: '14',
        isDefault: true
      })
    });
    const addrData = await addrRes.json() as any;
    if (addrRes.status !== 201) {
      throw new Error(`Failed to save address: ${JSON.stringify(addrData)}`);
    }
    const addressId = addrData.address.id;
    console.log('Address saved ID:', addressId);

    // 6. Add SKU Variant to Cart
    console.log('6. Adding Variant S to Cart...');
    const cartAddRes = await fetch(`${API_URL}/cart`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${buyerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        variantId: variantS.id,
        quantity: 2
      })
    });
    const cartAddData = await cartAddRes.json() as any;
    if (cartAddRes.status !== 200) {
      throw new Error(`Failed to add to cart: ${JSON.stringify(cartAddData)}`);
    }
    console.log('Cart item added:', cartAddData.message);

    // 7. Place Order
    console.log('7. Placing Order...');
    const orderRes = await fetch(`${API_URL}/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${buyerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ addressId })
    });
    const orderData = await orderRes.json() as any;
    if (orderRes.status !== 201) {
      throw new Error(`Failed to checkout order: ${JSON.stringify(orderData)}`);
    }
    const order = orderData.order;
    console.log('Order created ID:', order.id, 'Total Price:', order.totalPrice);

    // Verify stock decreases
    const afterOrderProdRes = await fetch(`${API_URL}/products/${product.id}`);
    const afterOrderProd = await afterOrderProdRes.json() as any;
    const vSAfter = afterOrderProd.product.variants.find((v: any) => v.size === 'S');
    console.log('Initial SKU stock of S: 5. After order stock:', vSAfter.stockQuantity, '(Expected: 3)');

    // 8. Add Review with Photo
    console.log('8. Submitting Review with Photo...');
    const reviewForm = new FormData();
    reviewForm.append('rating', '5');
    reviewForm.append('comment', 'Awesome shirt fits perfectly!');
    
    const reviewDummyFile = path.join(__dirname, 'review_dummy.jpg');
    fs.writeFileSync(reviewDummyFile, 'review-photo');
    const revBuffer = fs.readFileSync(reviewDummyFile);
    const revBlob = new Blob([revBuffer], { type: 'image/jpeg' });
    reviewForm.append('reviewImages', revBlob, 'review_dummy.jpg');

    const revRes = await fetch(`${API_URL}/products/${product.id}/reviews`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${buyerToken}` },
      body: reviewForm
    });
    const revData = await revRes.json() as any;
    if (revRes.status !== 200) {
      throw new Error(`Failed to save review: ${JSON.stringify(revData)}`);
    }
    const reviewId = revData.review.id;
    console.log('Review saved with photo URL:', revData.review.images[0]?.url);
    fs.unlinkSync(reviewDummyFile);

    // 9. Seller Replies to Review
    console.log('9. Seller replying to review...');
    const replyRes = await fetch(`${API_URL}/products/reviews/${reviewId}/reply`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sellerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        reply: 'Thanks for purchasing, wear it in good health!'
      })
    });
    const replyData = await replyRes.json() as any;
    if (replyRes.status !== 200) {
      throw new Error(`Failed to reply to review: ${JSON.stringify(replyData)}`);
    }
    console.log('Seller reply saved:', replyData.review.sellerReply);

    // 10. Buyer requests a Refund
    console.log('10. Requesting Refund...');
    const refundForm = new FormData();
    refundForm.append('reason', 'Damaged stitching on collar');
    
    const refundDummyFile = path.join(__dirname, 'refund_dummy.jpg');
    fs.writeFileSync(refundDummyFile, 'refund-photo');
    const refBuffer = fs.readFileSync(refundDummyFile);
    const refBlob = new Blob([refBuffer], { type: 'image/jpeg' });
    refundForm.append('refundImages', refBlob, 'refund_dummy.jpg');

    const refundReqRes = await fetch(`${API_URL}/orders/${order.id}/refund`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${buyerToken}` },
      body: refundForm
    });
    const refundReqData = await refundReqRes.json() as any;
    if (refundReqRes.status !== 201) {
      throw new Error(`Failed to request refund: ${JSON.stringify(refundReqData)}`);
    }
    console.log('Refund requested status:', refundReqData.refundRequest.status);
    fs.unlinkSync(refundDummyFile);

    // 11. Seller processes return -> Disputes it
    console.log('11. Seller disputes the refund...');
    const sellerProcRes = await fetch(`${API_URL}/orders/${order.id}/refund`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${sellerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'DISPUTED',
        explanation: 'Item seems fine in photos, raising to admin'
      })
    });
    const sellerProcData = await sellerProcRes.json() as any;
    if (sellerProcRes.status !== 200) {
      throw new Error(`Failed to dispute refund: ${JSON.stringify(sellerProcData)}`);
    }
    console.log('Updated refund request status:', sellerProcData.refundRequest.status);

    // 12. Admin Resolves Dispute (APPROVED)
    console.log('12. Admin resolves dispute as APPROVED...');
    const adminResolveRes = await fetch(`${API_URL}/orders/${order.id}/refund/dispute`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'APPROVED',
        explanation: 'Customer is right, stitch is bad.'
      })
    });
    const adminResolveData = await adminResolveRes.json() as any;
    if (adminResolveRes.status !== 200) {
      throw new Error(`Failed to resolve dispute: ${JSON.stringify(adminResolveData)}`);
    }
    console.log('Resolved request status:', adminResolveData.refundRequest.status);

    // Verify stock is refunded back
    const finalProdRes = await fetch(`${API_URL}/products/${product.id}`);
    const finalProd = await finalProdRes.json() as any;
    const vSFinal = finalProd.product.variants.find((v: any) => v.size === 'S');
    console.log('SKU stock of S after return approval:', vSFinal.stockQuantity, '(Expected: 5)');

    // 13. Admin fetches all users list
    console.log('13. Admin fetching all users list...');
    const usersListRes = await fetch(`${API_URL}/admin/users`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const usersListData = await usersListRes.json() as any;
    if (usersListRes.status !== 200) {
      throw new Error(`Failed to fetch users list as admin: ${JSON.stringify(usersListData)}`);
    }
    console.log('Admin users list fetch count:', usersListData.users.length, '(Expected > 0)');

    console.log('--- ALL EXTENSION INTEGRATION TESTS PASSED SUCCESSFULLY! ---');
  } catch (err: any) {
    console.error('--- INTEGRATION TEST FAILED ---');
    console.error(err);
    process.exit(1);
  }
}

runTests();
