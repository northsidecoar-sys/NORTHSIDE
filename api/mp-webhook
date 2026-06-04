const { MercadoPagoConfig, Payment } = require('mercadopago');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { credential } = require('firebase-admin');

// ── Firebase Admin init ───────────────────────────────────
// You need to add FIREBASE_SERVICE_ACCOUNT as env variable in Vercel
// with the JSON content of your Firebase service account key
let db;
try {
  if (!getApps().length) {
    initializeApp({
      credential: credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
  }
  db = getFirestore();
} catch (e) {
  console.error('Firebase init error:', e.message);
}

// ── MP client ─────────────────────────────────────────────
const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { type, data } = req.body;

    // Only process payment notifications
    if (type !== 'payment' || !data?.id) {
      return res.status(200).json({ received: true });
    }

    // Get payment details from MP
    const payment = new Payment(client);
    const paymentData = await payment.get({ id: data.id });

    const {
      status,           // approved | rejected | pending | in_process
      external_reference, // orderId we sent when creating preference
      transaction_amount,
      payment_method_id,
      payer
    } = paymentData;

    console.log(`MP Webhook: payment ${data.id} status=${status} order=${external_reference}`);

    // Update order in Firebase if we have orderId and db
    if (db && external_reference) {
      const ordersRef = db.collection('orders');
      const snap = await ordersRef.where('orderId', '==', external_reference).limit(1).get();

      if (!snap.empty) {
        const orderDoc = snap.docs[0];
        const newStatus = status === 'approved' ? 'pagado'
          : status === 'rejected' ? 'cancelado'
          : 'pendiente';

        await orderDoc.ref.update({
          status: newStatus,
          mpPaymentId: data.id,
          mpStatus: status,
          mpPaymentMethod: payment_method_id,
          mpAmount: transaction_amount,
          updatedAt: Date.now()
        });

        console.log(`Order ${external_reference} updated to ${newStatus}`);
      }
    }

    return res.status(200).json({ received: true });

  } catch (error) {
    console.error('MP webhook error:', error);
    // Always return 200 to MP so it doesn't retry
    return res.status(200).json({ received: true, error: error.message });
  }
};

