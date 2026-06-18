const user = process.env.CORREO_USERNAME_QA || 'LUSpositoAPI';
const pass = process.env.CORREO_PASSWORD_QA || '';
const base = 'https://apitest.correoargentino.com.ar/micorreo/v1';
const auth = Buffer.from(`${user}:${pass}`).toString('base64');

async function main() {
  const tokRes = await fetch(`${base}/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const tokText = await tokRes.text();
  console.log('TOKEN', tokRes.status, tokText.slice(0, 200));
  const tok = JSON.parse(tokText).token;
  if (!tok) return;

  const emails = ['beleg20399@sixoplus.com', 'webmaster@naturalonline.com.ar'];
  const customerIds = {};
  for (const email of emails) {
    const vRes = await fetch(`${base}/users/validate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass }),
    });
    const vText = await vRes.text();
    console.log('VALIDATE', email, vRes.status, vText);
    try {
      const j = JSON.parse(vText);
      if (j.customerId) customerIds[email] = j.customerId;
    } catch {
      /* ignore */
    }
  }

  for (const [email, customerId] of Object.entries(customerIds)) {
    const bodies = [
      {
        label: 'object dims D',
        body: {
          customerId,
          postalCodeOrigin: '5000',
          postalCodeDestination: '1425',
          deliveredType: 'D',
          dimensions: { weight: 500, height: 10, width: 40, length: 50 },
        },
      },
      {
        label: 'array dims D',
        body: {
          customerId,
          postalCodeOrigin: '5000',
          postalCodeDestination: '1425',
          deliveredType: 'D',
          dimensions: [{ weight: 500, height: 10, width: 40, length: 50, quantity: 1 }],
        },
      },
      {
        label: 'object dims same CP',
        body: {
          customerId,
          postalCodeOrigin: '5000',
          postalCodeDestination: '5000',
          deliveredType: 'D',
          dimensions: { weight: 563, height: 8, width: 40, length: 50 },
        },
      },
    ];
    for (const { label, body } of bodies) {
      const r = await fetch(`${base}/rates`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const t = await r.text();
      console.log('RATES', email, label, r.status, t.slice(0, 600));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
