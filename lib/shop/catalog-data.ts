/**
 * The fixed NexaMart catalogue — 50 products, prices in Indian rupees.
 *
 * This array is the *seed source only*: `ensureCatalog()` in `lib/shop/catalog.ts`
 * writes it into the `Product` table once, and from then on every read (client
 * shopping page, cart, orders, AI tools) goes to the database. Every client, new
 * or returning, shops from these rows — nothing else can be ordered.
 */

export interface SeedProduct {
  sku: string;
  title: string;
  category: string;
  description: string;
  priceInr: number;
  emoji: string;
  imageUrl?: string;
  rating: number;
}

export const CATEGORIES = [
  'Electronics',
  'Fashion',
  'Home & Kitchen',
  'Grocery',
  'Beauty',
  'Sports',
  'Books & Stationery',
  'Toys & Baby',
] as const;

export const CATALOG: SeedProduct[] = [
  // --- Electronics (10) -----------------------------------------------------
  { sku: 'NM-EL-001', title: 'NexaSound Bluetooth Headphones', category: 'Electronics', description: 'Over-ear wireless headphones, 40h battery, deep bass.', priceInr: 3999, emoji: '🎧', imageUrl: 'https://picsum.photos/seed/NM-EL-001/400/400', rating: 4.4 },
  { sku: 'NM-EL-002', title: 'NexaBuds Pro Earbuds', category: 'Electronics', description: 'TWS earbuds with active noise cancellation and fast charge.', priceInr: 2499, emoji: '🎵', imageUrl: 'https://picsum.photos/seed/NM-EL-002/400/400', rating: 4.3 },
  { sku: 'NM-EL-003', title: '20W Fast Charger (Type-C)', category: 'Electronics', description: 'Compact PD charger with cable, works with all phones.', priceInr: 899, emoji: '🔌', imageUrl: 'https://picsum.photos/seed/NM-EL-003/400/400', rating: 4.5 },
  { sku: 'NM-EL-004', title: 'Power Bank 20000mAh', category: 'Electronics', description: 'Dual output, 18W fast charging, airline safe.', priceInr: 1899, emoji: '🔋', imageUrl: 'https://picsum.photos/seed/NM-EL-004/400/400', rating: 4.2 },
  { sku: 'NM-EL-005', title: 'NexaFit Smart Watch', category: 'Electronics', description: '1.8 inch AMOLED, SpO2, heart rate, 7 day battery.', priceInr: 2999, emoji: '⌚', imageUrl: 'https://picsum.photos/seed/NM-EL-005/400/400', rating: 4.1 },
  { sku: 'NM-EL-006', title: 'Wireless Mouse Silent Click', category: 'Electronics', description: '2.4GHz wireless, 1600 DPI, silent buttons.', priceInr: 649, emoji: '🖱️', imageUrl: 'https://picsum.photos/seed/NM-EL-006/400/400', rating: 4.3 },
  { sku: 'NM-EL-007', title: 'Mechanical Keyboard TKL', category: 'Electronics', description: '87 keys, blue switches, white backlight.', priceInr: 3299, emoji: '⌨️', imageUrl: 'https://picsum.photos/seed/NM-EL-007/400/400', rating: 4.4 },
  { sku: 'NM-EL-008', title: 'NexaBeam Bluetooth Speaker', category: 'Electronics', description: '10W portable speaker, IPX6 water resistant.', priceInr: 1799, emoji: '🔊', imageUrl: 'https://picsum.photos/seed/NM-EL-008/400/400', rating: 4.2 },
  { sku: 'NM-EL-009', title: 'HD Webcam 1080p', category: 'Electronics', description: 'Auto focus webcam with built-in microphone.', priceInr: 1499, emoji: '📷', imageUrl: 'https://picsum.photos/seed/NM-EL-009/400/400', rating: 4.0 },
  { sku: 'NM-EL-010', title: '32 inch HD Smart TV', category: 'Electronics', description: 'Android TV, dual speakers, 2 HDMI ports.', priceInr: 12999, emoji: '📺', imageUrl: 'https://picsum.photos/seed/NM-EL-010/400/400', rating: 4.3 },

  // --- Fashion (8) ----------------------------------------------------------
  { sku: 'NM-FA-001', title: 'Nexa Runner Shoes', category: 'Fashion', description: 'Lightweight running shoes with memory foam sole.', priceInr: 2499, emoji: '👟', imageUrl: 'https://picsum.photos/seed/NM-FA-001/400/400', rating: 4.4 },
  { sku: 'NM-FA-002', title: 'Cotton Socks (3 pack)', category: 'Fashion', description: 'Breathable ankle socks, free size.', priceInr: 399, emoji: '🧦', imageUrl: 'https://picsum.photos/seed/NM-FA-002/400/400', rating: 4.1 },
  { sku: 'NM-FA-003', title: 'Banarasi Silk Saree', category: 'Fashion', description: 'Handwoven silk saree with zari border, blue.', priceInr: 5499, emoji: '🥻', imageUrl: 'https://picsum.photos/seed/NM-FA-003/400/400', rating: 4.7 },
  { sku: 'NM-FA-004', title: 'Slim Fit Denim Jeans', category: 'Fashion', description: 'Stretchable mid-rise jeans, dark blue.', priceInr: 1799, emoji: '👖', imageUrl: 'https://picsum.photos/seed/NM-FA-004/400/400', rating: 4.2 },
  { sku: 'NM-FA-005', title: 'Cotton Kurta (Men)', category: 'Fashion', description: 'Straight-fit festive kurta, full sleeves.', priceInr: 1299, emoji: '👔', imageUrl: 'https://picsum.photos/seed/NM-FA-005/400/400', rating: 4.3 },
  { sku: 'NM-FA-006', title: 'Printed Cotton Kurti', category: 'Fashion', description: 'Daily wear kurti with pockets, three-quarter sleeves.', priceInr: 899, emoji: '👗', imageUrl: 'https://picsum.photos/seed/NM-FA-006/400/400', rating: 4.2 },
  { sku: 'NM-FA-007', title: 'Leather Wallet (RFID)', category: 'Fashion', description: 'Genuine leather bi-fold wallet with card protection.', priceInr: 999, emoji: '👛', imageUrl: 'https://picsum.photos/seed/NM-FA-007/400/400', rating: 4.4 },
  { sku: 'NM-FA-008', title: 'Polarised Sunglasses', category: 'Fashion', description: 'UV400 protection, matte black frame.', priceInr: 1199, emoji: '🕶️', imageUrl: 'https://picsum.photos/seed/NM-FA-008/400/400', rating: 4.0 },

  // --- Home & Kitchen (10) --------------------------------------------------
  { sku: 'NM-HK-001', title: 'Steel Electric Kettle 1.5L', category: 'Home & Kitchen', description: 'Auto cut-off, boil-dry protection, 1500W.', priceInr: 1299, emoji: '🫖', imageUrl: 'https://picsum.photos/seed/NM-HK-001/400/400', rating: 4.3 },
  { sku: 'NM-HK-002', title: 'Nexa Mixer Grinder 750W', category: 'Home & Kitchen', description: 'Three stainless steel jars, overload protection.', priceInr: 3299, emoji: '🥤', imageUrl: 'https://picsum.photos/seed/NM-HK-002/400/400', rating: 4.2 },
  { sku: 'NM-HK-003', title: 'Non-stick Tawa 28cm', category: 'Home & Kitchen', description: 'Induction friendly, 3-layer non-stick coating.', priceInr: 749, emoji: '🍳', imageUrl: 'https://picsum.photos/seed/NM-HK-003/400/400', rating: 4.1 },
  { sku: 'NM-HK-004', title: 'Pressure Cooker 5L', category: 'Home & Kitchen', description: 'Hard anodised, ISI marked safety valve.', priceInr: 2199, emoji: '🍲', imageUrl: 'https://picsum.photos/seed/NM-HK-004/400/400', rating: 4.5 },
  { sku: 'NM-HK-005', title: 'Copper Water Bottle 1L', category: 'Home & Kitchen', description: 'Leak-proof pure copper bottle, ayurvedic.', priceInr: 699, emoji: '🍾', imageUrl: 'https://picsum.photos/seed/NM-HK-005/400/400', rating: 4.2 },
  { sku: 'NM-HK-006', title: 'Cotton Bedsheet Double', category: 'Home & Kitchen', description: '144 TC bedsheet with two pillow covers.', priceInr: 1099, emoji: '🛏️', imageUrl: 'https://picsum.photos/seed/NM-HK-006/400/400', rating: 4.3 },
  { sku: 'NM-HK-007', title: 'LED Table Lamp', category: 'Home & Kitchen', description: 'Rechargeable study lamp, three brightness levels.', priceInr: 849, emoji: '💡', imageUrl: 'https://picsum.photos/seed/NM-HK-007/400/400', rating: 4.0 },
  { sku: 'NM-HK-008', title: 'Vacuum Cleaner 1000W', category: 'Home & Kitchen', description: 'Handheld vacuum with blower and 2 attachments.', priceInr: 4499, emoji: '🧹', imageUrl: 'https://picsum.photos/seed/NM-HK-008/400/400', rating: 4.1 },
  { sku: 'NM-HK-009', title: 'Air Fryer 4L', category: 'Home & Kitchen', description: 'Oil-free frying, 8 presets, timer dial.', priceInr: 5999, emoji: '🍟', imageUrl: 'https://picsum.photos/seed/NM-HK-009/400/400', rating: 4.4 },
  { sku: 'NM-HK-010', title: 'Storage Container Set (6)', category: 'Home & Kitchen', description: 'Airtight BPA-free kitchen containers.', priceInr: 899, emoji: '🥫', imageUrl: 'https://picsum.photos/seed/NM-HK-010/400/400', rating: 4.2 },

  // --- Grocery (7) ----------------------------------------------------------
  { sku: 'NM-GR-001', title: 'Basmati Rice 5kg', category: 'Grocery', description: 'Aged long-grain basmati rice.', priceInr: 649, emoji: '🍚', imageUrl: 'https://picsum.photos/seed/NM-GR-001/400/400', rating: 4.4 },
  { sku: 'NM-GR-002', title: 'Toor Dal 2kg', category: 'Grocery', description: 'Unpolished arhar dal, protein rich.', priceInr: 359, emoji: '🫘', imageUrl: 'https://picsum.photos/seed/NM-GR-002/400/400', rating: 4.3 },
  { sku: 'NM-GR-003', title: 'Cold Pressed Mustard Oil 1L', category: 'Grocery', description: 'Kachi ghani mustard oil, single filtered.', priceInr: 229, emoji: '🫒', imageUrl: 'https://picsum.photos/seed/NM-GR-003/400/400', rating: 4.2 },
  { sku: 'NM-GR-004', title: 'Assam Tea 500g', category: 'Grocery', description: 'Strong CTC leaf tea for kadak chai.', priceInr: 299, emoji: '🍵', imageUrl: 'https://picsum.photos/seed/NM-GR-004/400/400', rating: 4.5 },
  { sku: 'NM-GR-005', title: 'Filter Coffee Powder 250g', category: 'Grocery', description: '80:20 coffee-chicory South Indian blend.', priceInr: 349, emoji: '☕', imageUrl: 'https://picsum.photos/seed/NM-GR-005/400/400', rating: 4.4 },
  { sku: 'NM-GR-006', title: 'Mixed Dry Fruits 500g', category: 'Grocery', description: 'Almonds, cashews and raisins gift pack.', priceInr: 899, emoji: '🥜', imageUrl: 'https://picsum.photos/seed/NM-GR-006/400/400', rating: 4.3 },
  { sku: 'NM-GR-007', title: 'Whole Wheat Atta 10kg', category: 'Grocery', description: 'Chakki fresh atta for soft rotis.', priceInr: 499, emoji: '🌾', imageUrl: 'https://picsum.photos/seed/NM-GR-007/400/400', rating: 4.2 },

  // --- Beauty (5) -----------------------------------------------------------
  { sku: 'NM-BE-001', title: 'Ayurvedic Face Wash 150ml', category: 'Beauty', description: 'Neem and turmeric daily cleanser.', priceInr: 249, emoji: '🧴', imageUrl: 'https://picsum.photos/seed/NM-BE-001/400/400', rating: 4.1 },
  { sku: 'NM-BE-002', title: 'Argan Hair Oil 200ml', category: 'Beauty', description: 'Non-sticky nourishing hair oil.', priceInr: 449, emoji: '💆', imageUrl: 'https://picsum.photos/seed/NM-BE-002/400/400', rating: 4.2 },
  { sku: 'NM-BE-003', title: 'Sunscreen SPF 50 100g', category: 'Beauty', description: 'Matte finish, no white cast, PA+++.', priceInr: 549, emoji: '🧼', imageUrl: 'https://picsum.photos/seed/NM-BE-003/400/400', rating: 4.4 },
  { sku: 'NM-BE-004', title: 'Beard Trimmer Cordless', category: 'Beauty', description: '20 length settings, 90 minute runtime.', priceInr: 1599, emoji: '✂️', imageUrl: 'https://picsum.photos/seed/NM-BE-004/400/400', rating: 4.3 },
  { sku: 'NM-BE-005', title: 'Matte Lipstick Set (3)', category: 'Beauty', description: 'Long-stay transfer-proof shades.', priceInr: 799, emoji: '💄', imageUrl: 'https://picsum.photos/seed/NM-BE-005/400/400', rating: 4.0 },

  // --- Sports (4) -----------------------------------------------------------
  { sku: 'NM-SP-001', title: 'Yoga Mat 6mm', category: 'Sports', description: 'Anti-slip TPE mat with carry strap.', priceInr: 899, emoji: '🧘', imageUrl: 'https://picsum.photos/seed/NM-SP-001/400/400', rating: 4.3 },
  { sku: 'NM-SP-002', title: 'Adjustable Dumbbell Set 10kg', category: 'Sports', description: 'PVC plates with two rods and connectors.', priceInr: 1899, emoji: '🏋️', imageUrl: 'https://picsum.photos/seed/NM-SP-002/400/400', rating: 4.1 },
  { sku: 'NM-SP-003', title: 'Cricket Bat Kashmir Willow', category: 'Sports', description: 'Short handle bat with full cover.', priceInr: 2299, emoji: '🏏', imageUrl: 'https://picsum.photos/seed/NM-SP-003/400/400', rating: 4.2 },
  { sku: 'NM-SP-004', title: 'Badminton Racket Pair', category: 'Sports', description: 'Lightweight aluminium rackets with 3 shuttles.', priceInr: 1249, emoji: '🏸', imageUrl: 'https://picsum.photos/seed/NM-SP-004/400/400', rating: 4.0 },

  // --- Books & Stationery (3) -----------------------------------------------
  { sku: 'NM-BK-001', title: 'Hardbound Notebook A5 (2)', category: 'Books & Stationery', description: '200 ruled pages each, elastic closure.', priceInr: 399, emoji: '📓', imageUrl: 'https://picsum.photos/seed/NM-BK-001/400/400', rating: 4.4 },
  { sku: 'NM-BK-002', title: 'Gel Pen Pack (10)', category: 'Books & Stationery', description: '0.7mm smooth writing blue gel pens.', priceInr: 199, emoji: '🖊️', imageUrl: 'https://picsum.photos/seed/NM-BK-002/400/400', rating: 4.2 },
  { sku: 'NM-BK-003', title: 'Indian History Paperback', category: 'Books & Stationery', description: 'Bestselling illustrated history book.', priceInr: 599, emoji: '📚', imageUrl: 'https://picsum.photos/seed/NM-BK-003/400/400', rating: 4.6 },

  // --- Toys & Baby (3) ------------------------------------------------------
  { sku: 'NM-TB-001', title: 'Building Blocks Set (120 pcs)', category: 'Toys & Baby', description: 'Non-toxic creative blocks for ages 3+.', priceInr: 899, emoji: '🧱', imageUrl: 'https://picsum.photos/seed/NM-TB-001/400/400', rating: 4.5 },
  { sku: 'NM-TB-002', title: 'Remote Control Car', category: 'Toys & Baby', description: 'Rechargeable 2.4GHz stunt car.', priceInr: 1299, emoji: '🚗', imageUrl: 'https://picsum.photos/seed/NM-TB-002/400/400', rating: 4.1 },
  { sku: 'NM-TB-003', title: 'Baby Diapers Pack (60)', category: 'Toys & Baby', description: 'Size M pants, 12 hour absorption.', priceInr: 1099, emoji: '🍼', imageUrl: 'https://picsum.photos/seed/NM-TB-003/400/400', rating: 4.3 },
];

if (CATALOG.length !== 50) {
  // Guard: the shopping page and the docs both promise exactly 50 products.
  throw new Error(`Catalogue must contain 50 products, found ${CATALOG.length}`);
}
