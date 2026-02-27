/* eslint-disable no-console */
const mongoose = require("mongoose");
const connectDB = require("../src/config/database");

const User = require("../src/modules/users/user.model");
const Boutique = require("../src/modules/boutique/boutique.model");
const Box = require("../src/modules/boxes/box.model");
const Contract = require("../src/modules/contracts/contract.model");
const Product = require("../src/modules/products/product.model");
const StockMovement = require("../src/modules/products/stock-movement.model");
const Sale = require("../src/modules/sales/sale.model");
const BillingCycle = require("../src/modules/billing/billing-cycle.model");
const BillingTrace = require("../src/modules/billing/billing-trace.model");
const ElectricityInvoice = require("../src/modules/billing/electricity-invoice.model");
const Credit = require("../src/modules/credit/credit.model");
const BoutiqueReview = require("../src/modules/reviews/review.model");
const Activity = require("../src/modules/activities/activity.model");

const TAG = "SEED_DEMO_2026";
const round = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const now = new Date();

const avatars = {
  admin: "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=500&q=80",
  buyer: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=500&q=80",
  owner: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=500&q=80"
};

const productNames = [
  ["Smartphone Galaxy A55 5G", "Électronique", "Smartphones", 1680000],
  ["iPhone 14 128Go", "Électronique", "Smartphones", 3690000],
  ["Casque Bluetooth ANC", "Électronique", "Audio", 620000],
  ["Montre connectée Sport", "Électronique", "Wearables", 410000],
  ["T-shirt Coton Premium", "Mode", "Hauts", 65000],
  ["Jean Slim Fit Bleu", "Mode", "Pantalons", 145000],
  ["Sneakers Running Air", "Mode", "Chaussures", 280000],
  ["Sac à dos Urbain 25L", "Mode", "Accessoires", 98000],
  ["Chaise ergonomique Office", "Maison", "Bureau", 520000],
  ["Lampe LED Design", "Maison", "Éclairage", 89000],
  ["Mixeur Blender 1200W", "Maison", "Cuisine", 210000],
  ["Set Casseroles Inox", "Maison", "Cuisine", 305000],
  ["Crème hydratante 50ml", "Beauté", "Visage", 42000],
  ["Parfum Élégance 100ml", "Beauté", "Parfums", 390000],
  ["Lisseur céramique Pro", "Beauté", "Cheveux", 185000],
  ["Kit maquillage 24 couleurs", "Beauté", "Maquillage", 95000],
  ["Ballon football officiel", "Sport", "Football", 76000],
  ["Tapis yoga antidérapant", "Sport", "Fitness", 55000],
  ["Vélo VTT 27.5", "Sport", "Cyclisme", 1280000],
  ["Chaussures randonnée Trek", "Sport", "Outdoor", 330000]
];

const events = [
  "Festival Gastronomique",
  "Marché Premium de Noël",
  "Salon Innovation Tech",
  "Semaine Beauté & Bien-être",
  "Compétition eSport TI Arena",
  "Fashion Week TI Commercial",
  "Journée des Enfants",
  "Foire Artisanale Locale",
  "Concert Live Acoustic",
  "Conférence Entrepreneuriat"
];

const productImageUrls = [
  "https://picsum.photos/id/1/1200/800",
  "https://picsum.photos/id/11/1200/800",
  "https://picsum.photos/id/12/1200/800",
  "https://picsum.photos/id/13/1200/800",
  "https://picsum.photos/id/14/1200/800",
  "https://picsum.photos/id/15/1200/800",
  "https://picsum.photos/id/16/1200/800",
  "https://picsum.photos/id/17/1200/800",
  "https://picsum.photos/id/18/1200/800",
  "https://picsum.photos/id/19/1200/800",
  "https://picsum.photos/id/20/1200/800",
  "https://picsum.photos/id/21/1200/800",
  "https://picsum.photos/id/22/1200/800",
  "https://picsum.photos/id/23/1200/800",
  "https://picsum.photos/id/24/1200/800",
  "https://picsum.photos/id/25/1200/800",
  "https://picsum.photos/id/26/1200/800",
  "https://picsum.photos/id/27/1200/800",
  "https://picsum.photos/id/28/1200/800",
  "https://picsum.photos/id/29/1200/800"
];

