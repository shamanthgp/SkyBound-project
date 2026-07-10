// Core Coordinator & State Manager Module

const API_BASE = window.location.protocol === "file:" 
    ? "http://127.0.0.1:8000/api" 
    : "/api";

function getLocalYMD(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// Global Application State variables
let searchParams = {
    tripType: "round",
    origin: "New York (JFK)",
    dest: "London (LHR)",
    depDate: "",
    retDate: "",
    classSelected: "Premium"
};

let selectedFlight = null;
let selectedSeats = [];
let selectedDetailClass = "Premium";
window.bookings = []; // attached to window so calendar.js can read it

let currentUser = null;
let authTabMode = 'login';
let bookingPendingRedirect = false;

// Initialization
window.addEventListener("DOMContentLoaded", async () => {
    // Check if session exists in localStorage
    const sessionUser = localStorage.getItem("skybound_current_user");
    if (sessionUser) {
        currentUser = JSON.parse(sessionUser);
        updateHeaderAuthUI();
    }

    // Set up date pickers minimum constraints and defaults
    const depInput = document.getElementById('search-dep-date');
    const retInput = document.getElementById('search-ret-date');
    if (depInput && retInput) {
        const today = getLocalYMD();
        depInput.min = today;
        retInput.min = today;

        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        const nextWeekStr = getLocalYMD(nextWeek);

        depInput.value = today;
        retInput.value = nextWeekStr;

        searchParams.depDate = today;
        searchParams.retDate = nextWeekStr;

        depInput.addEventListener('change', (e) => {
            const depVal = e.target.value;
            retInput.min = depVal;
            if (retInput.value && retInput.value < depVal) {
                retInput.value = depVal;
            }
        });
    }

    // Load bookings from API or local fallback
    await loadBookings();
    
    updateDashboardTripsList();
    renderSeatsMap();
});

// Load Bookings from Database API
async function loadBookings() {
    if (!currentUser) {
        window.bookings = [];
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/bookings?email=${encodeURIComponent(currentUser.email)}`);
        if (!response.ok) throw new Error("Backend response error");
        window.bookings = await response.json();
    } catch (e) {
        console.warn("Backend server not reachable. Falling back to local storage.", e);
        const stored = localStorage.getItem("skybound_bookings");
        if (stored) {
            window.bookings = JSON.parse(stored).filter(b => b.userEmail === currentUser.email);
        } else {
            window.bookings = [];
        }
    }
}

// ============================================== 
// NAVIGATION & SPA ROUTING
// ==============================================
function navigateTo(viewId) {
    document.querySelectorAll('.view-panel').forEach(panel => {
        panel.classList.add('hidden');
    });
    
    const target = document.getElementById(viewId);
    if (target) {
        target.classList.remove('hidden');
    }
    
    document.querySelectorAll('header nav button').forEach(btn => {
        btn.className = "font-semibold text-on-surface-variant hover:text-secondary transition-all duration-200";
    });

    if (viewId === 'search-view') {
        document.getElementById('nav-search').className = "font-semibold text-secondary border-b-2 border-secondary pb-1 transition-all duration-200";
    } else if (viewId === 'dashboard-view') {
        if (!currentUser) {
            alert("Please log in to view your Travel Dashboard.");
            openAuthModal();
            navigateTo('search-view');
            return;
        }
        document.getElementById('nav-dashboard').className = "font-semibold text-secondary border-b-2 border-secondary pb-1 transition-all duration-200";
        updateDashboardTripsList();
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setTripType(type) {
    searchParams.tripType = type;
    
    const roundBtn = document.getElementById('trip-round');
    const onewayBtn = document.getElementById('trip-oneway');
    const returnContainer = document.getElementById('return-date-container');
    const gridInputs = document.getElementById('search-inputs-grid');
    const retInput = document.getElementById('search-ret-date');
    
    if (type === 'round') {
        if (roundBtn) roundBtn.className = "bg-secondary/10 text-secondary px-4 py-1.5 rounded-full text-sm font-semibold transition-all";
        if (onewayBtn) onewayBtn.className = "text-on-surface-variant hover:bg-surface-container-low px-4 py-1.5 rounded-full text-sm font-semibold transition-all";
        if (returnContainer) returnContainer.classList.remove('hidden');
        if (gridInputs) {
            gridInputs.classList.remove('md:grid-cols-5');
            gridInputs.classList.add('md:grid-cols-6');
        }
        if (retInput) retInput.required = true;
    } else {
        if (onewayBtn) onewayBtn.className = "bg-secondary/10 text-secondary px-4 py-1.5 rounded-full text-sm font-semibold transition-all";
        if (roundBtn) roundBtn.className = "text-on-surface-variant hover:bg-surface-container-low px-4 py-1.5 rounded-full text-sm font-semibold transition-all";
        if (returnContainer) returnContainer.classList.add('hidden');
        if (gridInputs) {
            gridInputs.classList.remove('md:grid-cols-6');
            gridInputs.classList.add('md:grid-cols-5');
        }
        if (retInput) retInput.required = false;
    }
}

// ============================================== 
// SEARCH SUBMISSION
// ==============================================
function performSearch() {
    const originVal = document.getElementById('search-origin').value;
    const destVal = document.getElementById('search-dest').value;
    const depVal = document.getElementById('search-dep-date').value;
    const retVal = document.getElementById('search-ret-date').value;
    
    // Strict date range validation
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const depDate = new Date(depVal + "T00:00:00");
    if (depDate < today) {
        alert("Departure date cannot be in the past. Allowed date range starts from the current day and forward.");
        return;
    }
    
    if (searchParams.tripType === 'round') {
        const retDate = new Date(retVal + "T00:00:00");
        if (retDate < depDate) {
            alert("Return date cannot be earlier than departure date.");
            return;
        }
    }
    
    searchParams.origin = originVal;
    searchParams.dest = destVal;
    searchParams.depDate = depVal;
    searchParams.retDate = (searchParams.tripType === 'round') ? retVal : '';
    searchParams.passengers = parseInt(document.getElementById('search-passengers').value) || 1;
    searchParams.classSelected = document.getElementById('search-class').value;

    const headline = document.getElementById('results-headline');
    if (headline) {
        headline.innerText = `Flights from ${searchParams.origin} to ${searchParams.dest}`;
    }
    
    applyFilters();
    navigateTo('results-view');
}

function dealSearch(origin, dest) {
    document.getElementById('search-origin').value = origin;
    document.getElementById('search-dest').value = dest;
    performSearch();
}

// ============================================== 
// FILTERING AND SORTING
// ==============================================
function updatePriceSlider(value) {
    document.getElementById('slider-price-display').innerText = `₹${parseInt(value).toLocaleString('en-IN')}`;
    applyFilters();
}

function resetFilters() {
    document.getElementById('filter-price-slider').value = 10000;
    document.getElementById('slider-price-display').innerText = `₹10,000`;
    document.getElementById('filter-max-amenities').checked = false;
    
    document.querySelectorAll('.amenity-filter-check').forEach(chk => {
        chk.checked = false;
    });
    document.querySelectorAll('.airline-filter-check').forEach(chk => {
        chk.checked = true;
    });

    applyFilters();
}

function applyFilters() {
    const priceMax = parseInt(document.getElementById('filter-price-slider').value);
    const optAmenities = document.getElementById('filter-max-amenities').checked;
    
    const requiredAmenities = [];
    document.querySelectorAll('.amenity-filter-check:checked').forEach(chk => {
        requiredAmenities.push(chk.value);
    });

    const allowedAirlines = [];
    document.querySelectorAll('.airline-filter-check:checked').forEach(chk => {
        allowedAirlines.push(chk.value);
    });

    // mockFlights is defined globally in flights.js
    let filtered = mockFlights.filter(flight => {
        if (flight.price > priceMax) return false;
        if (optAmenities && flight.amenityScore < 8.0) return false;
        if (!allowedAirlines.includes(flight.airline)) return false;

        for (let amenity of requiredAmenities) {
            if (!flight.amenities[amenity]) return false;
        }
        return true;
    });

    const sortBy = document.getElementById('sort-select').value;
    filtered = sortFlightsList(filtered, sortBy);

    const countLabel = document.getElementById('results-count');
    if (countLabel) {
        countLabel.innerText = `${filtered.length} flight${filtered.length === 1 ? '' : 's'} matching your parameters`;
    }

    renderFlightCards(filtered);
}

function sortFlights(val) {
    applyFilters();
}

function sortFlightsList(list, criteria) {
    if (criteria === 'price-low') {
        return list.sort((a, b) => a.price - b.price);
    } else if (criteria === 'amenities-high') {
        return list.sort((a, b) => b.amenityScore - a.amenityScore);
    } else if (criteria === 'duration') {
        const durationVal = (str) => {
            const h = parseInt(str.split('h')[0]) || 0;
            const m = parseInt(str.split('h')[1]?.replace('m', '')) || 0;
            return (h * 60) + m;
        };
        return list.sort((a, b) => durationVal(a.duration) - durationVal(b.duration));
    } else {
        return list.sort((a, b) => (b.amenityScore / b.price) - (a.amenityScore / a.price));
    }
}

function renderFlightCards(flights) {
    const container = document.getElementById('flights-list-container');
    if (!container) return;
    container.innerHTML = '';

    if (flights.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 bg-white rounded-2xl border border-outline-variant/30">
                <span class="material-symbols-outlined text-outline text-5xl mb-3">flight_takeoff</span>
                <p class="font-bold text-lg text-primary">No flights found matching details.</p>
                <p class="text-xs text-on-surface-variant mt-1">Try raising the price limit or checking fewer filters.</p>
            </div>
        `;
        return;
    }

    flights.forEach(flight => {
        const card = document.createElement('div');
        const isBestValue = flight.amenityScore >= 9.0 && flight.price < 7000;
        
        card.className = `bg-surface rounded-xl card-shadow border ${isBestValue ? 'border-2 border-tertiary-container relative' : 'border-outline-variant/20'} card-shadow-hover transition-all duration-300 overflow-hidden`;
        
        let badgeHtml = '';
        if (isBestValue) {
            badgeHtml = `
                <div class="absolute -top-3 left-6 bg-tertiary text-white px-4 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                    <span class="material-symbols-outlined text-xs fill-current">star</span>
                    <span>Best Value Combo</span>
                </div>
            `;
        }

        let scoreColor = 'border-outline-variant text-on-surface';
        if (flight.amenityScore >= 9.0) {
            scoreColor = 'border-tertiary text-tertiary-container font-extrabold';
        } else if (flight.amenityScore >= 7.5) {
            scoreColor = 'border-secondary text-secondary font-bold';
        }

        const amenityIcons = [];
        if (flight.amenities.wifi) amenityIcons.push('<span class="material-symbols-outlined text-sm" title="Wi-Fi">wifi</span>');
        if (flight.amenities.legroom) amenityIcons.push('<span class="material-symbols-outlined text-sm" title="Legroom">airline_seat_recline_extra</span>');
        if (flight.amenities.meal) amenityIcons.push('<span class="material-symbols-outlined text-sm" title="Meal">restaurant</span>');
        if (flight.amenities.power) amenityIcons.push('<span class="material-symbols-outlined text-sm" title="Power">electrical_services</span>');
        if (flight.amenities.entertainment) amenityIcons.push('<span class="material-symbols-outlined text-sm" title="Screen">tv</span>');

        card.innerHTML = `
            ${badgeHtml}
            <div class="p-6 flex flex-col md:flex-row items-center gap-6">
                <div class="flex-grow w-full flex items-center justify-between gap-4">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-surface-container-low rounded-full flex items-center justify-center">
                            <span class="material-symbols-outlined text-secondary">flight_takeoff</span>
                        </div>
                        <div>
                            <p class="text-base font-bold text-primary">${flight.departureTime}</p>
                            <p class="text-xs text-outline font-semibold">${flight.origin.split(' ')[1] || flight.origin}</p>
                        </div>
                    </div>
                    
                    <div class="flex-grow px-4 flex flex-col items-center">
                        <span class="text-[11px] text-on-surface-variant font-medium mb-1">${flight.duration}</span>
                        <div class="w-full h-[1.5px] bg-outline-variant relative flex items-center justify-center">
                            <div class="w-1.5 h-1.5 rounded-full bg-outline-variant absolute left-0"></div>
                            <div class="w-1.5 h-1.5 rounded-full bg-outline-variant absolute right-0"></div>
                            <span class="material-symbols-outlined text-xs text-outline absolute bg-white px-1">fiber_manual_record</span>
                        </div>
                        <span class="text-[11px] ${flight.stops === 'Non-stop' ? 'text-tertiary-container font-semibold' : 'text-outline-variant'} mt-1">${flight.stops}</span>
                    </div>

                    <div class="text-right">
                        <p class="text-base font-bold text-primary">${flight.arrivalTime}</p>
                        <p class="text-xs text-outline font-semibold">${flight.dest.split(' ')[1] || flight.dest}</p>
                    </div>
                </div>

                <div class="hidden md:block w-[1px] h-12 bg-outline-variant/30"></div>

                <div class="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
                    <div class="text-center">
                        <p class="text-[9px] font-bold text-outline-variant uppercase mb-1">Amenities</p>
                        <div class="w-11 h-11 rounded-full border-2 ${scoreColor} flex items-center justify-center text-xs">
                            <span>${flight.amenityScore.toFixed(1)}</span>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="text-2xl font-extrabold text-secondary">₹${flight.price}</p>
                        <p class="text-[10px] text-outline mb-2">incl. fees</p>
                        <button onclick="selectFlight('${flight.id}')" class="bg-secondary hover:bg-secondary-container text-white px-5 py-2 rounded-lg text-xs font-bold transition-all shadow-sm">View & Book</button>
                    </div>
                </div>
            </div>
            
            <div class="px-6 py-2.5 bg-surface-container-low border-t border-outline-variant/15 flex gap-4 text-on-surface-variant flex-wrap items-center">
                <span class="text-[10px] font-bold uppercase text-outline mr-1">Inclusions:</span>
                <div class="flex gap-2">
                    ${amenityIcons.map(icon => `
                        <div class="flex items-center justify-center bg-white px-2 py-0.5 rounded-full border border-outline-variant/30">
                            ${icon}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        container.appendChild(card);
    });
}

// ============================================== 
// FLIGHT DETAILS & SEAT GRID MAP
// ==============================================
function selectFlight(flightId) {
    selectedFlight = mockFlights.find(f => f.id === flightId);
    if (!selectedFlight) return;

    document.getElementById('detail-route').innerText = `${selectedFlight.origin.split(' (')[0]} to ${selectedFlight.dest.split(' (')[0]}`;
    document.getElementById('detail-flight-num').innerText = `Flight ${selectedFlight.flightCode} • ${selectedFlight.planeModel}`;
    document.getElementById('detail-amenity-pill').innerText = `Score: ${selectedFlight.amenityScore}/10`;
    
    document.getElementById('detail-dep-time').innerText = selectedFlight.departureTime;
    document.getElementById('detail-dep-airport').innerText = selectedFlight.origin.match(/\(([^)]+)\)/)[1];
    document.getElementById('detail-dep-city').innerText = selectedFlight.origin.split(' (')[0];
    
    document.getElementById('detail-arr-time').innerText = selectedFlight.arrivalTime;
    document.getElementById('detail-arr-airport').innerText = selectedFlight.dest.match(/\(([^)]+)\)/)[1];
    document.getElementById('detail-arr-city').innerText = selectedFlight.dest.split(' (')[0];
    
    document.getElementById('detail-duration').innerText = `${selectedFlight.duration} (${selectedFlight.stops})`;
    document.getElementById('detail-plane-model').innerText = `${selectedFlight.planeModel} Cabin Experience`;
    
    selectedDetailClass = searchParams.classSelected || "Premium";
    selectedSeats = [];
    document.getElementById('selected-seat-badge').innerText = 'None Selected';
    
    updatePriceDetails();
    renderSeatsMap();
    
    navigateTo('details-view');
}

