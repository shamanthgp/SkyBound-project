// Destination Suggestions Dataset
const destinationsList = [
    "Delhi (DEL)",
    "Mumbai (BOM)",
    "Bengaluru (BLR)",
    "Chennai (MAA)",
    "Hyderabad (HYD)",
    "Kolkata (CCU)",
    "Kochi (COK)",
    "Goa (GOI)",
    "Pune (PNQ)",
    "Ahmedabad (AMD)",
    "Jaipur (JAI)"
];

// Mock Flight Options
const mockFlights = [
    {
        id: "FL-101",
        flightCode: "6E-2034",
        airline: "IndiGo",
        price: 5800,
        basePrice: 5200,
        taxPrice: 600,
        departureTime: "10:45 AM",
        arrivalTime: "12:55 PM",
        duration: "2h 10m",
        stops: "Non-stop",
        origin: "Delhi (DEL)",
        dest: "Mumbai (BOM)",
        amenityScore: 9.4,
        planeModel: "Airbus A321neo",
        amenities: {
            wifi: true,
            legroom: true,
            meal: true,
            power: true,
            entertainment: true,
            priority: true
        },
        details: {
            wifiSpeed: "High-Speed (50 Mbps)",
            powerOutlets: "AC & USB-C at Every Seat",
            screenSize: '13" 4K HDR Touchscreen',
            seatPitch: '34" (Extra Legroom)',
            seatWidth: '18.5" Recliner',
            seatLayout: "3-3 Layout"
        }
    },
    {
        id: "FL-102",
        flightCode: "AI-805",
        airline: "Air India",
        price: 4600,
        basePrice: 4000,
        taxPrice: 600,
        departureTime: "11:20 AM",
        arrivalTime: "01:30 PM",
        duration: "2h 10m",
        stops: "Non-stop",
        origin: "Delhi (DEL)",
        dest: "Mumbai (BOM)",
        amenityScore: 7.8,
        planeModel: "Boeing 787-8 Dreamliner",
        amenities: {
            wifi: true,
            legroom: false,
            meal: true,
            power: true,
            entertainment: true,
            priority: false
        },
        details: {
            wifiSpeed: "Standard (10 Mbps)",
            powerOutlets: "AC Shared Outlets",
            screenSize: '10" HD Touchscreen',
            seatPitch: '31" (Standard Legroom)',
            seatWidth: '17.2" Standard',
            seatLayout: "3-3-3 Layout"
        }
    },
    {
        id: "FL-103",
        flightCode: "UK-930",
        airline: "Vistara",
        price: 3800,
        basePrice: 3300,
        taxPrice: 500,
        departureTime: "06:15 PM",
        arrivalTime: "08:30 PM",
        duration: "2h 15m",
        stops: "Non-stop",
        origin: "Delhi (DEL)",
        dest: "Mumbai (BOM)",
        amenityScore: 9.6,
        planeModel: "Airbus A320neo",
        amenities: {
            wifi: true,
            legroom: true,
            meal: true,
            power: true,
            entertainment: true,
            priority: true
        },
        details: {
            wifiSpeed: "High-Speed (30 Mbps)",
            powerOutlets: "AC & USB-C at Every Seat",
            screenSize: '11" HD Touchscreen',
            seatPitch: '33" (Extra Legroom)',
            seatWidth: '18" Recliner',
            seatLayout: "3-3 Layout"
        }
    },
    {
        id: "FL-104",
        flightCode: "QP-1102",
        airline: "Akasa Air",
        price: 3900,
        basePrice: 3400,
        taxPrice: 500,
        departureTime: "08:30 AM",
        arrivalTime: "10:45 AM",
        duration: "2h 15m",
        stops: "Non-stop",
        origin: "Delhi (DEL)",
        dest: "Mumbai (BOM)",
        amenityScore: 8.2,
        planeModel: "Boeing 737 MAX 8",
        amenities: {
            wifi: false,
            legroom: true,
            meal: true,
            power: true,
            entertainment: false,
            priority: false
        },
        details: {
            wifiSpeed: "Not Available",
            powerOutlets: "USB-A Port at Every Seat",
            screenSize: "Device Holder Only",
            seatPitch: '32" (Standard Legroom)',
            seatWidth: '17.5" Standard',
            seatLayout: "3-3 Layout"
        }
    },
    {
        id: "FL-105",
        flightCode: "SG-243",
        airline: "SpiceJet",
        price: 8800,
        basePrice: 7800,
        taxPrice: 1000,
        departureTime: "06:15 AM",
        arrivalTime: "08:30 AM",
        duration: "2h 15m",
        stops: "Non-stop",
        origin: "Delhi (DEL)",
        dest: "Mumbai (BOM)",
        amenityScore: 6.8,
        planeModel: "Boeing 737-800",
        amenities: {
            wifi: false,
            legroom: false,
            meal: false,
            power: true,
            entertainment: false,
            priority: false
        },
        details: {
            wifiSpeed: "Not Available",
            powerOutlets: "USB-A Port Only",
            screenSize: "No Screens",
            seatPitch: '30" (Compact Legroom)',
            seatWidth: '17" Standard',
            seatLayout: "3-3 Layout"
        }
    }
];

// Auto-suggestions logic functions
function showSuggestions(input, listId) {
    const list = document.getElementById(listId);
    list.classList.remove('hidden');
    renderSuggestionsList(input.value, list, input);
}

function filterSuggestions(input, listId) {
    const list = document.getElementById(listId);
    renderSuggestionsList(input.value, list, input);
}

function hideSuggestions(listId) {
    setTimeout(() => {
        const list = document.getElementById(listId);
        if (list) list.classList.add('hidden');
    }, 250);
}

function renderSuggestionsList(query, listElement, inputElement) {
    listElement.innerHTML = '';
    const matching = destinationsList.filter(item => 
        item.toLowerCase().includes(query.toLowerCase())
    );
    
    if (matching.length === 0) {
        listElement.innerHTML = `<div class="px-4 py-3 text-xs text-outline font-medium">No airport code matches</div>`;
        return;
    }
    
    matching.forEach(item => {
        const div = document.createElement('div');
        div.className = "px-4 py-2.5 text-xs font-semibold text-primary hover:bg-surface-container-low cursor-pointer transition-colors flex items-center gap-2";
        div.innerHTML = `
            <span class="material-symbols-outlined text-outline text-base">location_on</span>
            <span>${item}</span>
        `;
        div.onmousedown = () => {
            inputElement.value = item;
            listElement.classList.add('hidden');
        };
        listElement.appendChild(div);
    });
}
