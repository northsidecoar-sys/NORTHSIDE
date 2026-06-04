module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { items, orderId, payer } = req.body;
    if (!items || !items.length) return res.status(400).json({ error: 'No items' });

    const body = {
      items: items.map(item => ({
        id: String(item.productId || item.id || ''),
        title: item.name +
          (item.size && item.size !== '—' ? ' - Talle ' + item.size : '') +
          (item.color && item.color !== '—' ? ' / ' + item.color : ''),
        quantity: Number(item.qty) || 1,
        unit_price: Number(item.price),
        currency_id: 'ARS'
      })),
      external_reference: orderId || '',
      back_urls: {
        success: 'https://northside.vercel.app/?mp=success',
        failure: 'https://northside.vercel.app/?mp=failure',
        pending: 'https://northside.vercel.app/?mp=pending'
      },
      auto_return: 'approved',
      notification_url: 'https://northside.vercel.app/api/mp-webhook',
      statement_descriptor: 'NORTHSIDE',
      payment_methods: { installments: 6 }
    };

    if (payer && payer.email) body.payer = { email: payer.email, name: payer.name || '' };

    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.MP_ACCESS_TOKEN
      },
      body: JSON.stringify(body)
    });

    const data = await mpRes.json();

    if (!mpRes.ok) {
      console.error('MP API error:', JSON.stringify(data));
      return res.status(500).json({ error: data.message || 'MP error' });
    }

    return res.status(200).json({ id: data.id, init_point: data.init_point });

  } catch (e) {
    console.error('create-preference error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