function setDetailClass(className) {
    selectedDetailClass = className;
    updatePriceDetails();
}

function updatePriceDetails() {
    if (!selectedFlight) return;

    document.querySelectorAll('#side-class-container button').forEach(btn => {
        btn.className = "border border-outline-variant py-2 rounded-lg text-center text-xs font-semibold hover:border-secondary transition-all";
    });
    const activeBtn = document.getElementById(`class-btn-${selectedDetailClass}`);
    if (activeBtn) {
        activeBtn.className = "border-2 border-secondary bg-secondary/5 py-2 rounded-lg text-center text-xs font-bold text-secondary transition-all";
    }

    let multiplier = 1.0;
    let tag = 'Standard';
    if (selectedDetailClass === 'Premium') {
        multiplier = 1.2;
        tag = 'Best Value';
    } else if (selectedDetailClass === 'Business') {
        multiplier = 2.0;
        tag = 'Premium Lux';
    } else {
        tag = 'Budget Pick';
    }

    const passengersCount = searchParams.passengers || 1;

    // Calculate how many of the selected seats are extra legroom rows (rows 10 and 12)
    const extraLegroomCount = selectedSeats.filter(seatId => {
        const rowNum = parseInt(seatId);
        return [10, 12].includes(rowNum);
    }).length;

    const base = Math.round(selectedFlight.basePrice * multiplier) * passengersCount;
    const tax = selectedFlight.taxPrice * passengersCount;
    const upgradeCost = extraLegroomCount * 1500;
    const total = base + tax + upgradeCost;

    document.getElementById('side-total-price').innerText = `₹${total}.00`;
    document.getElementById('side-tag').innerText = tag;

    const baseLabel = document.getElementById('breakdown-base-label');
    if (baseLabel) {
        baseLabel.innerText = `Base Fare (${passengersCount} Traveler${passengersCount > 1 ? 's' : ''})`;
    }

    document.getElementById('breakdown-base').innerText = `₹${base}.00`;
    document.getElementById('breakdown-tax').innerText = `₹${tax}.00`;
    
    const upgradeRow = document.getElementById('seat-upgrade-row');
    const upgradeLabel = document.getElementById('breakdown-upgrade-label');
    if (upgradeLabel) {
        upgradeLabel.innerText = `Extra Legroom Upgrade (${passengersCount} Traveler${passengersCount > 1 ? 's' : ''})`;
    }

    if (upgradeCost > 0) {
        upgradeRow.style.display = 'flex';
        document.getElementById('breakdown-upgrade').innerText = `+₹${upgradeCost}.00`;
    } else {
        upgradeRow.style.display = 'none';
    }
    
    document.getElementById('breakdown-total').innerText = `₹${total}.00`;
}

