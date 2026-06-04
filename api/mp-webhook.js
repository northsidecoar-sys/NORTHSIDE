module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).end();

  try {
    const { type, data } = req.body;
    if (type !== 'payment' || !data?.id) return res.status(200).json({ received: true });

    // Get payment from MP
    const mpRes = await fetch('https://api.mercadopago.com/v1/payments/' + data.id, {
      headers: { 'Authorization': 'Bearer ' + process.env.MP_ACCESS_TOKEN }
    });
    const payment = await mpRes.json();

    const { status, external_reference } = payment;
    console.log('MP webhook: payment', data.id, 'status:', status, 'order:', external_reference);

    // Update Firebase via REST API (no SDK needed)
    if (external_reference && process.env.FIREBASE_SERVICE_ACCOUNT) {
      const newStatus = status === 'approved' ? 'pagado'
        : status === 'rejected' ? 'cancelado' : 'pendiente';

      // Get Firebase access token
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      const tokenRes = await fetch(
        'https://oauth2.googleapis.com/token',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: createJWT(serviceAccount)
          })
        }
      );
      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;

      if (accessToken) {
        // Query Firestore for the order
        const projectId = serviceAccount.project_id;
        const queryRes = await fetch(
          `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
          {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + accessToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              structuredQuery: {
                from: [{ collectionId: 'orders' }],
                where: {
                  fieldFilter: {
                    field: { fieldPath: 'orderId' },
                    op: 'EQUAL',
                    value: { stringValue: external_reference }
                  }
                },
                limit: 1
              }
            })
          }
        );
        const queryData = await queryRes.json();
        const doc = queryData[0]?.document;
        if (doc) {
          const docPath = doc.name;
          await fetch(
            `https://firestore.googleapis.com/v1/${docPath}?updateMask.fieldPaths=status&updateMask.fieldPaths=mpPaymentId&updateMask.fieldPaths=mpStatus`,
            {
              method: 'PATCH',
              headers: {
                'Authorization': 'Bearer ' + accessToken,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                fields: {
                  status: { stringValue: newStatus },
                  mpPaymentId: { stringValue: String(data.id) },
                  mpStatus: { stringValue: status }
                }
              })
            }
          );
          console.log('Order', external_reference, 'updated to', newStatus);
        }
      }
    }

    return res.status(200).json({ received: true });
  } catch (e) {
    console.error('webhook error:', e.message);
    return res.status(200).json({ received: true });
  }
};

function createJWT(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  })).toString('base64url');

  const crypto = require('crypto');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(header + '.' + payload);
  const signature = sign.sign(serviceAccount.private_key, 'base64url');
  return header + '.' + payload + '.' + signature;
}
