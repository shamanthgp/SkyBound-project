// Calendar Integrations Logic Module

// Time parser (e.g. "10:45 AM" -> "104500", "10:30 PM" -> "223000")
const parseTimeToUrl = (time) => {
    const parts = time.split(' ');
    const hhmm = parts[0].split(':');
    let hour = parseInt(hhmm[0]);
    const minutes = hhmm[1];
    if (parts[1] === 'PM' && hour !== 12) hour += 12;
    if (parts[1] === 'AM' && hour === 12) hour = 0;
    const hhStr = hour.toString().padStart(2, '0');
    return `${hhStr}${minutes}00`;
};

function generateCalendarIntegrationLinks(booking) {
    const dateStr = booking.depDate ? booking.depDate.replace(/-/g, '') : "20261012";
    
    const startT = parseTimeToUrl(booking.flight.departureTime);
    const endT = parseTimeToUrl(booking.flight.arrivalTime);
    
    const startDateTime = `${dateStr}T${startT}`;
    const endDateTime = `${dateStr}T${endT}`;

    const title = encodeURIComponent(`SkyBound Flight ${booking.flight.flightCode} - ${booking.flight.origin} to ${booking.flight.dest}`);
    const location = encodeURIComponent(`${booking.flight.origin} Terminal`);
    const details = encodeURIComponent(
        `CONFIRMATION CODE: ${booking.confCode}\n` +
        `PASSENGER: ${booking.passengerName}\n` +
        `SEAT: ${booking.seat} (${booking.class})\n` +
        `FLIGHT CLASS: ${booking.class}\n` +
        `AMENITIES INCLUDED: Wi-Fi, Seat Power Outlets, Dining Service\n\n` +
        `Thank you for flying SkyBound! Track your flight inside your Travel Dashboard.`
    );

    const googleCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startDateTime}/${endDateTime}&details=${details}&location=${location}&sf=true&output=xml`;
    const anchor = document.getElementById('google-cal-link');
    if (anchor) {
        anchor.href = googleCalUrl;
    }
}

function downloadICS() {
    // bookings array will be imported from global window context (defined in app.js)
    const activeBookings = window.bookings || [];
    if (activeBookings.length === 0) return;
    const booking = activeBookings[activeBookings.length - 1]; // get latest booking

    const dateStr = booking.depDate ? booking.depDate.replace(/-/g, '') : "20261012";
    const startT = parseTimeToUrl(booking.flight.departureTime);
    const endT = parseTimeToUrl(booking.flight.arrivalTime);

    const icsContent = 
        "BEGIN:VCALENDAR\n" +
        "VERSION:2.0\n" +
        "PRODID:-//SkyBound//Flight Scheduling System//EN\n" +
        "BEGIN:VEVENT\n" +
        `UID:skybound-booking-${booking.confCode}\n` +
        `DTSTAMP:${dateStr}T000000Z\n` +
        `DTSTART:${dateStr}T${startT}\n` +
        `DTEND:${dateStr}T${endT}\n` +
        `SUMMARY:SkyBound Flight ${booking.flight.flightCode} (${booking.flight.origin} to ${booking.flight.dest})\n` +
        `LOCATION:${booking.flight.origin}\n` +
        `DESCRIPTION:Confirmation: ${booking.confCode}\\nPassenger: ${booking.passengerName}\\nSeat: ${booking.seat} (${booking.class})\\nClass: ${booking.class}\n` +
        "END:VEVENT\n" +
        "END:VCALENDAR";

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `SkyBound-Booking-${booking.confCode}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function addDashboardBookingToCalendar(confCode) {
    const activeBookings = window.bookings || [];
    const booking = activeBookings.find(b => b.confCode === confCode);
    if (!booking) return;

    const dateStr = booking.depDate ? booking.depDate.replace(/-/g, '') : "20261012";
    const startT = parseTimeToUrl(booking.flight.departureTime);
    const endT = parseTimeToUrl(booking.flight.arrivalTime);
    
    const startDateTime = `${dateStr}T${startT}`;
    const endDateTime = `${dateStr}T${endT}`;

    const title = encodeURIComponent(`SkyBound Flight ${booking.flight.flightCode} - ${booking.flight.origin} to ${booking.flight.dest}`);
    const location = encodeURIComponent(`${booking.flight.origin} Terminal`);
    const details = encodeURIComponent(
        `CONFIRMATION CODE: ${booking.confCode}\n` +
        `PASSENGER: ${booking.passengerName}\n` +
        `SEAT: ${booking.seat} (${booking.class})\n` +
        `FLIGHT CLASS: ${booking.class}\n\n` +
        `Thank you for flying SkyBound!`
    );

    const googleCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startDateTime}/${endDateTime}&details=${details}&location=${location}&sf=true&output=xml`;
    window.open(googleCalUrl, '_blank');
}

function downloadICSTicket(confCode, name, seat, flightClass, depTime, arrTime, airline, flightCode, origin, dest, depDate) {
    const dateStr = depDate ? depDate.replace(/-/g, '') : "20261012";
    const startT = parseTimeToUrl(depTime);
    const endT = parseTimeToUrl(arrTime);

    const icsContent = 
        "BEGIN:VCALENDAR\n" +
        "VERSION:2.0\n" +
        "PRODID:-//SkyBound//Flight Scheduling System//EN\n" +
        "BEGIN:VEVENT\n" +
        `UID:skybound-booking-${confCode}\n` +
        `DTSTAMP:${dateStr}T000000Z\n` +
        `DTSTART:${dateStr}T${startT}\n` +
        `DTEND:${dateStr}T${endT}\n` +
        `SUMMARY:SkyBound Flight ${flightCode} (${origin} to ${dest})\n` +
        `LOCATION:${origin}\n` +
        `DESCRIPTION:Confirmation: ${confCode}\\nPassenger: ${name}\\nSeat: ${seat} (${flightClass})\\nClass: ${flightClass}\n` +
        "END:VEVENT\n" +
        "END:VCALENDAR";

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `SkyBound-Booking-${confCode}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