function renderSeatsMap() {
    const container = document.getElementById('seat-grid-container');
    if (!container) return;
    container.innerHTML = '';

    const rows = [10, 11, 12, 14, 15, 16, 17, 18];
    const seatsInRow = ['A', 'B', 'C', 'D', 'E', 'F'];
    const occupiedSeats = ['10B', '11C', '11D', '14F', '15A', '16E', '17B', '18D'];
    const extraLegroomRows = [10, 12];

    rows.forEach(rowNum => {
        const rowDiv = document.createElement('div');
        rowDiv.className = "flex items-center gap-1.5 text-xs font-bold";

        for (let i = 0; i < 3; i++) {
            const seatId = `${rowNum}${seatsInRow[i]}`;
            const isOccupied = occupiedSeats.includes(seatId);
            const isExtra = extraLegroomRows.includes(rowNum);
            
            rowDiv.appendChild(createSeatButton(seatId, isOccupied, isExtra));
        }

        const label = document.createElement('div');
        label.className = "w-6 text-center text-[10px] text-outline";
        label.innerText = rowNum;
        rowDiv.appendChild(label);

        for (let i = 3; i < 6; i++) {
            const seatId = `${rowNum}${seatsInRow[i]}`;
            const isOccupied = occupiedSeats.includes(seatId);
            const isExtra = extraLegroomRows.includes(rowNum);
            
            rowDiv.appendChild(createSeatButton(seatId, isOccupied, isExtra));
        }

        container.appendChild(rowDiv);
    });
}

