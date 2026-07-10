import sqlite3
try:
    import psycopg2
    import psycopg2.extras
    PSYCOPG2_AVAILABLE = True
except ImportError:
    PSYCOPG2_AVAILABLE = False

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn
import os
import uuid

app = FastAPI(title="SkyBound Backend", version="1.0.0")

# Enable CORS for local files (file://) and local server hosts
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# NOTE ON PRODUCTION DATABASE SETUP:
# In Production (Render/Railway): Create a free PostgreSQL database (e.g. on Neon.tech).
# Copy its connection string (e.g., postgresql://user:pass@host/db) and set it as the
# DATABASE_URL environment variable in your Render dashboard settings. Your app will
# automatically switch to PostgreSQL and persist all user accounts and bookings permanently!
DB_FILE = "skybound.db"
DATABASE_URL = os.environ.get("DATABASE_URL")
IS_POSTGRES = DATABASE_URL is not None
PARAM = "%s" if IS_POSTGRES else "?"

# SMTP Email Configuration
SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", 587))
SMTP_USER = os.environ.get("SMTP_USER")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD")
SMTP_FROM = os.environ.get("SMTP_FROM", SMTP_USER)

def send_otp_email(to_email: str, name: str, otp: str):
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    if not SMTP_USER or not SMTP_PASSWORD:
        # Fallback print warning to terminal logs if credentials are unconfigured
        print(f"\n========================================\n[SMTP UNCONFIGURED] Skip sending email to: {to_email}\nOTP Code is: {otp}\n========================================\n")
        return False
        
    try:
        msg = MIMEMultipart()
        msg['From'] = SMTP_FROM
        msg['To'] = to_email
        msg['Subject'] = "Verify Your SkyBound Account - OTP"
        
        body = f"""Hello {name},

Thank you for registering with SkyBound!

Your 6-digit email verification OTP code is:

{otp}

Please enter this code in the verification modal to authenticate your account.

Safe travels,
The SkyBound Team
"""
        msg.attach(MIMEText(body, 'plain'))
        
        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT)
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(SMTP_FROM, to_email, msg.as_string())
        server.quit()
        print(f"[SMTP] Verification email sent to {to_email} successfully.")
        return True
    except Exception as e:
        print(f"[SMTP ERROR] Failed to send email to {to_email}: {e}")
        return False

# Database connection helper
def get_db_conn():
    if IS_POSTGRES:
        if not PSYCOPG2_AVAILABLE:
            raise RuntimeError("DATABASE_URL environment variable is set for PostgreSQL, but 'psycopg2' is not installed or available.")
        # Connect to cloud PostgreSQL
        return psycopg2.connect(DATABASE_URL)
    else:
        # Fallback to local SQLite
        conn = sqlite3.connect(DB_FILE, timeout=20.0)
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

def execute_query(query: str, params: tuple = ()):
    conn = get_db_conn()
    cursor = conn.cursor()
    cursor.execute(query, params)
    conn.commit()
    conn.close()

def fetch_one(query: str, params: tuple = ()):
    conn = get_db_conn()
    if IS_POSTGRES:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    else:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
    cursor.execute(query, params)
    row = cursor.fetchone()
    conn.close()
    return row

def fetch_all(query: str, params: tuple = ()):
    conn = get_db_conn()
    if IS_POSTGRES:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    else:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    return rows

# Database initialization
def init_db():
    conn = get_db_conn()
    cursor = conn.cursor()
    
    if IS_POSTGRES:
        # PostgreSQL schema
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS pending_users (
                email VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                password VARCHAR(255) NOT NULL,
                otp VARCHAR(6) NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS bookings (
                id SERIAL PRIMARY KEY,
                conf_code VARCHAR(255) NOT NULL,
                passenger_name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                passport VARCHAR(255) NOT NULL,
                dob VARCHAR(255) NOT NULL,
                flight_code VARCHAR(255) NOT NULL,
                airline VARCHAR(255) NOT NULL,
                price VARCHAR(255) NOT NULL,
                departure_time VARCHAR(255) NOT NULL,
                arrival_time VARCHAR(255) NOT NULL,
                duration VARCHAR(255) NOT NULL,
                stops VARCHAR(255) NOT NULL,
                origin VARCHAR(255) NOT NULL,
                dest VARCHAR(255) NOT NULL,
                user_email VARCHAR(255) NOT NULL,
                dep_date VARCHAR(255) NOT NULL,
                seat VARCHAR(255) NOT NULL,
                flight_class VARCHAR(255) NOT NULL
            )
        """)
    else:
        # SQLite schema
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS pending_users (
                email TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                password TEXT NOT NULL,
                otp TEXT NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS bookings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conf_code TEXT NOT NULL,
                passenger_name TEXT NOT NULL,
                email TEXT NOT NULL,
                passport TEXT NOT NULL,
                dob TEXT NOT NULL,
                flight_code TEXT NOT NULL,
                airline TEXT NOT NULL,
                price TEXT NOT NULL,
                departure_time TEXT NOT NULL,
                arrival_time TEXT NOT NULL,
                duration TEXT NOT NULL,
                stops TEXT NOT NULL,
                origin TEXT NOT NULL,
                dest TEXT NOT NULL,
                user_email TEXT NOT NULL,
                dep_date TEXT NOT NULL,
                seat TEXT NOT NULL,
                flight_class TEXT NOT NULL
            )
        """)
    
    conn.commit()
    conn.close()

