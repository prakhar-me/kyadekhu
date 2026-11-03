// Shared by the advertise form and the /api/enquiry validator.
export const AD_TYPES = ['Homepage slot', 'Inside search results', 'Not sure yet'] as const;
export const BUDGETS = ['Under ₹5,000', '₹5,000 to ₹20,000', '₹20,000+', 'Let’s talk'] as const;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