function createSeatButton(seatId, isOccupied, isExtra) {
    const btn = document.createElement('button');
    let btnClass = "w-7 h-7 rounded text-[9px] flex items-center justify-center transition-all duration-200 ";
    
    if (isOccupied) {
        btn.disabled = true;
        btnClass += "bg-outline/25 text-transparent cursor-not-allowed";
        btn.innerHTML = "&times;";
    } else if (selectedSeats.includes(seatId)) {
        btnClass += "bg-secondary text-white border border-secondary shadow-sm font-extrabold";
        btn.innerText = seatId;
    } else if (isExtra) {
        btnClass += "bg-tertiary/10 text-tertiary-container hover:bg-tertiary/25 hover:border-tertiary border border-tertiary/40 font-bold";
        btn.innerText = "E";
    } else {
        btnClass += "bg-white hover:bg-surface-container-low hover:border-secondary border border-outline-variant text-on-surface-variant font-medium";
        btn.innerText = seatId.slice(-1);
    }
    
    btn.className = btnClass;
    btn.onclick = () => selectSeat(seatId, isExtra);
    return btn;
}

function selectSeat(seatId, isExtra) {
    if (selectedSeats.includes(seatId)) {
        selectedSeats = selectedSeats.filter(id => id !== seatId);
    } else {
        const limit = searchParams.passengers || 1;
        if (selectedSeats.length >= limit) {
            alert(`You can only select ${limit} seat${limit > 1 ? 's' : ''} for ${limit} traveler${limit > 1 ? 's' : ''}.`);
            return;
        }
        selectedSeats.push(seatId);
    }
    
    const badge = document.getElementById('selected-seat-badge');
    if (badge) {
        badge.innerText = selectedSeats.length > 0 ? selectedSeats.join(', ') : 'None Selected';
    }
    
    renderSeatsMap();
    updatePriceDetails();
}

// ============================================== 
// PASSENGER BOOKING FLOW
// ==============================================
function openBookingForm() {
    const limit = searchParams.passengers || 1;
    if (selectedSeats.length !== limit) {
        alert(`Please select exactly ${limit} seat${limit > 1 ? 's' : ''} for your ${limit} traveler${limit > 1 ? 's' : ''} before proceeding.`);
        return;
    }
    if (!currentUser) {
        alert("Please log in or sign up to finalize your booking.");
        bookingPendingRedirect = true;
        openAuthModal();
        return;
    }

    const contactEmail = document.getElementById('form-email');
    if (contactEmail) {
        contactEmail.value = currentUser.email || '';
    }

    const container = document.getElementById('dynamic-passengers-container');
    if (container) {
        container.innerHTML = '';
        
        for (let i = 1; i <= limit; i++) {
            const section = document.createElement('div');
            section.className = "bg-surface-container-low p-6 rounded-2xl border border-outline-variant/20 space-y-4";
            
            let prefilledFirst = '';
            let prefilledLast = '';
            
            if (i === 1) {
                prefilledFirst = currentUser.name.split(' ')[0] || '';
                prefilledLast = currentUser.name.split(' ').slice(1).join(' ') || '';
            }
            
            section.innerHTML = `
                <h3 class="font-bold text-sm text-primary border-b border-outline-variant/10 pb-2 flex items-center gap-2">
                    <span class="material-symbols-outlined text-secondary text-base">person</span>
                    <span>Passenger ${i} Details ${i === 1 ? '(Primary Account Holder)' : ''}</span>
                </h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-xs font-bold text-on-surface-variant uppercase mb-2">First Name</label>
                        <input type="text" required class="passenger-first-name w-full rounded-xl border-outline-variant text-sm font-semibold text-primary focus:border-secondary focus:ring-2 focus:ring-secondary/10 p-3" value="${prefilledFirst}"/>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-on-surface-variant uppercase mb-2">Last Name</label>
                        <input type="text" required class="passenger-last-name w-full rounded-xl border-outline-variant text-sm font-semibold text-primary focus:border-secondary focus:ring-2 focus:ring-secondary/10 p-3" value="${prefilledLast}"/>
                    </div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                    <div>
                        <label class="block text-xs font-bold text-on-surface-variant uppercase mb-2">Passport Number</label>
                        <input type="text" required class="passenger-passport w-full rounded-xl border-outline-variant text-sm font-semibold text-primary focus:border-secondary focus:ring-2 focus:ring-secondary/10 p-3" placeholder="A12345678" value="${i === 1 ? 'US1293848A' : ''}"/>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-on-surface-variant uppercase mb-2">Date of Birth</label>
                        <input type="date" required class="passenger-dob w-full rounded-xl border-outline-variant text-sm font-semibold text-primary focus:border-secondary focus:ring-2 focus:ring-secondary/10 p-3" value="${i === 1 ? '1992-06-15' : ''}"/>
                    </div>
                </div>
            `;
            container.appendChild(section);
        }
    }

    navigateTo('booking-view');
}