init_db()

# Pydantic Schemas
class UserRegister(BaseModel):
    name: str
    email: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class FlightBooking(BaseModel):
    confCode: str
    passengerName: str
    email: str
    passport: str
    dob: str
    flightCode: str
    airline: str
    price: str
    departureTime: str
    arrivalTime: str
    duration: str
    stops: str
    origin: str
    dest: str
    userEmail: str
    depDate: str
    seat: str
    flightClass: str

# API Endpoints
@app.post("/api/signup")
def signup(user: UserRegister):
    existing_user = fetch_one(f"SELECT email FROM users WHERE email = {PARAM}", (user.email,))
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists."
        )
        
    import random
    otp = f"{random.randint(100000, 999999)}"
    
    # Send verification email containing OTP code
    send_otp_email(user.email, user.name, otp)

    # Delete any duplicate pending signup for this email first
    execute_query(f"DELETE FROM pending_users WHERE email = {PARAM}", (user.email,))
    execute_query(
        f"INSERT INTO pending_users (email, name, password, otp) VALUES ({PARAM}, {PARAM}, {PARAM}, {PARAM})",
        (user.email, user.name, user.password, otp)
    )
    return {"name": user.name, "email": user.email, "message": "Verification email sent."}

@app.get("/api/confirm")
def confirm(email: str, otp: str):
    pending = fetch_one(f"SELECT name, password, otp FROM pending_users WHERE email = {PARAM}", (email,))
    if not pending or pending["otp"] != otp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP code."
        )
        
    try:
        execute_query(
            f"INSERT INTO users (name, email, password) VALUES ({PARAM}, {PARAM}, {PARAM})",
            (pending["name"], email, pending["password"])
        )
        execute_query(f"DELETE FROM pending_users WHERE email = {PARAM}", (email,))
    except Exception as e:
        if "integrity" in str(e).lower() or "unique" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An account with this email address already exists."
            )
        raise HTTPException(status_code=500, detail=str(e))
        
    return {"status": "success", "message": "Email confirmed successfully. Account has been allocated."}

@app.post("/api/login")
def login(credentials: UserLogin):
    user = fetch_one(f"SELECT name, email, password FROM users WHERE email = {PARAM}", (credentials.email,))
    if not user or user["password"] != credentials.password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email address or password."
        )
        
    return {"name": user["name"], "email": user["email"]}

@app.get("/api/bookings")
def get_bookings(email: str):
    rows = fetch_all(
        f"SELECT conf_code, passenger_name, email, passport, dob, flight_code, airline, price, departure_time, arrival_time, duration, stops, origin, dest, user_email, dep_date, seat, flight_class FROM bookings WHERE user_email = {PARAM}",
        (email,)
    )
    
    results = []
    for r in rows:
        results.append({
            "confCode": r["conf_code"],
            "passengerName": r["passenger_name"],
            "email": r["email"],
            "passport": r["passport"],
            "dob": r["dob"],
            "flight": {
                "flightCode": r["flight_code"],
                "airline": r["airline"],
                "departureTime": r["departure_time"],
                "arrivalTime": r["arrival_time"],
                "duration": r["duration"],
                "stops": r["stops"],
                "origin": r["origin"],
                "dest": r["dest"],
            },
            "seat": r["seat"],
            "class": r["flight_class"],
            "price": r["price"],
            "userEmail": r["user_email"],
            "depDate": r["dep_date"]
        })
    return results

@app.post("/api/bookings")
def add_booking(booking: FlightBooking):
    execute_query(f"""
        INSERT INTO bookings (
            conf_code, passenger_name, email, passport, dob, 
            flight_code, airline, price, departure_time, arrival_time, 
            duration, stops, origin, dest, user_email, dep_date, seat, flight_class
        ) VALUES ({PARAM}, {PARAM}, {PARAM}, {PARAM}, {PARAM}, {PARAM}, {PARAM}, {PARAM}, {PARAM}, {PARAM}, {PARAM}, {PARAM}, {PARAM}, {PARAM}, {PARAM}, {PARAM}, {PARAM}, {PARAM})
    """, (
        booking.confCode, booking.passengerName, booking.email, booking.passport, booking.dob,
        booking.flightCode, booking.airline, booking.price, booking.departureTime, booking.arrivalTime,
        booking.duration, booking.stops, booking.origin, booking.dest, booking.userEmail, booking.depDate,
        booking.seat, booking.flightClass
    ))
    return {"status": "success", "confCode": booking.confCode}

@app.delete("/api/bookings")
def clear_bookings(email: str):
    execute_query(f"DELETE FROM bookings WHERE user_email = {PARAM}", (email,))
    return {"status": "success", "message": f"Bookings cleared for {email}"}

@app.get("/")
def read_index():
    return FileResponse("static/index.html")

# Serve frontend static assets (app.js, styles.css, etc.)
app.mount("/", StaticFiles(directory="static"), name="static")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
