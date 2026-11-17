import sqlite3
try:
    import psycopg2
    import psycopg2.extras
    PSYCOPG2_AVAILABLE = True
except ImportError:
    PSYCOPG2_AVAILABLE = False

from fastapi import FastAPI, HTTPException, status, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator
import uvicorn
import os
import time
import hmac
import json
import base64
import hashlib
import secrets

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

# ---------------------------------------------------------------------------
# Auth helpers (stdlib only): salted PBKDF2 password hashes + signed bearer tokens
# ---------------------------------------------------------------------------
SECRET_KEY = os.environ.get("SECRET_KEY")
if not SECRET_KEY:
    SECRET_KEY = secrets.token_hex(32)
    print("[WARNING] SECRET_KEY is not set: using a random key. Logins will be invalidated on every restart. "
          "Set SECRET_KEY in the environment.")
TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7
OTP_TTL_SECONDS = 10 * 60
OTP_MAX_ATTEMPTS = 5
PBKDF2_ROUNDS = 200_000

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), PBKDF2_ROUNDS).hex()
    return f"pbkdf2${salt}${digest}"

def verify_password(password: str, stored: str) -> bool:
    if stored.startswith("pbkdf2$"):
        _, salt, digest = stored.split("$", 2)
        candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), PBKDF2_ROUNDS).hex()
        return hmac.compare_digest(candidate, digest)
    # Legacy plaintext row (created before hashing was added)
    return hmac.compare_digest(password.encode(), stored.encode())

def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")

