// Payment provider registry — a provider-agnostic scaffold. Today two providers
// work out of the box:
//   • COD  — cash on delivery (no gateway, pay the courier)
//   • MOCK — a simulated online payment for testing the full flow end-to-end
//
// Real Tajik gateways (Alif Mobi, DC / Korti Milli) are listed but disabled
// until merchant credentials are supplied via env vars. When they arrive, wire
// the create-payment / verify-webhook calls in `startProviderPayment` — the
// rest of the app (Payment model, endpoints, notifications) already works.

export interface ProviderInfo {
  id: string;
  label: string;
  online: boolean; // false = pay offline (COD)
  enabled: boolean;
  description: string;
}

export const PROVIDERS: ProviderInfo[] = [
  { id: 'COD', label: 'Пардохт ҳангоми расонидан', online: false, enabled: true, description: 'Нақд ба фиристанда' },
  { id: 'MOCK', label: 'Корти онлайн (тест)', online: true, enabled: true, description: 'Пардохти озмоишӣ' },
  {
    id: 'ALIF',
    label: 'Alif Mobi',
    online: true,
    enabled: Boolean(process.env.ALIF_MERCHANT_KEY),
    description: 'Пардохт тавассути Alif Mobi'
  },
  {
    id: 'DC',
    label: 'Корти Миллӣ (DC)',
    online: true,
    enabled: Boolean(process.env.DC_MERCHANT_KEY),
    description: 'Пардохт тавассути Корти Миллӣ'
  }
];

export const getProvider = (id: string): ProviderInfo | undefined =>
  PROVIDERS.find((p) => p.id === id && p.enabled);

// Build the buyer-facing next step for a chosen provider. For MOCK we return a
// URL to our own confirm endpoint (simulating a gateway redirect). Real
// providers would call their API here and return the hosted checkout URL.
export const startProviderPayment = (
  provider: ProviderInfo,
  payment: { id: string; amount: number }
): { paymentUrl: string | null; instructions: string } => {
  if (provider.id === 'COD') {
    return {
      paymentUrl: null,
      instructions: 'Фармоиш қабул шуд. Ҳангоми расонидан ба фиристанда нақд пардохт кунед.'
    };
  }

  if (provider.id === 'MOCK') {
    const base = process.env.PUBLIC_BASE_URL || '';
    return {
      paymentUrl: `${base}/api/payments/${payment.id}/confirm`,
      instructions: 'Барои анҷоми пардохти озмоишӣ ба саҳифаи пардохт гузаред.'
    };
  }

  // ALIF / DC: placeholder until merchant integration is wired up.
  return {
    paymentUrl: null,
    instructions: `Интегратсияи ${provider.label} ҳанӯз фаъол нест — ба зудӣ илова мешавад.`
  };
};
