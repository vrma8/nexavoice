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
  /** Short safety / usage note shown on the product card. Usually blank. */
  caution?: string;
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
  'Medicine',
] as const;

export const CATALOG: SeedProduct[] = [
  // --- Electronics (10) -----------------------------------------------------
  { sku: 'NM-EL-001', title: 'NexaSound Bluetooth Headphones', category: 'Electronics', description: 'Over-ear wireless headphones, 40h battery, deep bass.', priceInr: 3999, emoji: '🎧', imageUrl: '/products/NM-EL-001.jpg', rating: 4.4 },
  { sku: 'NM-EL-002', title: 'NexaBuds Pro Earbuds', category: 'Electronics', description: 'TWS earbuds with active noise cancellation and fast charge.', priceInr: 2499, emoji: '🎵', imageUrl: '/products/NM-EL-002.webp', rating: 4.3 },
  { sku: 'NM-EL-003', title: '20W Fast Charger (Type-C)', category: 'Electronics', description: 'Compact PD charger with cable, works with all phones.', priceInr: 899, emoji: '🔌', imageUrl: '/products/NM-EL-003.jpg', rating: 4.5 },
  { sku: 'NM-EL-004', title: 'Power Bank 20000mAh', category: 'Electronics', description: 'Dual output, 18W fast charging, airline safe.', priceInr: 1899, emoji: '🔋', imageUrl: '/products/NM-EL-004.jpg', rating: 4.2 },
  { sku: 'NM-EL-005', title: 'NexaFit Smart Watch', category: 'Electronics', description: '1.8 inch AMOLED, SpO2, heart rate, 7 day battery.', priceInr: 2999, emoji: '⌚', imageUrl: '/products/NM-EL-005.jpg', rating: 4.1 },
  { sku: 'NM-EL-006', title: 'Wireless Mouse Silent Click', category: 'Electronics', description: '2.4GHz wireless, 1600 DPI, silent buttons.', priceInr: 649, emoji: '🖱️', imageUrl: '/products/NM-EL-006.jpg', rating: 4.3 },
  { sku: 'NM-EL-007', title: 'Mechanical Keyboard TKL', category: 'Electronics', description: '87 keys, blue switches, white backlight.', priceInr: 3299, emoji: '⌨️', imageUrl: '/products/NM-EL-007.webp', rating: 4.4 },
  { sku: 'NM-EL-008', title: 'NexaBeam Bluetooth Speaker', category: 'Electronics', description: '10W portable speaker, IPX6 water resistant.', priceInr: 1799, emoji: '🔊', imageUrl: '/products/NM-EL-008.png', rating: 4.2 },
  { sku: 'NM-EL-009', title: 'HD Webcam 1080p', category: 'Electronics', description: 'Auto focus webcam with built-in microphone.', priceInr: 1499, emoji: '📷', imageUrl: '/products/NM-EL-009.jpg', rating: 4.0 },
  { sku: 'NM-EL-010', title: '32 inch HD Smart TV', category: 'Electronics', description: 'Android TV, dual speakers, 2 HDMI ports.', priceInr: 12999, emoji: '📺', imageUrl: '/products/NM-EL-010.png', rating: 4.3 },

  // --- Fashion (8) ----------------------------------------------------------
  { sku: 'NM-FA-001', title: 'Nexa Runner Shoes', category: 'Fashion', description: 'Lightweight running shoes with memory foam sole.', priceInr: 2499, emoji: '👟', imageUrl: '/products/NM-FA-001.jpg', rating: 4.4 },
  { sku: 'NM-FA-002', title: 'Cotton Socks (3 pack)', category: 'Fashion', description: 'Breathable ankle socks, free size.', priceInr: 399, emoji: '🧦', imageUrl: '/products/NM-FA-002.jpg', rating: 4.1 },
  { sku: 'NM-FA-003', title: 'Banarasi Silk Saree', category: 'Fashion', description: 'Handwoven silk saree with zari border, blue.', priceInr: 5499, emoji: '🥻', imageUrl: '/products/NM-FA-003.jpg', rating: 4.7 },
  { sku: 'NM-FA-004', title: 'Slim Fit Denim Jeans', category: 'Fashion', description: 'Stretchable mid-rise jeans, dark blue.', priceInr: 1799, emoji: '👖', imageUrl: '/products/NM-FA-004.jpg', rating: 4.2 },
  { sku: 'NM-FA-005', title: 'Cotton Kurta (Men)', category: 'Fashion', description: 'Straight-fit festive kurta, full sleeves.', priceInr: 1299, emoji: '👔', imageUrl: '/products/NM-FA-005.jpg', rating: 4.3 },
  { sku: 'NM-FA-006', title: 'Printed Cotton Kurti', category: 'Fashion', description: 'Daily wear kurti with pockets, three-quarter sleeves.', priceInr: 899, emoji: '👗', imageUrl: '/products/NM-FA-006.jpg', rating: 4.2 },
  { sku: 'NM-FA-007', title: 'Leather Wallet (RFID)', category: 'Fashion', description: 'Genuine leather bi-fold wallet with card protection.', priceInr: 999, emoji: '👛', imageUrl: '/products/NM-FA-007.jpg', rating: 4.4 },
  { sku: 'NM-FA-008', title: 'Polarised Sunglasses', category: 'Fashion', description: 'UV400 protection, matte black frame.', priceInr: 1199, emoji: '🕶️', imageUrl: '/products/NM-FA-008.png', rating: 4.0 },

  // --- Home & Kitchen (10) --------------------------------------------------
  { sku: 'NM-HK-001', title: 'Steel Electric Kettle 1.5L', category: 'Home & Kitchen', description: 'Auto cut-off, boil-dry protection, 1500W.', priceInr: 1299, emoji: '🫖', imageUrl: '/products/NM-HK-001.jpg', rating: 4.3 },
  { sku: 'NM-HK-002', title: 'Nexa Mixer Grinder 750W', category: 'Home & Kitchen', description: 'Three stainless steel jars, overload protection.', priceInr: 3299, emoji: '🥤', imageUrl: '/products/NM-HK-002.webp', rating: 4.2 },
  { sku: 'NM-HK-003', title: 'Non-stick Tawa 28cm', category: 'Home & Kitchen', description: 'Induction friendly, 3-layer non-stick coating.', priceInr: 749, emoji: '🍳', imageUrl: '/products/NM-HK-003.jpg', rating: 4.1 },
  { sku: 'NM-HK-004', title: 'Pressure Cooker 5L', category: 'Home & Kitchen', description: 'Hard anodised, ISI marked safety valve.', priceInr: 2199, emoji: '🍲', imageUrl: '/products/NM-HK-004.jpg', rating: 4.5 },
  { sku: 'NM-HK-005', title: 'Copper Water Bottle 1L', category: 'Home & Kitchen', description: 'Leak-proof pure copper bottle, ayurvedic.', priceInr: 699, emoji: '🍾', imageUrl: '/products/NM-HK-005.jpg', rating: 4.2 },
  { sku: 'NM-HK-006', title: 'Cotton Bedsheet Double', category: 'Home & Kitchen', description: '144 TC bedsheet with two pillow covers.', priceInr: 1099, emoji: '🛏️', imageUrl: '/products/NM-HK-006.jpg', rating: 4.3 },
  { sku: 'NM-HK-007', title: 'LED Table Lamp', category: 'Home & Kitchen', description: 'Rechargeable study lamp, three brightness levels.', priceInr: 849, emoji: '💡', imageUrl: '/products/NM-HK-007.jpg', rating: 4.0 },
  { sku: 'NM-HK-008', title: 'Vacuum Cleaner 1000W', category: 'Home & Kitchen', description: 'Handheld vacuum with blower and 2 attachments.', priceInr: 4499, emoji: '🧹', imageUrl: '/products/NM-HK-008.jpg', rating: 4.1 },
  { sku: 'NM-HK-009', title: 'Air Fryer 4L', category: 'Home & Kitchen', description: 'Oil-free frying, 8 presets, timer dial.', priceInr: 5999, emoji: '🍟', imageUrl: '/products/NM-HK-009.png', rating: 4.4 },
  { sku: 'NM-HK-010', title: 'Storage Container Set (6)', category: 'Home & Kitchen', description: 'Airtight BPA-free kitchen containers.', priceInr: 899, emoji: '🥫', imageUrl: '/products/NM-HK-010.jpg', rating: 4.2 },

  // --- Grocery (7) ----------------------------------------------------------
  { sku: 'NM-GR-001', title: 'Basmati Rice 5kg', category: 'Grocery', description: 'Aged long-grain basmati rice.', priceInr: 649, emoji: '🍚', imageUrl: '/products/NM-GR-001.jpg', rating: 4.4 },
  { sku: 'NM-GR-002', title: 'Toor Dal 2kg', category: 'Grocery', description: 'Unpolished arhar dal, protein rich.', priceInr: 359, emoji: '🫘', imageUrl: '/products/NM-GR-002.jpg', rating: 4.3 },
  { sku: 'NM-GR-003', title: 'Cold Pressed Mustard Oil 1L', category: 'Grocery', description: 'Kachi ghani mustard oil, single filtered.', priceInr: 229, emoji: '🫒', imageUrl: '/products/NM-GR-003.jpg', rating: 4.2 },
  { sku: 'NM-GR-004', title: 'Assam Tea 500g', category: 'Grocery', description: 'Strong CTC leaf tea for kadak chai.', priceInr: 299, emoji: '🍵', imageUrl: '/products/NM-GR-004.jpg', rating: 4.5 },
  { sku: 'NM-GR-005', title: 'Filter Coffee Powder 250g', category: 'Grocery', description: '80:20 coffee-chicory South Indian blend.', priceInr: 349, emoji: '☕', imageUrl: '/products/NM-GR-005.jpg', rating: 4.4 },
  { sku: 'NM-GR-006', title: 'Mixed Dry Fruits 500g', category: 'Grocery', description: 'Almonds, cashews and raisins gift pack.', priceInr: 899, emoji: '🥜', imageUrl: '/products/NM-GR-006.jpg', rating: 4.3 },
  { sku: 'NM-GR-007', title: 'Whole Wheat Atta 10kg', category: 'Grocery', description: 'Chakki fresh atta for soft rotis.', priceInr: 499, emoji: '🌾', imageUrl: '/products/NM-GR-007.png', rating: 4.2 },

  // --- Beauty (5) -----------------------------------------------------------
  { sku: 'NM-BE-001', title: 'Ayurvedic Face Wash 150ml', category: 'Beauty', description: 'Neem and turmeric daily cleanser.', priceInr: 249, emoji: '🧴', imageUrl: '/products/NM-BE-001.jpg', rating: 4.1 },
  { sku: 'NM-BE-002', title: 'Argan Hair Oil 200ml', category: 'Beauty', description: 'Non-sticky nourishing hair oil.', priceInr: 449, emoji: '💆', imageUrl: '/products/NM-BE-002.jpg', rating: 4.2 },
  { sku: 'NM-BE-003', title: 'Sunscreen SPF 50 100g', category: 'Beauty', description: 'Matte finish, no white cast, PA+++.', priceInr: 549, emoji: '🧼', imageUrl: '/products/NM-BE-003.jpg', rating: 4.4 },
  { sku: 'NM-BE-004', title: 'Beard Trimmer Cordless', category: 'Beauty', description: '20 length settings, 90 minute runtime.', priceInr: 1599, emoji: '✂️', imageUrl: '/products/NM-BE-004.jpg', rating: 4.3 },
  { sku: 'NM-BE-005', title: 'Matte Lipstick Set (3)', category: 'Beauty', description: 'Long-stay transfer-proof shades.', priceInr: 799, emoji: '💄', imageUrl: '/products/NM-BE-005.jpg', rating: 4.0 },

  // --- Sports (4) -----------------------------------------------------------
  { sku: 'NM-SP-001', title: 'Yoga Mat 6mm', category: 'Sports', description: 'Anti-slip TPE mat with carry strap.', priceInr: 899, emoji: '🧘', imageUrl: '/products/NM-SP-001.jpg', rating: 4.3 },
  { sku: 'NM-SP-002', title: 'Adjustable Dumbbell Set 10kg', category: 'Sports', description: 'PVC plates with two rods and connectors.', priceInr: 1899, emoji: '🏋️', imageUrl: '/products/NM-SP-002.webp', rating: 4.1 },
  { sku: 'NM-SP-003', title: 'Cricket Bat Kashmir Willow', category: 'Sports', description: 'Short handle bat with full cover.', priceInr: 2299, emoji: '🏏', imageUrl: '/products/NM-SP-003.jpg', rating: 4.2 },
  { sku: 'NM-SP-004', title: 'Badminton Racket Pair', category: 'Sports', description: 'Lightweight aluminium rackets with 3 shuttles.', priceInr: 1249, emoji: '🏸', imageUrl: '/products/NM-SP-004.jpg', rating: 4.0 },

  // --- Books & Stationery (3) -----------------------------------------------
  { sku: 'NM-BK-001', title: 'Hardbound Notebook A5 (2)', category: 'Books & Stationery', description: '200 ruled pages each, elastic closure.', priceInr: 399, emoji: '📓', imageUrl: '/products/NM-BK-001.jpg', rating: 4.4 },
  { sku: 'NM-BK-002', title: 'Gel Pen Pack (10)', category: 'Books & Stationery', description: '0.7mm smooth writing blue gel pens.', priceInr: 199, emoji: '🖊️', imageUrl: '/products/NM-BK-002.jpg', rating: 4.2 },
  { sku: 'NM-BK-003', title: 'Indian History Paperback', category: 'Books & Stationery', description: 'Bestselling illustrated history book.', priceInr: 599, emoji: '📚', imageUrl: '/products/NM-BK-003.jpg', rating: 4.6 },

  // --- Toys & Baby (3) ------------------------------------------------------
  { sku: 'NM-TB-001', title: 'Building Blocks Set (120 pcs)', category: 'Toys & Baby', description: 'Non-toxic creative blocks for ages 3+.', priceInr: 899, emoji: '🧱', imageUrl: '/products/NM-TB-001.jpg', rating: 4.5 },
  { sku: 'NM-TB-002', title: 'Remote Control Car', category: 'Toys & Baby', description: 'Rechargeable 2.4GHz stunt car.', priceInr: 1299, emoji: '🚗', imageUrl: '/products/NM-TB-002.jpg', rating: 4.1 },
  { sku: 'NM-TB-003', title: 'Baby Diapers Pack (60)', category: 'Toys & Baby', description: 'Size M pants, 12 hour absorption.', priceInr: 1099, emoji: '🍼', imageUrl: '/products/NM-TB-003.jpg', rating: 4.3 },

  // --- Medicine (10) ---------------------------------------------------------
  { sku: 'NM-MD-001', title: 'Paracetamol 500mg (10 tabs)', category: 'Medicine', description: 'Relieves fever and mild to moderate pain. Take as directed; do not exceed the dose.', priceInr: 49, emoji: '💊', imageUrl: '/products/NM-MD-001.jpg', rating: 4.5, caution: 'Caution: not to be used by children without medical advice. Follow the dose on the pack; do not exceed 4 tablets in 24 hours.' },
  { sku: 'NM-MD-002', title: 'Ibuprofen 400mg (10 tabs)', category: 'Medicine', description: 'For pain and inflammation. Take with food; not for children under 12.', priceInr: 65, emoji: '💊', imageUrl: '/products/NM-MD-002.jpg', rating: 4.3, caution: 'Caution: take with food. Avoid if you have stomach ulcers or are pregnant. Not for children under 12.' },
  { sku: 'NM-MD-003', title: 'Cough Syrup 100ml', category: 'Medicine', description: 'Soothing relief for dry and wet cough. Use the measuring cup; avoid drowsiness.', priceInr: 120, emoji: '🧴', imageUrl: '/products/NM-MD-003.jpg', rating: 4.2, caution: 'Caution: may cause drowsiness; avoid driving. Use the measuring cup. Consult a doctor before giving to children.' },
  { sku: 'NM-MD-004', title: 'Antacid Tablets (Digene-like, 15)', category: 'Medicine', description: 'Quick relief from acidity, heartburn and gas. Chew before swallowing.', priceInr: 75, emoji: '🫙', imageUrl: '/products/NM-MD-004.jpg', rating: 4.4, caution: 'Caution: for occasional acidity only. Do not use for more than 2 weeks without a doctor. Keep out of reach of children.' },
  { sku: 'NM-MD-005', title: 'Multivitamin Capsules (30)', category: 'Medicine', description: 'Daily essential vitamins and minerals for energy and immunity. One a day after a meal.', priceInr: 199, emoji: '💊', imageUrl: '/products/NM-MD-005.jpg', rating: 4.1, caution: 'Caution: take one after a meal. Do not exceed the daily dose; consult a doctor if you are pregnant or on other supplements.' },
  { sku: 'NM-MD-006', title: 'Cetirizine 10mg (10 tabs)', category: 'Medicine', description: 'Allergy relief for sneezing, itching and runny nose. May cause mild drowsiness.', priceInr: 55, emoji: '💊', imageUrl: '/products/NM-MD-006.jpg', rating: 4.3, caution: 'Caution: may cause drowsiness; avoid alcohol and driving. Not for children under 6 without medical advice.' },
  { sku: 'NM-MD-007', title: 'ORS Rehydration Salts (10 sachets)', category: 'Medicine', description: 'Electrolyte mix to prevent dehydration from fever, heat or loose motions. Dissolve in 1L water.', priceInr: 90, emoji: '🥤', imageUrl: '/products/NM-MD-007.jpg', rating: 4.6, caution: 'Caution: dissolve one sachet in the stated amount of clean water only. Do not add sugar. Seek help for persistent symptoms.' },
  { sku: 'NM-MD-008', title: 'Antiseptic Liquid 550ml', category: 'Medicine', description: 'First-aid antiseptic for cuts, wounds and insect bites. Dilute with water; for external use only.', priceInr: 165, emoji: '🧴', imageUrl: '/products/NM-MD-008.jpg', rating: 4.5, caution: 'Caution: external use only. Do not apply undiluted to broken skin; avoid contact with eyes. Keep away from children.' },
  { sku: 'NM-MD-009', title: 'Hand Sanitizer 100ml', category: 'Medicine', description: 'Kills 99.9% germs without water. Keep away from eyes; for external use only.', priceInr: 45, emoji: '🧼', imageUrl: '/products/NM-MD-009.jpg', rating: 4.2, caution: 'Caution: flammable — keep away from fire. External use only; avoid contact with eyes. Do not ingest.' },
  { sku: 'NM-MD-010', title: 'Digital Thermometer (Oral/Forehead)', category: 'Medicine', description: 'Fast and accurate temperature reading for the whole family. Clean before and after use.', priceInr: 249, emoji: '🌡️', imageUrl: '/products/NM-MD-010.jpg', rating: 4.4, caution: 'Caution: clean the tip before and after each use. Read the manual for proper placement. Avoid dropping or exposing to heat.' },
];

if (CATALOG.length !== 60) {
  // Guard: the shopping page and the docs both promise exactly 60 products.
  throw new Error(`Catalogue must contain 60 products, found ${CATALOG.length}`);
}