def create_token(email: str) -> str:
    payload = _b64(json.dumps({"sub": email, "exp": int(time.time()) + TOKEN_TTL_SECONDS}).encode())
    sig = _b64(hmac.new(SECRET_KEY.encode(), payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{sig}"

def get_current_email(authorization: str = Header(default="")) -> str:
    unauthorized = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Please log in again.")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or "." not in token:
        raise unauthorized
    payload, _, sig = token.partition(".")
    expected = _b64(hmac.new(SECRET_KEY.encode(), payload.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        raise unauthorized
    try:
        data = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        if data["exp"] < time.time():
            raise unauthorized
        return data["sub"]
    except (ValueError, KeyError):
        raise unauthorized

# Loud startup warnings so a misconfigured deploy is obvious in the Render logs
if not IS_POSTGRES and os.environ.get("RENDER"):
    print("[WARNING] DATABASE_URL is not set: using SQLite on Render's ephemeral disk. "
          "Accounts and bookings will be LOST on every restart/redeploy. "
          "Set DATABASE_URL to a Postgres connection string (e.g. Neon) to persist data.")
if not SMTP_USER or not SMTP_PASSWORD:
    print("[WARNING] SMTP_USER/SMTP_PASSWORD not set: signup OTPs will be printed to the logs, not emailed.")

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
        
        # Timeout prevents a blocked SMTP port from hanging the worker thread
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM, to_email, msg.as_string())
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
        # connect_timeout avoids hanging forever on a suspended/unreachable DB
        return psycopg2.connect(DATABASE_URL, connect_timeout=10)
    else:
        # Fallback to local SQLite
        conn = sqlite3.connect(DB_FILE, timeout=20.0)
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

_db_ready = False

def _ensure_db():
    # Lazy retry: if the DB was unreachable at startup, create tables on first use
    global _db_ready
    if not _db_ready:
        init_db()
        _db_ready = True

def execute_query(query: str, params: tuple = ()):
    _ensure_db()
    conn = get_db_conn()
    try:
        cursor = conn.cursor()
        cursor.execute(query, params)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def fetch_one(query: str, params: tuple = ()):
    _ensure_db()
    conn = get_db_conn()
    try:
        if IS_POSTGRES:
            cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        else:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
        cursor.execute(query, params)
        return cursor.fetchone()
    finally:
        conn.close()

def fetch_all(query: str, params: tuple = ()):
    _ensure_db()
    conn = get_db_conn()
    try:
        if IS_POSTGRES:
            cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        else:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
        cursor.execute(query, params)
        return cursor.fetchall()
    finally:
        conn.close()

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
                otp VARCHAR(6) NOT NULL,
                expires_at BIGINT NOT NULL DEFAULT 0,
                attempts INTEGER NOT NULL DEFAULT 0
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
                otp TEXT NOT NULL,
                expires_at INTEGER NOT NULL DEFAULT 0,
                attempts INTEGER NOT NULL DEFAULT 0
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
    
    # Commit the CREATE TABLEs first: on Postgres DDL is transactional, so a failed
    # statement below must never be able to roll the tables back.
    conn.commit()

    # Migrate pending_users tables created before OTP expiry existed
    for col, ddl in (("expires_at", "BIGINT NOT NULL DEFAULT 0"), ("attempts", "INTEGER NOT NULL DEFAULT 0")):
        try:
            if IS_POSTGRES:
                cursor.execute(f"ALTER TABLE pending_users ADD COLUMN IF NOT EXISTS {col} {ddl}")
            else:
                cursor.execute(f"ALTER TABLE pending_users ADD COLUMN {col} {ddl}")
            conn.commit()
        except Exception:
            conn.rollback()  # SQLite: column already exists

    conn.close()

try:
    _ensure_db()
except Exception as e:
    # Don't crash-loop the service if the DB is asleep; retried on first request
    print(f"[DB INIT ERROR] {e}")

# Pydantic Schemas
def _clean_email(v: str) -> str:
    v = v.strip().lower()
    if len(v) > 254 or "@" not in v or v.startswith("@") or v.endswith("@") or " " in v:
        raise ValueError("Please enter a valid email address.")
    return v

class UserRegister(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str
    password: str = Field(min_length=8, max_length=128)

    _norm_email = field_validator("email")(_clean_email)

class UserLogin(BaseModel):
    email: str
    password: str = Field(max_length=128)

    _norm_email = field_validator("email")(_clean_email)

class OtpConfirm(BaseModel):
    email: str
    otp: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")

    _norm_email = field_validator("email")(_clean_email)

class FlightBooking(BaseModel):
    confCode: str = Field(max_length=50)
    passengerName: str = Field(min_length=1, max_length=200)
    email: str = Field(max_length=254)
    passport: str = Field(min_length=1, max_length=50)
    dob: str = Field(max_length=20)
    flightCode: str = Field(max_length=50)
    airline: str = Field(max_length=100)
    price: str = Field(max_length=50)
    departureTime: str = Field(max_length=50)
    arrivalTime: str = Field(max_length=50)
    duration: str = Field(max_length=50)
    stops: str = Field(max_length=50)
    origin: str = Field(max_length=100)
    dest: str = Field(max_length=100)
    userEmail: str = Field(default="", max_length=254)  # ignored: the account comes from the auth token
    depDate: str = Field(max_length=20)
    seat: str = Field(max_length=10)
    flightClass: str = Field(max_length=50)

def _is_duplicate_error(e: Exception) -> bool:
    if isinstance(e, sqlite3.IntegrityError):
        return True
    return PSYCOPG2_AVAILABLE and isinstance(e, psycopg2.IntegrityError)

# API Endpoints
@app.post("/api/signup")
def signup(user: UserRegister):
    existing_user = fetch_one(f"SELECT email FROM users WHERE email = {PARAM}", (user.email,))
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists."
        )

    otp = f"{secrets.randbelow(900000) + 100000}"

    # Replace any earlier pending signup for this email
    execute_query(f"DELETE FROM pending_users WHERE email = {PARAM}", (user.email,))
    execute_query(
        f"INSERT INTO pending_users (email, name, password, otp, expires_at, attempts) VALUES ({PARAM}, {PARAM}, {PARAM}, {PARAM}, {PARAM}, 0)",
        (user.email, user.name.strip(), hash_password(user.password), otp, int(time.time()) + OTP_TTL_SECONDS)
    )

    # Send after storing, so a slow SMTP server never leaves a code that can't be verified
    emailed = send_otp_email(user.email, user.name, otp)
    return {"name": user.name, "email": user.email, "emailed": emailed, "message": "Verification email sent."}

@app.post("/api/confirm")
def confirm(body: OtpConfirm):
    email = body.email
    pending = fetch_one(f"SELECT name, password, otp, expires_at, attempts FROM pending_users WHERE email = {PARAM}", (email,))
    bad = HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired OTP code.")
    if not pending:
        raise bad
    if pending["expires_at"] < time.time() or pending["attempts"] >= OTP_MAX_ATTEMPTS:
        execute_query(f"DELETE FROM pending_users WHERE email = {PARAM}", (email,))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="This code has expired or been tried too many times. Please sign up again.")
    if not hmac.compare_digest(pending["otp"], body.otp):
        execute_query(f"UPDATE pending_users SET attempts = attempts + 1 WHERE email = {PARAM}", (email,))
        raise bad

    try:
        execute_query(
            f"INSERT INTO users (name, email, password) VALUES ({PARAM}, {PARAM}, {PARAM})",
            (pending["name"], email, pending["password"])
        )
    except Exception as e:
        if _is_duplicate_error(e):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail="An account with this email address already exists.")
        print(f"[CONFIRM ERROR] {e}")
        raise HTTPException(status_code=500, detail="Could not create the account. Please try again.")
    execute_query(f"DELETE FROM pending_users WHERE email = {PARAM}", (email,))

    return {"status": "success", "message": "Email confirmed successfully. Account has been allocated."}

@app.post("/api/login")
def login(credentials: UserLogin):
    user = fetch_one(f"SELECT name, email, password FROM users WHERE email = {PARAM}", (credentials.email,))
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email address or password."
        )

    # Upgrade legacy plaintext passwords to a salted hash on successful login
    if not user["password"].startswith("pbkdf2$"):
        execute_query(f"UPDATE users SET password = {PARAM} WHERE email = {PARAM}",
                      (hash_password(credentials.password), user["email"]))

    return {"name": user["name"], "email": user["email"], "token": create_token(user["email"])}