async function submitBooking(event) {
    event.preventDefault();
    
    const email = document.getElementById('form-email').value;
    
    const firstNames = Array.from(document.querySelectorAll('.passenger-first-name')).map(el => el.value.trim());
    const lastNames = Array.from(document.querySelectorAll('.passenger-last-name')).map(el => el.value.trim());
    const passports = Array.from(document.querySelectorAll('.passenger-passport')).map(el => el.value.trim());
    const dobs = Array.from(document.querySelectorAll('.passenger-dob')).map(el => el.value);
    
    const limit = searchParams.passengers || 1;
    const createdBookings = [];
    
    // Calculate cost per passenger ticket
    const multiplier = selectedDetailClass === 'Premium' ? 1.2 : (selectedDetailClass === 'Business' ? 2.0 : 1.0);
    const singleBase = Math.round(selectedFlight.basePrice * multiplier);
    const singleTax = selectedFlight.taxPrice;
    
    for (let i = 0; i < limit; i++) {
        const confCode = "SB-" + Math.floor(100000 + Math.random() * 900000);
        const seatId = selectedSeats[i];
        
        // Rows 10 and 12 are extra legroom rows
        const isExtra = [10, 12].includes(parseInt(seatId));
        const singleUpgrade = isExtra ? 1500 : 0;
        const singleTotal = singleBase + singleTax + singleUpgrade;
        
        const bookingItem = {
            confCode: confCode,
            passengerName: `${firstNames[i]} ${lastNames[i]}`,
            email: email,
            passport: passports[i],
            dob: dobs[i],
            flightCode: selectedFlight.flightCode,
            airline: selectedFlight.airline,
            price: `₹${singleTotal}.00`,
            departureTime: selectedFlight.departureTime,
            arrivalTime: selectedFlight.arrivalTime,
            duration: selectedFlight.duration,
            stops: selectedFlight.stops,
            origin: selectedFlight.origin,
            dest: selectedFlight.dest,
            userEmail: currentUser.email,
            depDate: searchParams.depDate || getLocalYMD(),
            seat: seatId,
            flightClass: selectedDetailClass
        };

        // Save to Database API
        try {
            const response = await fetch(`${API_BASE}/bookings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bookingItem)
            });
            if (!response.ok) throw new Error("Backend save error");
        } catch (e) {
            console.warn("Backend unreachable. Saving booking locally in browser.", e);
            // Local fallback
            const localBooking = {
                ...bookingItem,
                flight: { ...selectedFlight },
                seat: seatId,
                class: selectedDetailClass,
            };
            const stored = localStorage.getItem("skybound_bookings");
            const list = stored ? JSON.parse(stored) : [];
            list.push(localBooking);
            localStorage.setItem("skybound_bookings", JSON.stringify(list));
        }
        
        createdBookings.push(bookingItem);
        addNewNotification(`Ticket Confirmed!`, `Flight ${bookingItem.flightCode} Seat ${bookingItem.seat} booked for ${bookingItem.passengerName}.`);
    }

    // Refresh state
    await loadBookings();

    // Render success tickets dynamically
    renderSuccessTickets(createdBookings);

    navigateTo('success-view');
}

function renderSuccessTickets(tickets) {
    const list = document.getElementById('success-tickets-list');
    if (!list) return;
    list.innerHTML = '';
    
    tickets.forEach((t, index) => {
        const card = document.createElement('div');
        card.className = "bg-surface rounded-3xl card-shadow border border-outline-variant/30 overflow-hidden";
        
        const dateStr = t.depDate ? t.depDate.replace(/-/g, '') : "20261012";
        const startT = parseTimeToUrlLocal(t.departureTime);
        const endT = parseTimeToUrlLocal(t.arrivalTime);
        const startDateTime = `${dateStr}T${startT}`;
        const endDateTime = `${dateStr}T${endT}`;
        
        const title = encodeURIComponent(`SkyBound Flight ${t.flightCode} - ${t.origin} to ${t.dest}`);
        const location = encodeURIComponent(`${t.origin} Terminal`);
        const details = encodeURIComponent(
            `CONFIRMATION CODE: ${t.confCode}\n` +
            `PASSENGER: ${t.passengerName}\n` +
            `SEAT: ${t.seat} (${t.flightClass})\n` +
            `FLIGHT CLASS: ${t.flightClass}\n\n` +
            `Thank you for flying SkyBound!`
        );
        const googleCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startDateTime}/${endDateTime}&details=${details}&location=${location}&sf=true&output=xml`;
        
        card.innerHTML = `
            <div class="px-8 py-4 bg-surface-container-low border-b border-outline-variant/20 flex justify-between items-center">
                <span class="text-xs font-bold text-outline uppercase tracking-wider">Ticket ${index + 1} of ${tickets.length}</span>
                <span class="text-sm font-extrabold text-secondary font-mono">${t.confCode}</span>
            </div>
            
            <div class="p-8 space-y-6">
                <div class="flex justify-between items-start">
                    <div>
                        <span class="text-xs font-bold text-outline uppercase tracking-wider block">Passenger Name</span>
                        <span class="text-base font-bold text-primary">${t.passengerName}</span>
                    </div>
                    <div class="text-right">
                        <span class="text-xs font-bold text-outline uppercase tracking-wider block">Seat & Cabin</span>
                        <span class="text-base font-extrabold text-secondary">${t.seat} (${t.flightClass})</span>
                    </div>
                </div>

                <div class="border-t border-dashed border-outline-variant/60 pt-6 space-y-4">
                    <div class="flex justify-between items-center text-sm font-semibold">
                        <span class="text-outline uppercase text-xs tracking-wider">${t.airline}</span>
                        <span class="text-primary">${t.flightCode}</span>
                    </div>

                    <div class="grid grid-cols-3 items-center">
                        <div>
                            <span class="block text-2xl font-extrabold text-primary">${t.departureTime}</span>
                            <span class="block text-xs font-bold text-on-surface-variant">${t.origin.match(/\(([^)]+)\)/)[1]}</span>
                        </div>
                        <div class="flex flex-col items-center">
                            <span class="text-[10px] text-outline font-medium">${t.duration}</span>
                            <span class="material-symbols-outlined text-outline">arrow_forward</span>
                            <span class="text-[10px] text-tertiary font-bold uppercase mt-0.5">${t.stops}</span>
                        </div>
                        <div class="text-right">
                            <span class="block text-2xl font-extrabold text-primary">${t.arrivalTime}</span>
                            <span class="block text-xs font-bold text-on-surface-variant">${t.dest.match(/\(([^)]+)\)/)[1]}</span>
                        </div>
                    </div>
                </div>

                <div class="border-t border-outline-variant/20 pt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <a href="${googleCalUrl}" target="_blank" class="flex items-center justify-center gap-1.5 bg-surface-container-low hover:bg-surface-container-high text-primary py-2.5 rounded-xl border border-outline-variant/35 text-[10px] font-bold shadow-sm transition-all duration-200">
                        <img class="w-3.5 h-3.5 object-contain" src="https://upload.wikimedia.org/wikipedia/commons/a/a5/Google_Calendar_icon_%282020%29.svg" alt="Google Calendar Logo"/>
                        <span>Calendar</span>
                    </a>
                    
                    <button onclick="downloadICSTicket('${t.confCode}', '${t.passengerName}', '${t.seat}', '${t.flightClass}', '${t.departureTime}', '${t.arrivalTime}', '${t.airline}', '${t.flightCode}', '${t.origin}', '${t.dest}', '${t.depDate}')" class="flex items-center justify-center gap-1.5 bg-surface-container-low hover:bg-surface-container-high text-primary py-2.5 rounded-xl border border-outline-variant/35 text-[10px] font-bold shadow-sm transition-all duration-200">
                        <span class="material-symbols-outlined text-secondary text-base">calendar_today</span>
                        <span>iCal (.ics)</span>
                    </button>

                    <button onclick="shareTicket('${t.confCode}', '${t.passengerName}', '${t.seat}', '${t.flightCode}', '${t.origin}', '${t.dest}', '${t.depDate}')" class="flex items-center justify-center gap-1.5 bg-surface-container-low hover:bg-surface-container-high text-primary py-2.5 rounded-xl border border-outline-variant/35 text-[10px] font-bold shadow-sm transition-all duration-200">
                        <span class="material-symbols-outlined text-secondary text-base">share</span>
                        <span>Share Ticket</span>
                    </button>
                </div>
            </div>
        `;
        list.appendChild(card);
    });
}

function parseTimeToUrlLocal(time) {
    const parts = time.split(' ');
    const hhmm = parts[0].split(':');
    let hour = parseInt(hhmm[0]);
    const minutes = hhmm[1];
    if (parts[1] === 'PM' && hour !== 12) hour += 12;
    if (parts[1] === 'AM' && hour === 12) hour = 0;
    const hhStr = hour.toString().padStart(2, '0');
    return `${hhStr}${minutes}00`;
}

// ============================================== 
// USER AUTHENTICATION SYSTEM LOGIC
// ==============================================
function openAuthModal() {
    document.getElementById('auth-modal').classList.remove('hidden');
    setAuthTab('login');
    
    const rememberMe = localStorage.getItem("skybound_remember_me") === "true";
    const rememberCheck = document.getElementById('auth-remember');
    const emailInput = document.getElementById('auth-email');
    const passInput = document.getElementById('auth-password');
    
    if (rememberMe) {
        if (emailInput) emailInput.value = localStorage.getItem("skybound_remembered_email") || '';
        if (passInput) passInput.value = localStorage.getItem("skybound_remembered_password") || '';
        if (rememberCheck) rememberCheck.checked = true;
    } else {
        if (emailInput) emailInput.value = '';
        if (passInput) passInput.value = '';
        if (rememberCheck) rememberCheck.checked = false;
    }
}

function closeAuthModal() {
    document.getElementById('auth-modal').classList.add('hidden');
    bookingPendingRedirect = false;
}

function setAuthTab(tab) {
    authTabMode = tab;
    const logTab = document.getElementById('tab-login');
    const signTab = document.getElementById('tab-signup');
    const nameContainer = document.getElementById('auth-name-container');
    const submitBtn = document.getElementById('auth-submit-btn');
    const switchText = document.getElementById('auth-switch-text');
    const rememberContainer = document.getElementById('remember-me-container');

    if (tab === 'login') {
        logTab.className = "flex-1 py-3.5 text-center border-b-2 border-secondary text-secondary font-bold";
        signTab.className = "flex-1 py-3.5 text-center text-outline hover:text-primary transition-all font-semibold";
        nameContainer.classList.add('hidden');
        document.getElementById('auth-name').required = false;
        if (rememberContainer) rememberContainer.classList.remove('hidden');
        submitBtn.innerText = "Log In";
        switchText.innerHTML = `Don't have an account? <button type="button" onclick="setAuthTab('signup')" class="text-secondary font-bold hover:underline">Sign Up</button>`;
    } else {
        signTab.className = "flex-1 py-3.5 text-center border-b-2 border-secondary text-secondary font-bold";
        logTab.className = "flex-1 py-3.5 text-center text-outline hover:text-primary transition-all font-semibold";
        nameContainer.classList.remove('hidden');
        document.getElementById('auth-name').required = true;
        if (rememberContainer) rememberContainer.classList.add('hidden');
        submitBtn.innerText = "Sign Up / Register";
        switchText.innerHTML = `Already have an account? <button type="button" onclick="setAuthTab('login')" class="text-secondary font-bold hover:underline">Log In</button>`;
    }
}

let signupPendingEmail = '';

async function handleAuthSubmit(event) {
    event.preventDefault();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;

    try {
        if (authTabMode === 'signup') {
            const name = document.getElementById('auth-name').value;
            const response = await fetch(`${API_BASE}/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password })
            });
            const data = await response.json();
            if (!response.ok) {
                const errDetail = typeof data.detail === 'object' ? JSON.stringify(data.detail) : data.detail;
                throw new Error(errDetail || "Registration failed");
            }
            
            // Show verification simulation modal!
            signupPendingEmail = data.email;
            
            document.getElementById('verification-email-target').innerText = signupPendingEmail;
            
            const otpInput = document.getElementById('verification-otp-input');
            if (otpInput) otpInput.value = '';
            
            document.getElementById('verification-modal').classList.remove('hidden');
            closeAuthModal();
            return;
        } else {
            const response = await fetch(`${API_BASE}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || "Login failed");
            }
            currentUser = await response.json();
        }
        
        // Save active session locally
        localStorage.setItem("skybound_current_user", JSON.stringify(currentUser));
        updateHeaderAuthUI();
        
        // Remember Me checkbox checks
        const rememberCheck = document.getElementById('auth-remember');
        if (rememberCheck && rememberCheck.checked) {
            localStorage.setItem("skybound_remember_me", "true");
            localStorage.setItem("skybound_remembered_email", email);
            localStorage.setItem("skybound_remembered_password", password);
        } else {
            localStorage.removeItem("skybound_remember_me");
            localStorage.removeItem("skybound_remembered_email");
            localStorage.removeItem("skybound_remembered_password");
        }
        
        closeAuthModal();
        
        // Load user bookings
        await loadBookings();
        
        addNewNotification("Welcome to SkyBound", `Logged in successfully as ${currentUser.name}.`);

        if (bookingPendingRedirect) {
            bookingPendingRedirect = false;
            openBookingForm();
        } else {
            navigateTo('dashboard-view');
        }
        
    } catch (e) {
        alert(e.message);
    }
}

