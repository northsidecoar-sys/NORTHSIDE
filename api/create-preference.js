const { MercadoPagoConfig, Preference } = require('mercadopago');

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { items, orderId, payer } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ error: 'No items provided' });
    }

    const preference = new Preference(client);

    const result = await preference.create({
      body: {
        items: items.map(item => ({
          id: String(item.productId || item.id),
          title: item.name + (item.size && item.size !== '—' ? ' - Talle ' + item.size : '') + (item.color && item.color !== '—' ? ' / ' + item.color : ''),
          quantity: item.qty || 1,
          unit_price: Number(item.price),
          currency_id: 'ARS',
          picture_url: item.imgUrl || undefined
        })),
        payer: payer ? {
          name: payer.name || '',
          email: payer.email || ''
        } : undefined,
        external_reference: orderId || '',
        back_urls: {
          success: 'https://northside.vercel.app/?mp=success',
          failure: 'https://northside.vercel.app/?mp=failure',
          pending: 'https://northside.vercel.app/?mp=pending'
        },
        auto_return: 'approved',
        notification_url: 'https://northside.vercel.app/api/mp-webhook',
        statement_descriptor: 'NORTHSIDE',
        payment_methods: {
          excluded_payment_types: [],
          installments: 6
        }
      }
    });

    return res.status(200).json({
      id: result.id,
      init_point: result.init_point,
      sandbox_init_point: result.sandbox_init_point
    });

  } catch (error) {
    console.error('MP create-preference error:', error);
    return res.status(500).json({
      error: 'Error creating preference',
      detail: error.message
    });
  }
};