@app.get("/api/bookings")
def get_bookings(email: str = Depends(get_current_email)):
    rows = fetch_all(
        f"SELECT conf_code, passenger_name, email, passport, dob, flight_code, airline, price, departure_time, arrival_time, duration, stops, origin, dest, user_email, dep_date, seat, flight_class FROM bookings WHERE user_email = {PARAM} ORDER BY id",
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
def add_booking(booking: FlightBooking, email: str = Depends(get_current_email)):
    placeholders = ", ".join([PARAM] * 18)
    execute_query(f"""
        INSERT INTO bookings (
            conf_code, passenger_name, email, passport, dob,
            flight_code, airline, price, departure_time, arrival_time,
            duration, stops, origin, dest, user_email, dep_date, seat, flight_class
        ) VALUES ({placeholders})
    """, (
        booking.confCode, booking.passengerName, booking.email, booking.passport, booking.dob,
        booking.flightCode, booking.airline, booking.price, booking.departureTime, booking.arrivalTime,
        booking.duration, booking.stops, booking.origin, booking.dest, email, booking.depDate,
        booking.seat, booking.flightClass
    ))
    return {"status": "success", "confCode": booking.confCode}

@app.delete("/api/bookings")
def clear_bookings(email: str = Depends(get_current_email)):
    execute_query(f"DELETE FROM bookings WHERE user_email = {PARAM}", (email,))
    return {"status": "success", "message": f"Bookings cleared for {email}"}

@app.get("/health")
async def health():
    # Lightweight liveness check: no DB access, runs on the event loop
    return {"status": "ok"}

@app.get("/")
def read_index():
    return FileResponse("static/index.html")

# Serve frontend static assets (app.js, styles.css, etc.)
app.mount("/", StaticFiles(directory="static"), name="static")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