async function submitVerifyOTP() {
    const otpInput = document.getElementById('verification-otp-input');
    const otpVal = otpInput ? otpInput.value.trim() : '';
    
    if (otpVal.length !== 6 || isNaN(otpVal)) {
        alert("Please enter a valid 6-digit numeric OTP code.");
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/confirm?email=${encodeURIComponent(signupPendingEmail)}&otp=${encodeURIComponent(otpVal)}`);
        const data = await response.json();
        if (!response.ok) {
            const errDetail = typeof data.detail === 'object' ? JSON.stringify(data.detail) : data.detail;
            throw new Error(errDetail || "OTP verification failed");
        }
        alert("Email verified successfully! Your account has been allocated and you can now log in.");
        document.getElementById('verification-modal').classList.add('hidden');
        
        // Open Auth modal on Login tab with prefilled email
        openAuthModal();
        setAuthTab('login');
        document.getElementById('auth-email').value = signupPendingEmail;
        document.getElementById('auth-password').value = '';
        document.getElementById('auth-password').focus();
    } catch (e) {
        alert(e.message);
    }
}

function handleLogout() {
    currentUser = null;
    localStorage.removeItem("skybound_current_user");
    window.bookings = [];
    
    document.getElementById('avatar-img').classList.add('hidden');
    document.getElementById('avatar-placeholder').classList.remove('hidden');
    document.getElementById('username-display').innerText = "Sign In";
    
    const emailInput = document.getElementById('auth-email');
    const passInput = document.getElementById('auth-password');
    const rememberCheck = document.getElementById('auth-remember');
    
    const rememberMe = localStorage.getItem("skybound_remember_me") === "true";
    if (!rememberMe) {
        if (emailInput) emailInput.value = '';
        if (passInput) passInput.value = '';
        if (rememberCheck) rememberCheck.checked = false;
    }
    
    navigateTo('search-view');
    addNewNotification("Logged Out", "You have successfully signed out.");
}

function toggleProfileMenu() {
    if (!currentUser) {
        openAuthModal();
        return;
    }
    const menu = document.getElementById('profile-menu');
    if (menu) menu.classList.toggle('hidden');
}

// Close profile menu on click outside
document.addEventListener('click', (e) => {
    const menu = document.getElementById('profile-menu');
    const display = document.getElementById('username-display');
    if (menu && display) {
        const widget = display.parentElement;
        if (widget && !menu.contains(e.target) && !widget.contains(e.target)) {
            menu.classList.add('hidden');
        }
    }
});

function updateHeaderAuthUI() {
    if (!currentUser) return;
    const nameLabel = document.getElementById('username-display');
    const placeholder = document.getElementById('avatar-placeholder');
    const avatar = document.getElementById('avatar-img');
    
    if (nameLabel) nameLabel.innerText = currentUser.name.split(' ')[0];
    if (placeholder) placeholder.classList.add('hidden');
    
    if (avatar) {
        avatar.src = "https://lh3.googleusercontent.com/aida-public/AB6AXuBLgdnQ5q0WDfdlL4A5x_EEch8wvpq2KHat06oc3tiHqc2uRttLAbmoHsG74N_KlKZvvglbN4TqYhgqSDOv9n8HRhE4J2mNfiVECQgUpotvsOcYU1ZMQDCwfsdj5Hq-ONVE4uvHvRdZuGfBDS93FuOWrVxVyR9tZuGRssBa_u041kcv_YmZ4ocPF9bqE8SNY7AfxiUtws0RHwdowJ7eMSxDntO35xV95T5Qtpf3vUvhoWMtjbblEWGQRa6uKAA4jI7F_A58EtSZLnCa";
        avatar.classList.remove('hidden');
    }
}

// ============================================== 
// DASHBOARD RENDERINGS
// ==============================================
function updateDashboardTripsList() {
    const container = document.getElementById('dashboard-trips-container');
    const counter = document.getElementById('dashboard-trips-count');
    
    if (!container) return;
    
    if (!currentUser) {
        if (counter) counter.innerText = `0 Booked Trips`;
        container.innerHTML = `<div class="text-center py-16 bg-white rounded-2xl border border-outline-variant/30">Please log in to view booked flights.</div>`;
        return;
    }

    const userTrips = window.bookings || [];
    if (counter) counter.innerText = `${userTrips.length} Booked Trip${userTrips.length === 1 ? '' : 's'}`;
    
    const welcome = document.getElementById('dashboard-welcome');
    if (welcome) welcome.innerText = `Welcome back, ${currentUser.name.split(' ')[0]}`;

    if (userTrips.length === 0) {
        container.innerHTML = `
            <div class="text-center py-16 bg-white rounded-2xl border border-outline-variant/30">
                <span class="material-symbols-outlined text-outline text-5xl mb-3">airplane_ticket</span>
                <p class="font-bold text-lg text-primary">No active bookings yet.</p>
                <p class="text-xs text-on-surface-variant mt-1">Book your flights to see them on your dashboard.</p>
                <button onclick="navigateTo('search-view')" class="mt-4 bg-secondary text-white px-6 py-2.5 rounded-lg text-xs font-bold hover:bg-secondary-container transition-all">Search Flights</button>
            </div>
        `;
        return;
    }

    container.innerHTML = '';
    userTrips.forEach(b => {
        const card = document.createElement('div');
        card.className = "bg-white p-6 rounded-2xl border border-outline-variant/20 card-shadow space-y-4 hover:card-shadow-hover transition-all duration-300";
        
        card.innerHTML = `
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <span class="text-xs font-bold text-outline-variant uppercase tracking-wider block">Flight Code</span>
                    <span class="text-lg font-extrabold text-primary">${b.flight.flightCode} (${b.flight.airline})</span>
                </div>
                <div class="text-left md:text-right">
                    <span class="text-xs font-bold text-outline-variant uppercase tracking-wider block">Confirmation</span>
                    <span class="text-sm font-bold text-secondary font-mono">${b.confCode}</span>
                </div>
            </div>

            <div class="grid grid-cols-3 items-center border-y border-outline-variant/20 py-4">
                <div>
                    <span class="text-xs text-outline block">Departure</span>
                    <span class="text-lg font-extrabold text-primary">${b.flight.departureTime}</span>
                    <span class="text-xs text-on-surface-variant block font-bold">${b.flight.origin.split(' (')[0]} (${b.flight.origin.match(/\(([^)]+)\)/)[1]})</span>
                </div>
                <div class="flex flex-col items-center">
                    <span class="text-[10px] text-outline font-medium">${b.flight.duration}</span>
                    <span class="material-symbols-outlined text-outline">arrow_forward</span>
                    <span class="text-[10px] text-tertiary font-bold uppercase mt-0.5">${b.flight.stops}</span>
                </div>
                <div class="text-right">
                    <span class="text-xs text-outline block">Arrival</span>
                    <span class="text-lg font-extrabold text-primary">${b.flight.arrivalTime}</span>
                    <span class="text-xs text-on-surface-variant block font-bold">${b.flight.dest.split(' (')[0]} (${b.flight.dest.match(/\(([^)]+)\)/)[1]})</span>
                </div>
            </div>

            <div class="flex flex-wrap justify-between items-center gap-3 pt-2">
                <div class="flex gap-4 text-xs font-medium">
                    <div>
                        <span class="text-outline">Seat:</span>
                        <span class="text-primary font-bold ml-1">${b.seat}</span>
                    </div>
                    <div>
                        <span class="text-outline">Class:</span>
                        <span class="text-primary font-bold ml-1">${b.class}</span>
                    </div>
                    <div>
                        <span class="text-outline">Cost:</span>
                        <span class="text-primary font-bold ml-1">${b.price}</span>
                    </div>
                </div>

                <div class="flex gap-2">
                    <button onclick="shareTicket('${b.confCode}', '${b.passengerName}', '${b.seat}', '${b.flight.flightCode}', '${b.flight.origin}', '${b.flight.dest}', '${b.depDate}')" class="flex items-center gap-1.5 text-primary hover:text-secondary text-xs font-bold bg-surface-container-low border border-outline-variant/35 px-3 py-1.5 rounded-lg transition-all">
                        <span class="material-symbols-outlined text-sm">share</span>
                        <span>Share</span>
                    </button>
                    <button onclick="addDashboardBookingToCalendar('${b.confCode}')" class="flex items-center gap-1.5 text-secondary hover:text-secondary-container text-xs font-bold bg-secondary/5 border border-secondary/20 px-3 py-1.5 rounded-lg transition-all">
                        <img class="w-4 h-4 object-contain" src="https://upload.wikimedia.org/wikipedia/commons/a/a5/Google_Calendar_icon_%282020%29.svg" alt="Google Calendar"/>
                        <span>Add to Calendar</span>
                    </button>
                </div>
            </div>
        `;

        container.appendChild(card);
    });
}

async function resetDashboardTrips() {
    if (!currentUser) return;
    if (confirm("Are you sure you want to clear your flight bookings?")) {
        try {
            const response = await fetch(`${API_BASE}/bookings?email=${encodeURIComponent(currentUser.email)}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error("Delete error");
        } catch (e) {
            console.warn("Backend server unreachable. Deleting local storage bookings.", e);
            // Local fallback
            const stored = localStorage.getItem("skybound_bookings");
            if (stored) {
                const list = JSON.parse(stored).filter(b => b.userEmail !== currentUser.email);
                localStorage.setItem("skybound_bookings", JSON.stringify(list));
            }
        }
        
        await loadBookings();
        updateDashboardTripsList();
        addNewNotification("Bookings Reset", "Your flight bookings have been cleared.");
    }
}