const eventImageUrls = [
  "https://picsum.photos/id/1011/1400/900",
  "https://picsum.photos/id/1015/1400/900",
  "https://picsum.photos/id/1016/1400/900",
  "https://picsum.photos/id/1021/1400/900",
  "https://picsum.photos/id/1024/1400/900",
  "https://picsum.photos/id/1025/1400/900",
  "https://picsum.photos/id/1031/1400/900",
  "https://picsum.photos/id/1033/1400/900",
  "https://picsum.photos/id/1035/1400/900",
  "https://picsum.photos/id/1037/1400/900"
];

const ensureUser = async (payload) => {
  const email = payload.email.toLowerCase();
  const user = (await User.findOne({ email })) || new User({ email });
  user.pseudo = payload.pseudo;
  user.password = payload.password;
  user.firstName = payload.firstName;
  user.lastName = payload.lastName;
  user.gender = payload.gender;
  user.avatar = payload.avatar;
  user.role = payload.role;
  user.status = "ACTIVE";
  user.isAccountCompleted = true;
  await user.save();
  return user;
};

const fStatus = (i) => {
  if (i % 13 === 0) return "REJECTED";
  if (i % 5 === 0) return "DELIVERED";
  if (i % 4 === 0) return "OUT_FOR_DELIVERY";
  if (i % 3 === 0) return "READY";
  if (i % 2 === 0) return "PREPARING";
  return "SCHEDULED";
};

const orderStatus = (f) => (f === "DELIVERED" ? "DELIVERED" : f === "REJECTED" ? "CANCELLED" : f === "SCHEDULED" ? "PLACED" : "PROCESSING");

