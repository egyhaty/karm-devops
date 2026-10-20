const seedProperties = [
  { slug: 'garden-residence', title: 'Garden Residence', location: 'New Cairo', type: 'apartment', price: 4250000, bedrooms: 3, area: 165, description: 'A bright family apartment with a generous living area, garden views and two balconies. Close to everyday services and main roads.', image: '/images/garden.svg', featured: true },
  { slug: 'courtyard-villa', title: 'Courtyard Villa', location: 'Sheikh Zayed', type: 'villa', price: 12500000, bedrooms: 4, area: 320, description: 'An independent home arranged around a private courtyard. Separate reception and family spaces, with room for a home office.', image: '/images/villa.svg', featured: true },
  { slug: 'city-studio', title: 'City Studio', location: 'Maadi', type: 'studio', price: 1850000, bedrooms: 1, area: 68, description: 'A compact, well-planned studio near neighbourhood cafés and public transport. An open living space with a separate bathroom.', image: '/images/studio.svg', featured: false },
  { slug: 'terrace-apartment', title: 'Terrace Apartment', location: 'New Cairo', type: 'apartment', price: 5700000, bedrooms: 3, area: 195, description: 'A top-floor apartment with an open terrace and a flexible dining area. Designed for natural light and quiet evenings outdoors.', image: '/images/garden.svg', featured: false },
  { slug: 'west-family-home', title: 'West Family Home', location: 'Sheikh Zayed', type: 'villa', price: 9800000, bedrooms: 4, area: 280, description: 'A practical family home with a private entrance, landscaped outdoor space and a spacious kitchen.', image: '/images/villa.svg', featured: false },
  { slug: 'riverside-studio', title: 'Riverside Studio', location: 'Maadi', type: 'studio', price: 2300000, bedrooms: 1, area: 82, description: 'A comfortable studio with a defined sleeping area and space to work from home. Located in a walkable residential neighbourhood.', image: '/images/studio.svg', featured: true },
];
const locations = ['New Cairo', 'Sheikh Zayed', 'Maadi'];
const types = ['apartment', 'villa', 'studio'];
function validateProperty(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Provide a property object.');
  const { title, location, type, price, bedrooms, area, description } = body;
  if (typeof title !== 'string' || title.trim().length < 3 || title.length > 100) throw new Error('Title must contain 3–100 characters.');
  if (!locations.includes(location) || !types.includes(type)) throw new Error('Choose a supported location and property type.');
  if (!Number.isSafeInteger(price) || price < 100000 || price > 1000000000) throw new Error('Price must be a whole EGP amount between 100,000 and 1,000,000,000.');
  if (!Number.isInteger(bedrooms) || bedrooms < 1 || bedrooms > 12) throw new Error('Bedrooms must be between 1 and 12.');
  if (!Number.isInteger(area) || area < 20 || area > 10000) throw new Error('Area must be between 20 and 10,000 m².');
  if (typeof description !== 'string' || description.trim().length < 20 || description.length > 2000) throw new Error('Description must contain 20–2,000 characters.');
  return { title: title.trim(), location, type, price, bedrooms, area, description: description.trim(), image: `/images/${type === 'villa' ? 'villa' : type === 'studio' ? 'studio' : 'garden'}.svg` };
}
function validateInquiry(body) {
  if (!body || typeof body !== 'object') throw new Error('Provide a viewing request.');
  const { name, phone, message = '' } = body;
  if (typeof name !== 'string' || name.trim().length < 2 || name.length > 100) throw new Error('Name must contain 2–100 characters.');
  if (typeof phone !== 'string' || !/^\+?[0-9 ()-]{7,24}$/.test(phone) || phone.replace(/\D/g, '').length < 7) throw new Error('Enter a valid contact phone number.');
  if (typeof message !== 'string' || message.length > 1000) throw new Error('Message must be under 1,000 characters.');
  return { name: name.trim(), phone: phone.replace(/[^+0-9]/g, ''), message: message.trim() };
}
function parseFilters(query) {
  const allowed = ['q', 'location', 'type', 'maxPrice', 'bedrooms', 'sort'];
  for (const [key, value] of Object.entries(query)) if (!allowed.includes(key) || typeof value !== 'string') throw new Error('Invalid search parameter.');
  const filters = { q: query.q || '', location: query.location || '', type: query.type || '', sort: query.sort || 'featured' };
  if (filters.q.length > 100) throw new Error('Search must be under 100 characters.');
  if (filters.location && !locations.includes(filters.location)) throw new Error('Unknown location.');
  if (filters.type && !types.includes(filters.type)) throw new Error('Unknown property type.');
  if (!['featured', 'price-asc', 'price-desc'].includes(filters.sort)) throw new Error('Invalid sort order.');
  for (const key of ['maxPrice', 'bedrooms']) {
    if (!query[key]) { filters[key] = null; continue; }
    if (!/^\d+$/.test(query[key])) throw new Error(`Invalid ${key}.`);
    filters[key] = Number(query[key]);
    if (!Number.isSafeInteger(filters[key]) || filters[key] < 1 || filters[key] > (key === 'bedrooms' ? 12 : 1000000000)) throw new Error(`Invalid ${key}.`);
  }
  return filters;
}
module.exports = { seedProperties, validateProperty, validateInquiry, parseFilters };