// ============================================== 
// INTERACTIVE NOTIFICATION LIST AND BELL
// ==============================================
function toggleNotificationMenu() {
    const menu = document.getElementById('notification-menu');
    if (menu) menu.classList.toggle('hidden');
}

document.addEventListener('click', (e) => {
    const menu = document.getElementById('notification-menu');
    const bell = document.getElementById('notification-bell');
    if (menu && bell && !menu.contains(e.target) && !bell.contains(e.target)) {
        menu.classList.add('hidden');
    }
});

function addNewNotification(title, message) {
    const list = document.getElementById('notification-list');
    const dot = document.getElementById('notification-dot');
    if (dot) dot.classList.remove('hidden');

    if (!list) return;
    const item = document.createElement('div');
    item.className = "px-4 py-3 hover:bg-surface-container-low border-b border-outline-variant/10 flex gap-3 items-start cursor-pointer";
    item.innerHTML = `
        <span class="material-symbols-outlined text-secondary mt-0.5">info</span>
        <div>
            <p class="text-sm font-semibold text-on-surface">${title}</p>
            <p class="text-xs text-on-surface-variant">${message}</p>
            <span class="text-[10px] text-outline">Just now</span>
        </div>
    `;

    list.insertBefore(item, list.firstChild);
}

function clearNotifications() {
    const list = document.getElementById('notification-list');
    if (list) {
        list.innerHTML = `
            <div class="text-center py-6 text-xs text-outline font-semibold">
                No new notifications.
            </div>
        `;
    }
    const dot = document.getElementById('notification-dot');
    if (dot) dot.classList.add('hidden');
}