async function run() {
  await connectDB();
  console.log("Connected, seeding...");

  const admin = await ensureUser({
    pseudo: "admin-ti-commercial",
    email: "admin@gmail.com",
    password: "mdp@admin.com",
    firstName: "Admin",
    lastName: "TI",
    gender: "Other",
    avatar: avatars.admin,
    role: "ADMIN"
  });
  const buyer = await ensureUser({
    pseudo: "acheteur-premium",
    email: "acheteur@gmail.com",
    password: "mdp@acheteur.com",
    firstName: "Client",
    lastName: "Premium",
    gender: "Female",
    avatar: avatars.buyer,
    role: "USER"
  });
  const owner = await ensureUser({
    pseudo: "boutique-master",
    email: "boutique@gmail.com",
    password: "mdp@boutique.com",
    firstName: "Boutique",
    lastName: "Owner",
    gender: "Male",
    avatar: avatars.owner,
    role: "BOUTIQUE"
  });

  const reviewers = [];
  for (let i = 1; i <= 12; i += 1) {
    reviewers.push(
      await ensureUser({
        pseudo: `client-review-${String(i).padStart(2, "0")}`,
        email: `seed.reviewer.${i}@gmail.com`,
        password: `SeedReview!${100 + i}`,
        firstName: `Client${i}`,
        lastName: "Seed",
        gender: i % 2 === 0 ? "Male" : "Female",
        avatar: `https://randomuser.me/api/portraits/${i % 2 === 0 ? "men" : "women"}/${(10 + i) % 99}.jpg`,
        role: "USER"
      })
    );
  }

  const box = await Box.findOneAndUpdate(
    { number: "B-044" },
    { number: "B-044", floor: 0, surface: 34, monthlyRent: 950000, electricityMeterNumber: "MTR-044-TI", boutique: null },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );

  const boutique =
    (await Boutique.findOne({ owner: owner._id })) ||
    (await Boutique.create({ name: "Boutique Premium TI", owner: owner._id }));

  boutique.logo = "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=600&q=80";
  boutique.activity = "Retail multi-catégories et offres lifestyle";
  boutique.offerings = "Électronique, mode, sport, maison et beauté.";
  boutique.marketingTagline = "Des produits authentiques et une expérience premium.";
  boutique.publicDescription = "Bienvenue chez Boutique Premium TI, box B-044 au rez-de-chaussée.";
  boutique.box = box._id;
  boutique.onlineSalesEnabled = true;
  boutique.deliverySettings = { workingDays: [1, 2, 3, 4, 5, 6], dailyOrderCapacity: 80, preparationDays: 1 };
  boutique.status = "ACTIVE";
  await boutique.save();

  box.boutique = boutique._id;
  await box.save();
  owner.boutique = boutique._id;
  await owner.save();

  await Contract.collection.updateOne(
    { boutique: boutique._id, notes: `${TAG}-MAIN-CONTRACT` },
    {
      $set: {
        boutique: boutique._id,
        startDate: new Date("2025-01-01T00:00:00.000Z"),
        endDate: new Date("2028-12-31T23:59:59.999Z"),
        durationMonths: 48,
        monthlyRent: 950000,
        penaltyFee: 120000,
        penaltyGrowthFactor: 1.15,
        terminationFee: 600000,
        onlineSalesCommissionPercent: 8,
        status: "ACTIVE",
        notes: `${TAG}-MAIN-CONTRACT`,
        updatedAt: new Date()
      },
      $setOnInsert: {
        createdAt: new Date()
      }
    },
    { upsert: true }
  );

  await Product.deleteMany({ boutique: boutique._id, "metadata.seedTag": TAG });
  await StockMovement.deleteMany({ note: TAG });
  const products = [];
  for (let i = 0; i < productNames.length; i += 1) {
    const [name, category, subCategory, basePrice] = productNames[i];
    const p = await Product.create({
      boutique: boutique._id,
      name,
      sku: `DEMOTI-${String(i + 1).padStart(3, "0")}`,
      barcode: `3760000${String(200000 + i)}`,
      description: `Produit premium ${name} avec qualité garantie.`,
      brand: ["Samsung", "Apple", "Sony", "Huawei", "Nike", "Adidas", "Philips", "Tefal"][i % 8],
      category,
      subCategory,
      tags: [category.toLowerCase(), subCategory.toLowerCase(), "premium"],
      images: [productImageUrls[i]],
      price: basePrice,
      salePrice: round(basePrice * 0.95),
      costPrice: round(basePrice * 0.7),
      promotion: i < 6 ? { enabled: true, percentage: 18 + (i % 3), startsAt: new Date("2026-01-01"), durationDays: 700 } : null,
      taxRate: 20,
      stockQuantity: 18 + (i % 12) * 5,
      lowStockThreshold: 12,
      status: "ACTIVE",
      isPublished: true,
      metadata: { seedTag: TAG }
    });
    products.push(p);
    const initial = p.stockQuantity;
    await StockMovement.insertMany([
      { product: p._id, boutique: boutique._id, createdBy: owner._id, type: "INITIAL", quantity: initial, previousStock: 0, newStock: initial, reason: "Stock initial", note: TAG, reference: `INIT-${p.sku}` },
      { product: p._id, boutique: boutique._id, createdBy: owner._id, type: "IN", quantity: 20, previousStock: initial, newStock: initial + 20, reason: "Réapprovisionnement", note: TAG, reference: `SUP-${p.sku}` },
      { product: p._id, boutique: boutique._id, createdBy: owner._id, type: "OUT", quantity: 8, previousStock: initial + 20, newStock: initial + 12, reason: "Ventes", note: TAG, reference: `OUT-${p.sku}` },
      { product: p._id, boutique: boutique._id, createdBy: owner._id, type: "SET", quantity: initial + 10, previousStock: initial + 12, newStock: initial + 10, reason: "Inventaire", note: TAG, reference: `INV-${p.sku}` }
    ]);
  }

  await Sale.deleteMany({ reference: /^DEMO-SAL-\d{4}$/ });
  await BillingTrace.deleteMany({ $or: [{ referenceLabel: /^DEMO-/ }, { reason: new RegExp(TAG) }] });

  const orderBuyers = [buyer, ...reviewers];
  const sales = [];
  const comm = [];
  for (let i = 0; i < 55; i += 1) {
    const placedAt = new Date(now.getTime() - (i % 120) * 24 * 60 * 60 * 1000);
    const b = orderBuyers[i % orderBuyers.length];
    const selected = [products[i % 20], products[(i + 7) % 20], products[(i + 13) % 20]].slice(0, 1 + (i % 3));
    let subtotal = 0;
    let taxTotal = 0;
    let qty = 0;
    const items = selected.map((p, j) => {
      const q = 1 + ((i + j) % 3);
      const lineTotal = round((Number(p.price) || 0) * q);
      const lineTax = round(lineTotal * 0.2);
      subtotal = round(subtotal + lineTotal);
      taxTotal = round(taxTotal + lineTax);
      qty += q;
      return { product: p._id, boutique: boutique._id, productName: p.name, sku: p.sku, imageUrl: p.images[0], quantity: q, unitPrice: p.price, lineTotal, lineTax, lineGrandTotal: round(lineTotal + lineTax), currency: "MGA" };
    });
    const f = fStatus(i);
    const grand = round(subtotal + taxTotal);
    sales.push({
      reference: `DEMO-SAL-${String(i + 1).padStart(4, "0")}`,
      buyer: b._id,
      buyerSnapshot: { pseudo: b.pseudo, email: b.email, firstName: b.firstName, lastName: b.lastName },
      items,
      boutiqueBreakdown: [{ boutique: boutique._id, boutiqueName: boutique.name, itemCount: items.length, quantityTotal: qty, subtotal, currency: "MGA", deliveryDate: new Date(placedAt.getTime() + (2 + (i % 6)) * 86400000), fulfillmentStatus: f, fulfillmentNote: `${TAG} suivi`, processedAt: new Date(placedAt.getTime() + 86400000), refundedAmount: f === "REJECTED" ? grand : 0, refundedAt: f === "REJECTED" ? new Date(placedAt.getTime() + 172800000) : null }],
      totals: { itemCount: items.length, quantityTotal: qty, subtotal, taxTotal, grandTotal: grand, currency: "MGA" },
      deliveryContact: { pickupLocation: "TI Commercial - Point retrait principal", contactPhone: "+261340000000" },
      deliveryCapacityPolicy: "AUTO_NEXT_AVAILABLE",
      paymentMethod: "CREDIT",
      paymentStatus: "PAID",
      status: orderStatus(f),
      idempotencyKeyHash: `seed-${TAG}-${i}`,
      placedAt
    });
    comm.push({
      boutique: boutique._id,
      ownerUser: owner._id,
      month: placedAt.getMonth() + 1,
      year: placedAt.getFullYear(),
      category: "COMMISSION",
      action: "SALE_COMMISSION",
      automatic: true,
      amount: grand,
      paidAmount: round(grand * 0.08),
      remainingAmount: 0,
      status: "APPLIED",
      reason: `${TAG} commission`,
      referenceType: "SALE",
      referenceLabel: `DEMO-COMM-${String(i + 1).padStart(4, "0")}`,
      details: { saleReference: `DEMO-SAL-${String(i + 1).padStart(4, "0")}`, clientEmail: b.email, commissionRate: 8 }
    });
  }
  await Sale.insertMany(sales);
  await BillingTrace.insertMany(comm);

  for (let k = 0; k < 12; k += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    const rentDue = 950000;
    const elecDue = 120000 + month * 5500;
    const pDue = month % 3 === 0 ? 80000 : month % 4 === 0 ? 45000 : 0;
    const rentAuto = month % 2 === 0 ? 600000 : 400000;
    const rentMan = month % 2 === 0 ? 200000 : 300000;
    const elecAuto = month % 2 === 0 ? 85000 : 50000;
    const elecMan = month % 2 === 0 ? 20000 : 35000;
    await BillingCycle.findOneAndUpdate(
      { boutique: boutique._id, month, year },
      {
        boutique: boutique._id,
        ownerUser: owner._id,
        month,
        year,
        rentDue,
        rentAutoPaid: rentAuto,
        rentManualPaid: rentMan,
        electricityDue: elecDue,
        electricityAutoPaid: elecAuto,
        electricityManualPaid: elecMan,
        penaltyDue: pDue,
        penaltyAutoPaid: round(pDue * 0.2),
        penaltyManualPaid: round(pDue * 0.3),
        rentDueDate: new Date(year, month - 1, 28),
        electricityDueDate: new Date(year, month - 1, 28),
        penaltyBreakdown: {
          rent: { baseFee: 120000, monthsLate: pDue ? 1 : 0, growthFactor: 1.15, amountDue: round(pDue * 0.55) },
          electricity: { baseFee: 120000, monthsLate: pDue ? 1 : 0, growthFactor: 1.15, amountDue: round(pDue * 0.45) }
        }
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
    await ElectricityInvoice.findOneAndUpdate(
      { boutique: boutique._id, meterNumber: "MTR-044-TI", month, year },
      {
        boutique: boutique._id,
        box: box._id,
        meterNumber: "MTR-044-TI",
        month,
        year,
        netAmount: elecDue,
        sourceFilePath: `/uploads/invoices/${TAG}-${year}-${month}.pdf`,
        sourceFileName: `${TAG}-${year}-${month}.pdf`,
        uploadedBy: admin._id
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
    await BillingTrace.insertMany([
      { boutique: boutique._id, ownerUser: owner._id, month, year, category: "RENT", action: "AUTO_DEBIT", automatic: true, amount: rentDue, paidAmount: rentAuto, remainingAmount: Math.max(0, rentDue - rentAuto - rentMan), status: "PARTIAL", reason: `${TAG} auto loyer`, referenceLabel: `DEMO-RENT-${year}-${month}` },
      { boutique: boutique._id, ownerUser: owner._id, month, year, category: "ELECTRICITY", action: "AUTO_DEBIT", automatic: true, amount: elecDue, paidAmount: elecAuto, remainingAmount: Math.max(0, elecDue - elecAuto - elecMan), status: "PARTIAL", reason: `${TAG} auto électricité`, referenceLabel: `DEMO-ELEC-${year}-${month}` },
      { boutique: boutique._id, ownerUser: owner._id, month, year, category: "PENALTY", action: "AUTO_DEBIT", automatic: true, amount: pDue, paidAmount: round(pDue * 0.2), remainingAmount: Math.max(0, pDue - round(pDue * 0.5)), status: pDue ? "PARTIAL" : "APPLIED", reason: `${TAG} auto pénalité`, referenceLabel: `DEMO-PEN-${year}-${month}` }
    ]);
  }

  await Credit.deleteMany({ code: /^DEMOCR-/ });
  const credits = [];
  const usersForCredits = [buyer, ...reviewers];
  for (let i = 0; i < 60; i += 1) {
    const value = i % 3 === 0 ? 20000 : i % 3 === 1 ? 100000 : 400000;
    const used = i % 4 !== 0;
    credits.push({
      code: `DEMOCR-${String(1000 + i)}`,
      value,
      status: used ? "used" : "active",
      isPrinted: true,
      printedAt: new Date(now.getTime() - (80 - i) * 86400000),
      createdBy: admin._id,
      usedBy: used ? usersForCredits[i % usersForCredits.length]._id : null,
      expiresAt: new Date(now.getTime() + 120 * 86400000),
      usedAt: used ? new Date(now.getTime() - (40 - (i % 35)) * 86400000) : null,
      idempotencyKeyHash: used ? `seed-credit-${i}` : null,
      history: [{ action: "generated", by: admin._id }, { action: "printed", by: admin._id }, ...(used ? [{ action: "used", by: usersForCredits[i % usersForCredits.length]._id }] : [])]
    });
  }
  await Credit.insertMany(credits);
  buyer.credit = 3200000;
  await buyer.save();
  owner.credit = 7800000;
  await owner.save();

  await BoutiqueReview.deleteMany({ boutique: boutique._id });
  const comments = [
    "Service impeccable et livraison rapide.",
    "Produits de qualité, je recommande.",
    "Personnel accueillant et professionnel.",
    "Très bon rapport qualité/prix.",
    "Boutique bien organisée et offres utiles.",
    "Livraison respectée, emballage soigné."
  ];
  for (let i = 0; i < [buyer, ...reviewers].length; i += 1) {
    const u = [buyer, ...reviewers][i];
    await BoutiqueReview.create({
      user: u._id,
      boutique: boutique._id,
      rating: 4 + (i % 2 === 0 ? 1 : 0),
      comment: comments[i % comments.length]
    });
  }

  await Activity.deleteMany({ sourceKey: new RegExp(`^${TAG}-EVENT-`) });
  for (let i = 0; i < events.length; i += 1) {
    await Activity.create({
      title: events[i],
      description: `${events[i]} - événement premium avec animations, partenaires et offres exclusives.`,
      eventDate: new Date(now.getTime() + (20 + i * 9) * 86400000),
      durationDays: 2 + (i % 3),
      location: "TI Commercial - Zone événementielle",
      imageUrl: eventImageUrls[i],
      tag: ["Gastronomie", "Shopping", "Tech", "Beauté", "Gaming", "Mode", "Famille", "Artisanat", "Musique", "Business"][i],
      isPublished: true,
      sourceKey: `${TAG}-EVENT-${String(i + 1).padStart(2, "0")}`
    });
  }

  console.log("Seed completed.");
  console.log("Admin: admin@gmail.com / mdp@admin.com");
  console.log("Acheteur: acheteur@gmail.com / mdp@acheteur.com");
  console.log("Boutique: boutique@gmail.com / mdp@boutique.com");
}

run()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
    console.log("DB connection closed.");
  });
