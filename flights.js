require('dotenv').config();
const Amadeus = require('amadeus');

// Lazy-init — avoid crash on startup when keys not configured
let _amadeus = null;
function getAmadeus() {
  if (!_amadeus) {
    _amadeus = new Amadeus({
      clientId: process.env.AMADEUS_API_KEY,
      clientSecret: process.env.AMADEUS_API_SECRET,
    });
  }
  return _amadeus;
}

/**
 * Pretraži letove
 * @param {string} origin - IATA kod (npr. 'VIE')
 * @param {string} destination - IATA kod (npr. 'LHR')
 * @param {string} departureDate - format 'YYYY-MM-DD'
 * @param {number} adults - broj putnika (default 1)
 * @returns {Promise<Array>} top 3 rezultata
 */
async function searchFlights(origin, destination, departureDate, adults = 1) {
  if (!process.env.AMADEUS_API_KEY || !process.env.AMADEUS_API_SECRET) {
    throw new Error('AMADEUS_NOT_CONFIGURED');
  }

  try {
    const response = await getAmadeus().shopping.flightOffersSearch.get({
      originLocationCode: origin.toUpperCase(),
      destinationLocationCode: destination.toUpperCase(),
      departureDate,
      adults,
      max: 5,
      currencyCode: 'EUR',
    });

    const offers = response.data || [];

    return offers.slice(0, 3).map((offer) => {
      const seg = offer.itineraries[0].segments[0];
      const price = offer.price.total;
      const flightNum = `${seg.carrierCode}${seg.number}`;
      const departure = seg.departure.at;
      const arrival = seg.arrival.at;
      const duration = offer.itineraries[0].duration
        .replace('PT', '').replace('H', 'h ').replace('M', 'min');

      return {
        flightNum,
        airline: seg.carrierCode,
        departure,
        arrival,
        duration,
        price: `€${price}`,
        stops: offer.itineraries[0].segments.length - 1,
      };
    });
  } catch (err) {
    if (err.description) {
      const errMsg = JSON.stringify(err.description);
      if (errMsg.includes('UNAUTHORIZED') || errMsg.includes('invalid_client')) {
        throw new Error('AMADEUS_AUTH_ERROR');
      }
    }
    throw err;
  }
}

/**
 * Formatiraj rezultate letova za Telegram poruku
 */
function formatFlights(flights, origin, destination, date) {
  if (!flights.length) {
    return `✈️ Keine Flüge von ${origin} nach ${destination} am ${date} gefunden.`;
  }

  const lines = flights.map((f, i) => {
    const dep = new Date(f.departure).toLocaleString('de-AT', {
      timeZone: 'Europe/Vienna', hour: '2-digit', minute: '2-digit',
    });
    const arr = new Date(f.arrival).toLocaleString('de-AT', {
      timeZone: 'Europe/Vienna', hour: '2-digit', minute: '2-digit',
    });
    const stops = f.stops === 0 ? 'Direktflug' : `${f.stops} Stopp(s)`;
    return `${i + 1}. *${f.flightNum}* — ${f.price}\n   🕐 ${dep} → ${arr} (${f.duration})\n   ${stops}`;
  });

  return `✈️ *Flüge ${origin} → ${destination}*\n📅 ${date}\n\n${lines.join('\n\n')}`;
}

module.exports = { searchFlights, formatFlights };