function subscribeAlert() {
    alert("Success! You've subscribed to price drop alerts on your selected route.");
    addNewNotification("Subscribed!", "Price drop alert tracking is now active for Delhi to Mumbai.");
}

// ============================================== 
// SHARING SYSTEMS LOGIC
// ==============================================
let currentShareText = '';

function shareTicket(confCode, name, seat, flightCode, origin, dest, depDate) {
    const text = `SkyBound Ticket Confirmation!\n` +
                 `Passenger: ${name}\n` +
                 `Flight: ${flightCode} (${origin.split(' (')[0]} to ${dest.split(' (')[0]})\n` +
                 `Date: ${depDate}\n` +
                 `Seat: ${seat}\n` +
                 `Confirmation Code: ${confCode}`;

    const shareUrl = window.location.href;
    currentShareText = text + `\nApp Link: ` + shareUrl;
    
    document.getElementById('share-fallback-modal').classList.remove('hidden');
}

function closeShareFallbackModal() {
    document.getElementById('share-fallback-modal').classList.add('hidden');
}

function copyShareText() {
    navigator.clipboard.writeText(currentShareText).then(() => {
        alert("Ticket details copied to clipboard!");
        closeShareFallbackModal();
    }).catch(err => {
        console.error("Could not copy details:", err);
    });
}
