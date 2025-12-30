from flask import Flask, request, jsonify  # Import Flask to create backend app, handle HTTP requests, and return JSON responses
from flask_cors import CORS  # Enable Cross-Origin Resource Sharing so React frontend can communicate with Flask backend
import cv2  # OpenCV library for image processing (used with face recognition)
import numpy as np  # NumPy library for array manipulation (used for images and face encodings)
import base64  # Base64 encoding/decoding to send image data as strings
import face_recognition  # Library for detecting and recognizing faces
from pymongo import MongoClient  # MongoDB client for connecting and interacting with MongoDB database
import pickle  # Python module to serialize/deserialize Python objects (used for storing face encodings)
import datetime  # Python module to work with dates and times
import requests  # Library to make HTTP requests (used for Salesforce JWT auth)
from simple_salesforce import Salesforce  # Library to connect and interact with Salesforce REST API
import jwt  # Library for creating JSON Web Tokens (used for Salesforce authentication)
import time  # Time utilities for delays, timestamps, and token expiration
import pytz  # Timezone handling library (used to convert timestamps to Beirut time)
import threading  # Python threading module to run background sync tasks
from bson.objectid import ObjectId
import traceback # Ensure this is imported
import json # Added for logging
from bson import ObjectId
import socket  # <--- THIS WAS MISSING
# ======================================
# 🔹 Flask App Setup
# ======================================
app = Flask(__name__)  # Initialize Flask app object; this is the main backend server
CORS(app)  # Enable Cross-Origin Resource Sharing so frontend React app can call backend APIs

# ======================================
# 🔹 MongoDB Setup
# ======================================
client = MongoClient("mongodb://localhost:27017")  # Connect to local MongoDB server
db = client["attendance_system"]  # Select the "attendance_system" database
employees_col = db["employees"]  # Collection to store employee info (names, face encodings, Salesforce IDs)
logs_col = db["attendance_logs"]  # Collection to store daily attendance logs

# ======================================
# 🔹 Load Known Faces from MongoDB
# ======================================
known_face_encodings = []  # List to store face encodings for all employees
known_face_names = []  # List to store names corresponding to each face encoding
known_face_owner_ids = []  # List to store Salesforce OwnerIds corresponding to each employee

for emp in employees_col.find({}):  # Iterate over every employee document in MongoDB
    encoding = pickle.loads(emp["face_encoding"])  # Deserialize face encoding bytes back into numpy array
    known_face_encodings.append(encoding)  # Add this encoding to the known faces list
    known_face_names.append(emp["name"])  # Add the employee's name to the known names list
    known_face_owner_ids.append(emp.get("OwnerId"))  # Add Salesforce OwnerId to the list (or None if not present)

print(f"✅ Loaded {len(known_face_encodings)} known faces from MongoDB.")  # Log total number of loaded faces

# ======================================
# 🔹 Salesforce JWT Authentication Setup
# ======================================
SF_CLIENT_ID = "secret for company privacy"  # Salesforce connected app client ID
SF_LOGIN_URL = "https://login.salesforce.com"  # Salesforce login URL for JWT auth
SF_USERNAME = "salesforce@samir"  # Salesforce user to authenticate as
PRIVATE_KEY_FILE = "server.key"  # Path to private key used to sign JWT for Salesforce

sf_access_token = None  # Placeholder variable to store Salesforce access token after authentication
sf_instance_url = None  # Placeholder variable to store Salesforce instance URL

BEIRUT_TZ = pytz.timezone("Asia/Beirut")  # Set timezone to Beirut for all timestamps

# Lock and flag for background sync thread to prevent multiple threads from running at the same time
sync_lock = threading.Lock()  # Thread lock to synchronize background operations
sync_thread_started = False  # Boolean flag to track whether background sync thread has been started

# ======================================
# 🔹 Salesforce Authentication Function
# ======================================
def authenticate_with_jwt():
    """
    Authenticate with Salesforce using JWT and store access token & instance URL.
    """
    global sf_access_token, sf_instance_url  # Use global variables to store token and instance URL

    with open(PRIVATE_KEY_FILE, "r") as f:  # Open private key file for reading
        private_key = f.read()  # Read private key as a string

    # Create JWT payload with issuer, subject, audience, and expiration
    payload = {
        "iss": SF_CLIENT_ID,  # Issuer: Salesforce client ID
        "sub": SF_USERNAME,  # Subject: Salesforce username
        "aud": SF_LOGIN_URL,  # Audience: Salesforce login URL
        "exp": int(time.time()) + 300  # Expiration: 5 minutes from now
    }

    # Encode JWT using RS256 algorithm with private key
    encoded_jwt = jwt.encode(payload, private_key, algorithm="RS256")

    # Send JWT to Salesforce OAuth2 endpoint to obtain access token
    response = requests.post(
        f"{SF_LOGIN_URL}/services/oauth2/token",
        data={
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",  # JWT bearer grant type
            "assertion": encoded_jwt  # JWT assertion
        }
    ).json()  # Convert response to JSON

    if "access_token" not in response:  # Check if authentication failed
        raise Exception(f"❌ JWT Authentication failed: {response}")  # Raise error if no token received

    sf_access_token = response["access_token"]  # Store access token in global variable
    sf_instance_url = response["instance_url"]  # Store Salesforce instance URL
    print("✅ Salesforce JWT authentication successful!")  # Log success message
# ======================================
# 🔹 Get Salesforce Connection Helper
# ======================================
def get_sf_connection():
    """
    Returns Salesforce connection object. Authenticates first if token is missing.
    """
    global sf_access_token
    if not sf_access_token:  # If no access token exists, authenticate first
        authenticate_with_jwt()

    return Salesforce(instance_url=sf_instance_url, session_id=sf_access_token)  # Return Salesforce API object

# ======================================
# 🔹 Check Salesforce Online Status
# ======================================
def is_salesforce_online():
    """
    Returns True if Salesforce is reachable, otherwise False.
    """
    try:
        sf = get_sf_connection()  # Get Salesforce connection
        sf.query("SELECT Id FROM Daily_Report__c LIMIT 1")  # Run simple query to test connectivity
        return True  # Connection successful
    except:
        return False  # Any exception means Salesforce is unreachable

@app.route('/<action>', methods=['POST', 'OPTIONS'])
def handle_action(action):
    # 1. Handle Preflight Options (CORS)
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    # 2. Security check
    valid_actions = ["checkin", "checkout", "breakin", "breakout", "auto", "switch_remote"]
    
    if action in valid_actions:
        return process_face(action)
    
    # 3. Live feed or invalid
    if action == "live_feed":
        return process_live_feed() # Ensure this function exists elsewhere

    return jsonify({"status": "error", "message": "Invalid Endpoint"}), 404

COOLDOWN_AFTER_CHECKIN_SECONDS = 600   # 10 minutes before allowing auto checkout
MIN_DEBOUNCE_SECONDS = 8               # short anti-bounce while face stays in frame

recent_action_cache = {}               # { owner_id: {"ts": datetime_utc} }
recent_cache_lock = threading.Lock() 
# ======================================
# 🔹 FULL REWRITTEN PROCESS_FACE (FINAL)
# ======================================
def process_face(action):
    global sync_thread_started
    global recent_cache_lock

    print("\n" + "="*40)
    print(f"🚀 TERMINAL START | Action: {action}")
    print("="*40)

    try:
        # 1. Parse Image
        data = request.get_json()
        if not data or "image" not in data:
            return jsonify({"status": "error", "message": "No image data provided"}), 400

        image_data = data["image"].split(",")[1]
        image_bytes = base64.b64decode(image_data)
        np_arr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # 2. Recognition Logic
        face_locations = face_recognition.face_locations(rgb_frame, model="hog")
        if not face_locations:
            return jsonify({"status": "error", "message": "No face detected"}), 400

        encodings = face_recognition.face_encodings(rgb_frame, face_locations)
        if not encodings:
            return jsonify({"status": "error", "message": "Encoding failed"}), 400
        
        face_encoding = encodings[0]
        name, owner_id, threshold = "Unknown", None, 0.45

        for i, known in enumerate(known_face_encodings):
            dist = np.linalg.norm(face_encoding - known)
            if dist < threshold:
                name = known_face_names[i]
                owner_id = known_face_owner_ids[i]
                threshold = dist

        if name == "Unknown":
            return jsonify({"status": "error", "message": "Face not recognized"}), 401

        # 3. Time Setup (Standardized Beirut Time)
        timestamp_beirut = datetime.datetime.now(BEIRUT_TZ)
        today_str = timestamp_beirut.strftime("%Y-%m-%d")

        # 4. Logic Restrictions & Auto-Mode
        final_action = action
        daily = logs_col.find_one({"employee_name": name, "date": today_str})

        if action == "auto":
            if not daily or not daily.get("check_in"):
                final_action = "checkin"
            elif not daily.get("check_out"):
                last_in = daily["check_in"]
                if last_in.tzinfo is None:
                    last_in = pytz.utc.localize(last_in).astimezone(BEIRUT_TZ)
                
                elapsed = (timestamp_beirut - last_in).total_seconds()
                
                if elapsed < COOLDOWN_AFTER_CHECKIN_SECONDS:
                    remaining = int(COOLDOWN_AFTER_CHECKIN_SECONDS - elapsed)
                    return jsonify({
                        "status": "cooldown_wait", 
                        "name": name, 
                        "message": f"Locked: Try again in {remaining}s."
                    })
                final_action = "checkout"
            else:
                 return jsonify({"status": "already_done", "name": name, "message": "Attendance complete today."})

        # --- RESTRICTION GUARDS ---
        
        # Check In Guard
        if final_action == "checkin" and daily and daily.get("check_in"):
            return jsonify({"status": "already_done", "name": name, "message": "Already checked in."})
        
        # Check Out / Remote Guard (NEW: Added check for previous check-in)
        if final_action in ["checkout", "switch_remote"]:
            if not daily or not daily.get("check_in"):
                return jsonify({"status": "error", "message": "Must Check In first!"})
            if daily.get("check_out"):
                return jsonify({"status": "already_done", "name": name, "message": "Already checked out."})
        
        # Break In Guards
        if final_action == "breakin":
            if not daily or not daily.get("check_in"):
                 return jsonify({"status": "error", "message": "Must Check In first!"})
            if daily.get("break_in"):
                 return jsonify({"status": "already_done", "name": name, "message": "Already started your break today."})

        # Break Out Guards
        if final_action == "breakout":
            if not daily or not daily.get("check_in"):
                 return jsonify({"status": "error", "message": "Must Check In first!"})
            if not daily.get("break_in"):
                 return jsonify({"status": "error", "message": "You haven't started a break yet!"})
            if daily.get("break_out"):
                 return jsonify({"status": "already_done", "name": name, "message": "Already ended your break today."})

        # 5. Local Database Persistence
        if not daily:
            daily_data = {
                "employee_name": name, "OwnerId": owner_id, "date": today_str,
                "check_in": None, "break_in": None, "break_out": None, "check_out": None,
                "check_in_source": None, "sync_status": "pending"
            }
            logs_col.insert_one(daily_data)
            daily = logs_col.find_one({"employee_name": name, "date": today_str})

        updates = {}
        scheduled_checkout_dt = None

        if final_action == "checkin":
            updates["check_in"] = timestamp_beirut
            updates["check_in_source"] = "office"
        elif final_action == "breakin":
            updates["break_in"] = timestamp_beirut
        elif final_action == "breakout":
            updates["break_out"] = timestamp_beirut
        elif final_action == "checkout":
            updates["check_out"] = timestamp_beirut
            updates["check_in_source"] = "office"
        elif final_action == "switch_remote":
            # Remote Handoff Logic
            emp = employees_col.find_one({"name": name}) or {}
            sched = emp.get("schedule", {}).get("weekly", {}).get(timestamp_beirut.strftime("%A"), {"end": "17:00"})
            try:
                h, m = map(int, sched.get("end", "17:00").split(":"))
                scheduled_checkout_dt = timestamp_beirut.replace(hour=h, minute=m, second=0, microsecond=0)
                updates["check_out"] = max(scheduled_checkout_dt, timestamp_beirut)
            except:
                updates["check_out"] = timestamp_beirut.replace(hour=17, minute=0)
            updates["check_in_source"] = "continue_working_from_home"

        # --- FIX: Auto-fill Break Out if missing during Checkout ---
        if final_action in ["checkout", "switch_remote"]:
            # If user has a break_in recorded BUT no break_out yet
            if daily and daily.get("break_in") and not daily.get("break_out"):
                updates["break_out"] = updates.get("check_out")
        
        updates["sync_status"] = "pending"
        logs_col.update_one({"_id": daily["_id"]}, {"$set": updates})

        # 6. Network Handling & Salesforce Sync
        def is_online():
            try:
                socket.create_connection(("8.8.8.8", 53), timeout=2)
                return True
            except: return False

        active_online = is_online()
        sync_status = "offline"
        user_message = f"Local: {final_action.replace('_', ' ').capitalize()} recorded offline."

        if active_online:
            try:
                sf = get_sf_connection()
                query = f"SELECT Id, Check_In__c, Check_Out__c FROM Daily_Report__c WHERE OwnerId = '{owner_id}' AND Date__c = {today_str} LIMIT 1"
                results = sf.query(query)

                def fmt_time(ts):
                    return ts.astimezone(BEIRUT_TZ).strftime("%H:%M:%S.000Z")

                time_str_sf = fmt_time(scheduled_checkout_dt if (final_action == "switch_remote") else timestamp_beirut)

                up_payload = {}
                if results["totalSize"] > 0:
                    record = results["records"][0]
                    record_id = record["Id"]
                    sf_in = record.get("Check_In__c")

                    if final_action in ["checkout", "switch_remote"]:
                        current_in = sf_in or (fmt_time(timestamp_beirut) if final_action == "checkin" else None)
                        if current_in and time_str_sf <= current_in:
                            corrected_dt = timestamp_beirut + datetime.timedelta(minutes=1)
                            time_str_sf = fmt_time(corrected_dt)
                        
                        up_payload["Check_Out__c"] = time_str_sf
                        
                        # Sync the auto-filled break_out to Salesforce
                        if updates.get("break_out"):
                            up_payload["Break_Out__c"] = fmt_time(updates["break_out"])
                    
                    elif final_action == "checkin": up_payload["Check_In__c"] = time_str_sf
                    elif final_action == "breakin": up_payload["Break_In__c"] = time_str_sf
                    elif final_action == "breakout": up_payload["Break_Out__c"] = time_str_sf

                    if up_payload:
                        sf.Daily_Report__c.update(record_id, up_payload)
                else:
                    new_rec = {"OwnerId": owner_id, "Date__c": today_str}
                    if final_action == "checkin": new_rec["Check_In__c"] = time_str_sf
                    else: new_rec["Check_Out__c"] = time_str_sf
                    sf.Daily_Report__c.create(new_rec)
                
                logs_col.update_one({"_id": daily["_id"]}, {"$set": {"sync_status": "synced"}})
                sync_status = "synced"

                msg_map = {
                    "checkin": "Welcome!", "checkout": "Goodbye!",
                    "breakin": "Enjoy your break!", "breakout": "Welcome back!",
                    "switch_remote": "Remote Mode Enabled"
                }
                user_message = msg_map.get(final_action, "Attendance Recorded")

            except Exception as e:
                print(f"⚠️ SF Live Sync failed: {e}")
                active_online = False

        if not active_online:
            if not sync_thread_started:
                threading.Thread(target=sync_pending_logs, daemon=True).start()
                sync_thread_started = True

        return jsonify({
            "status": sync_status,
            "name": name,
            "action": final_action,
            "message": user_message
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "message": "Terminal Error"}), 500
def sync_pending_logs():
    """
    Background sync for all attendance actions.
    Standardized to Beirut Time strings to fix 'Check out > Check in' validation error.
    """
    print("📢 Background Sync Thread: Active.")
    while True:
        try:
            # 1. Connectivity Guard
            def is_online():
                try:
                    socket.create_connection(("8.8.8.8", 53), timeout=3)
                    return True
                except OSError:
                    return False

            if not is_online():
                time.sleep(60)
                continue

            # 2. Fetch Pending Records
            pending_logs = list(logs_col.find({"sync_status": "pending"}))
            if not pending_logs:
                time.sleep(60)
                continue

            for log in pending_logs:
                try:
                    sf = get_sf_connection()
                    owner_id = log["OwnerId"]
                    log_date = log["date"] # YYYY-MM-DD
                    emp_name = log.get("employee_name", "User")

                    # 3. Standardized Formatter (Fixed: Raw Beirut time string)
                    def fmt_time(ts):
                        if not ts: return None
                        if isinstance(ts, str):
                            ts = datetime.datetime.fromisoformat(ts.replace("Z", "+00:00"))
                        return ts.astimezone(BEIRUT_TZ).strftime("%H:%M:%S.000Z")

                    # 4. Query SF
                    query = f"SELECT Id, Check_In__c, Check_Out__c, Break_In__c, Break_Out__c FROM Daily_Report__c WHERE OwnerId = '{owner_id}' AND Date__c = {log_date} LIMIT 1"
                    results = sf.query(query)

                    update_data = {}
                    if results["totalSize"] > 0:
                        record = results["records"][0]
                        record_id = record["Id"]
                        sf_in_str = record.get('Check_In__c')

                        # Map all fields if present in Mongo but missing in SF
                        if log.get("check_in") and not sf_in_str:
                            update_data["Check_In__c"] = fmt_time(log["check_in"])
                        
                        if log.get("break_in") and not record.get("Break_In__c"):
                            update_data["Break_In__c"] = fmt_time(log["break_in"])
                        
                        if log.get("break_out") and not record.get("Break_Out__c"):
                            update_data["Break_Out__c"] = fmt_time(log["break_out"])

                        if log.get("check_out") and not record.get("Check_Out__c"):
                            out_str = fmt_time(log["check_out"])
                            current_in = update_data.get("Check_In__c") or sf_in_str
                            # FORCE VALIDATION: Ensure string Out > In
                            if current_in and out_str <= current_in:
                                corrected_dt = log["check_out"] + datetime.timedelta(minutes=2)
                                out_str = fmt_time(corrected_dt)
                            update_data["Check_Out__c"] = out_str

                        if update_data:
                            sf.Daily_Report__c.update(record_id, update_data)
                    else:
                        # New Record Logic
                        new_rec = {"OwnerId": owner_id, "Date__c": log_date}
                        if log.get("check_in"): new_rec["Check_In__c"] = fmt_time(log["check_in"])
                        if log.get("check_out"): new_rec["Check_Out__c"] = fmt_time(log["check_out"])
                        if log.get("break_in"): new_rec["Break_In__c"] = fmt_time(log["break_in"])
                        if log.get("break_out"): new_rec["Break_Out__c"] = fmt_time(log["break_out"])
                        sf.Daily_Report__c.create(new_rec)

                    # 5. Finalize Local Record
                    logs_col.update_one({"_id": log["_id"]}, {
                        "$set": {
                            "sync_status": "synced",
                            "last_sync_attempt": datetime.datetime.now(BEIRUT_TZ)
                        }
                    })
                    print(f"✅ Background Sync SUCCESS for {emp_name}")

                except Exception as e:
                    print(f"❌ Background Sync FAILED for {emp_name}: {e}")
                    logs_col.update_one({"_id": log["_id"]}, {"$set": {"last_sync_attempt": datetime.datetime.now(BEIRUT_TZ)}})

            time.sleep(60)
        except Exception as e:
            time.sleep(60)

@app.route("/attendance/today", methods=["GET"])
def get_today_attendance():
    try:
        today_beirut = datetime.datetime.now(BEIRUT_TZ).date()
        today_str = today_beirut.strftime("%Y-%m-%d")

        # Fetch today's logs
        logs_cursor = logs_col.find({"date": today_str})
        
        output = []
        for row in logs_cursor:
            # 1. NEW: Fetch Department from the Employees collection
            # We look up the employee by name to get their specific department
            employee = employees_col.find_one({"name": row.get("employee_name")})
            emp_dept = employee.get("department", "Unassigned") if employee else "Unassigned"

            # Helper to force Beirut Timezone conversion (Timing logic kept unchanged)
            def fmt_time(val):
                if not val: return None
                try:
                    if isinstance(val, datetime.datetime):
                        dt = val
                    else:
                        dt = datetime.datetime.fromisoformat(str(val).replace("Z", "+00:00"))
                    
                    if dt.tzinfo is None:
                        dt = pytz.utc.localize(dt)
                    
                    return dt.astimezone(BEIRUT_TZ).isoformat()
                except Exception as e:
                    print(f"Time format error: {e}")
                    return None

            # 2. ADDED "department" to the response dictionary
            output.append({
                "id": str(row["_id"]),
                "name": row.get("employee_name"),
                "department": emp_dept,  # <--- THIS WAS MISSING
                "check_in": fmt_time(row.get("check_in")),
                "break_in": fmt_time(row.get("break_in")),
                "break_out": fmt_time(row.get("break_out")),
                "check_out": fmt_time(row.get("check_out")),
            })

        return jsonify({"status": "success", "logs": output})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
@app.route("/attendance/<record_id>", methods=["DELETE"])
def delete_attendance(record_id):
    try:
        # 1. Find the local record first
        log = logs_col.find_one({"_id": ObjectId(record_id)})
        if not log:
            return jsonify({"status": "error", "message": "Record not found"}), 404

        owner_id = log.get("OwnerId")
        log_date = log.get("date")

        # 2. Try to Delete from Salesforce
        sf_deleted = False
        try:
            sf = get_sf_connection() # Your SF connection helper
            
            # Query to find the specific Salesforce ID
            query = f"SELECT Id FROM Daily_Report__c WHERE OwnerId = '{owner_id}' AND Date__c = {log_date} LIMIT 1"
            results = sf.query(query)
            
            if results["totalSize"] > 0:
                sf_id = results["records"][0]["Id"]
                sf.Daily_Report__c.delete(sf_id)
                print(f"✅ Deleted from Salesforce: {sf_id}")
                sf_deleted = True
            else:
                print("⚠️ Record not found in Salesforce, skipping remote delete.")

        except Exception as e:
            print(f"⚠️ Salesforce Delete Failed (Offline?): {e}")
            # We continue to delete locally even if SF fails, 
            # or you can return an error here if you want strict sync.

        # 3. Delete from MongoDB
        logs_col.delete_one({"_id": ObjectId(record_id)})

        msg = "Deleted locally & from Salesforce" if sf_deleted else "Deleted locally (SF unavailable)"
        return jsonify({"status": "success", "message": msg}), 200

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
@app.route("/attendance/<record_id>", methods=["PUT"])
def edit_attendance(record_id):
    try:
        data = request.json
        # Expected keys: check_in, break_in, break_out, check_out (ISO strings or null)

        # 1. Find local record
        log = logs_col.find_one({"_id": ObjectId(record_id)})
        if not log:
            return jsonify({"status": "error", "message": "Record not found"}), 404

        owner_id = log.get("OwnerId")
        log_date = log.get("date")

        mongo_updates = {}
        sf_updates = {}

        # 2. Helper to parse ISO string -> Python Datetime (Mongo) -> UTC String (Salesforce)
        def process_field(field_name, sf_field_name):
            if field_name in data:
                val = data[field_name]
                if val:
                    # Parse ISO string from frontend
                    dt_obj = datetime.datetime.fromisoformat(val.replace("Z", "+00:00"))
                    
                    # Ensure it is timezone aware (Beirut)
                    if dt_obj.tzinfo is None:
                        dt_obj = BEIRUT_TZ.localize(dt_obj)
                    else:
                        dt_obj = dt_obj.astimezone(BEIRUT_TZ)

                    # Update Mongo Dict
                    mongo_updates[field_name] = dt_obj

                    # Update SF Dict (Convert to UTC String)
                    sf_updates[sf_field_name] = dt_obj.astimezone(datetime.timezone.utc).strftime("%H:%M:%S.000Z")
                else:
                    # If user cleared the date (set to null)
                    mongo_updates[field_name] = None
                    sf_updates[sf_field_name] = None

        # 3. Process all 4 fields
        process_field("check_in", "Check_In__c")
        process_field("break_in", "Break_In__c")
        process_field("break_out", "Break_Out__c")
        process_field("check_out", "Check_Out__c")

        if not mongo_updates:
            return jsonify({"status": "error", "message": "No data provided"}), 400

        # 4. Update MongoDB
        logs_col.update_one({"_id": ObjectId(record_id)}, {"$set": mongo_updates})

        # 5. Update Salesforce
        sf_status = "Skipped"
        try:
            sf = get_sf_connection()
            # Find the SF ID first
            query = f"SELECT Id FROM Daily_Report__c WHERE OwnerId = '{owner_id}' AND Date__c = {log_date} LIMIT 1"
            results = sf.query(query)

            if results["totalSize"] > 0:
                sf_id = results["records"][0]["Id"]
                sf.Daily_Report__c.update(sf_id, sf_updates)
                sf_status = "Updated"
                print(f"✅ Updated Salesforce Record: {sf_id}")
            else:
                # Optional: Create if missing? For edit, usually we expect it to exist.
                print("⚠️ SF Record not found, cannot update remote.")
                sf_status = "Not Found on SF"

        except Exception as e:
            print(f"⚠️ Salesforce Update Failed: {e}")
            sf_status = "Failed (Offline)"

        return jsonify({
            "status": "success", 
            "message": "Record updated", 
            "sf_status": sf_status
        }), 200

    except Exception as e:
        print(f"❌ EDIT ERROR: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500
# In server.py, replace your get_attendance_report function with this:
# ======================================
# 🔹 FIXED ATTENDANCE REPORT METHOD
# ======================================

@app.route("/attendance/by_date", methods=["GET"])
def get_attendance_report():
    start_str = request.args.get("start_date")
    end_str = request.args.get("end_date")

    if not start_str or not end_str:
        return jsonify({"status": "error", "message": "Dates required"}), 400

    try:
        print(f"\n--- 🗓️ ANALYTICS DEBUG: {start_str} to {end_str} ---")

        # 1. Fetch Data
        all_employees = list(employees_col.find({}, {"name": 1, "department": 1, "schedule": 1}))
        range_logs = list(logs_col.find({"date": {"$gte": start_str, "$lte": end_str}}))
        
        print(f"📊 Found {len(range_logs)} total logs in this range.")

        now_beirut = datetime.datetime.now(BEIRUT_TZ)
        report = []

        # 2. Date Parsing
        start_date = datetime.datetime.strptime(start_str, "%Y-%m-%d").date()
        end_date = datetime.datetime.strptime(end_str, "%Y-%m-%d").date()
        delta = end_date - start_date

        for i in range(delta.days + 1):
            current_date = start_date + timedelta(days=i)
            current_date_str = current_date.strftime("%Y-%m-%d")
            day_name = current_date.strftime("%A")

            for emp in all_employees:
                emp_name_db = emp.get("name", "").strip()
                
                # --- FIX 1: CASE-INSENSITIVE MATCHING ---
                # This finds the log regardless of "Samir" vs "samir"
                emp_log = next((x for x in range_logs if 
                                x.get("employee_name", "").strip().lower() == emp_name_db.lower() and 
                                x.get("date") == current_date_str), None)
                
                # --- FIX 2: SUPPORT ALL FIELD VARIATIONS ---
                check_in_val = None
                if emp_log:
                    # Tries 'check_in' then 'checkin' then 'timestamp'
                    check_in_val = emp_log.get("check_in") or emp_log.get("checkin") or emp_log.get("timestamp")

                status = "Unknown"
                check_in_time = None
                minutes_late = 0
                minutes_early = 0

                # Schedule Setup
                schedule = emp.get("schedule", {}).get("weekly", {})
                default_day = {"active": True, "start": "09:00", "end": "17:00"}
                if day_name in ["Saturday", "Sunday"]: default_day["active"] = False
                day_config = schedule.get(day_name, default_day)
                shift_start_str = day_config.get("start", "09:00")

                if check_in_val:
                    status = "Present"
                    try:
                        # Convert to Beirut Aware Datetime
                        if isinstance(check_in_val, str):
                            dt = datetime.datetime.fromisoformat(check_in_val.replace("Z", "+00:00"))
                        else:
                            dt = check_in_val
                        
                        if dt.tzinfo is None:
                            check_in_time = pytz.utc.localize(dt).astimezone(BEIRUT_TZ)
                        else:
                            check_in_time = dt.astimezone(BEIRUT_TZ)

                        # Calculate Lateness
                        sh_h, sh_m = map(int, shift_start_str.split(":"))
                        shift_start_dt = BEIRUT_TZ.localize(datetime.datetime.combine(current_date, datetime.time(sh_h, sh_m)))

                        if check_in_time > shift_start_dt:
                            diff = (check_in_time - shift_start_dt).total_seconds() / 60
                            minutes_late = int(diff) if diff > 5 else 0
                        else:
                            minutes_early = int((shift_start_dt - check_in_time).total_seconds() / 60)

                    except Exception as e:
                        print(f"⚠️ Time Calc Error for {emp_name_db}: {e}")
                else:
                    # Absent Logic
                    is_today = current_date == now_beirut.date()
                    if current_date > now_beirut.date():
                        status = "Scheduled"
                    elif not day_config.get("active", True):
                        status = "Off Day"
                    else:
                        if is_today:
                            sh_h, sh_m = map(int, shift_start_str.split(":"))
                            shift_start_dt = BEIRUT_TZ.localize(datetime.datetime.combine(current_date, datetime.time(sh_h, sh_m)))
                            status = "Absent" if now_beirut > shift_start_dt else "Scheduled"
                        else:
                            status = "Absent"

                report.append({
                    "id": f"{str(emp['_id'])}_{current_date_str}",
                    "date": current_date_str,
                    "name": emp_name_db,
                    "department": emp.get("department", "Unassigned"),
                    "status": status,
                    "shift": f"{shift_start_str} - {day_config.get('end', '17:00')}",
                    "check_in": check_in_time.isoformat() if check_in_time else None,
                    "minutes_late": minutes_late,
                    "minutes_early": minutes_early
                })

        return jsonify({"status": "success", "data": report})

    except Exception as e:
        print(f"❌ CRITICAL ANALYTICS ERROR: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500
    # ======================================
# 🔹 Export & Filtering Endpoints (NEW)
# ======================================

# 1. Get list of all registered employees for the dropdown
@app.route("/employees", methods=["GET"])
def get_employees():
    try:
        # Fetch names and sort them
        employees = list(employees_col.find({}, {"name": 1, "_id": 0}).sort("name", 1))
        employee_names = [e["name"] for e in employees]
        return jsonify({"status": "success", "employees": employee_names})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

from datetime import timedelta
import pytz

# 🔹 REGISTRATION & MANAGEMENT ENDPOINTS
# ======================================

@app.route("/get_employee", methods=["GET"])
def get_employee():
    try:
        cursor = employees_col.find({}, {
            "_id": 1, "name": 1, "OwnerId": 1, "department": 1
        })
        employees = []
        for doc in cursor:
            employees.append({
                "id": str(doc["_id"]),
                "name": doc.get("name", "Unknown"),
                "ownerId": doc.get("OwnerId", "N/A"),
                "department": doc.get("department", "Unassigned")
            })
        return jsonify({"status": "success", "employees": employees}), 200
    except Exception as e:
        print(f"❌ Error fetching employees: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/attendance/filter", methods=["GET"])
def filter_attendance():
  try:
    emp_name_filter = request.args.get("employee_name", "all")
    start_str = request.args.get("start_date")
    end_str = request.args.get("end_date")

    if not start_str or not end_str:
      return jsonify({"status": "error", "message": "Dates are required"}), 400

    # 1. Date Range Setup
    start_date = datetime.datetime.strptime(start_str, "%Y-%m-%d").date()
    end_date = datetime.datetime.strptime(end_str, "%Y-%m-%d").date()
    delta = end_date - start_date
    date_list = [(start_date + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(delta.days + 1)]

    # 2. Fetch Data
    all_employees = list(employees_col.find({}))
    # Fetch logs based on the 'date' string field
    range_logs = list(logs_col.find({"date": {"$gte": start_str, "$lte": end_str}}))

    summaries = []

    # 3. Main Loop (APK Logic adaptation)
    for current_date in date_list:
      day_name = datetime.datetime.strptime(current_date, "%Y-%m-%d").strftime("%A")

      for emp in all_employees:
        name = emp.get("name")
        if emp_name_filter != "all" and name != emp_name_filter:
          continue

        # Get Schedule Config
        schedule = emp.get("schedule", {}).get("weekly", {})
        day_cfg = schedule.get(day_name, {"active": True, "is_remote": False})
        
        # Default off if weekend and not in schedule
        if day_name in ["Saturday", "Sunday"] and day_name not in schedule:
          day_cfg = {"active": False, "is_remote": False}

        is_active = day_cfg.get("active", True)
        is_remote_sched = day_cfg.get("is_remote", False)
        
        # Find log
        log = next((l for l in range_logs if l["employee_name"] == name and l["date"] == current_date), None)

        # 4. DETERMINE WORKED METHOD (The critical logic)
        worked_method = "Absent"
        if not is_active:
          worked_method = "OFF"
        elif log:
          # Retrieve the source metadata we saved during check-in/out
          # We check for both 'check_in_source' and 'source' just in case
          log_source = log.get("check_in_source") or log.get("source") or ""
          
          if "continue_working_from_home" in log_source or "remote" in log_source:
            worked_method = "Continued From Home"
          elif log.get("check_in"):
            worked_method = "Office"
        elif is_remote_sched:
          worked_method = "Scheduled Remote Day"

        # 5. Time Formatter (Beirut Time Fix)
        def fmt(key):
          val = log.get(key) if log else None
          if not val: return None
          try:
            if isinstance(val, datetime.datetime):
              # Convert UTC Mongo Object to Beirut Time
              if val.tzinfo is None:
                val = pytz.utc.localize(val)
              return val.astimezone(BEIRUT_TZ).isoformat()
            return val # Return as is if already string
          except:
            return None

        summaries.append({
          "employee_name": name,
          "date": current_date,
          "check_in": fmt("check_in"),
          "check_out": fmt("check_out"),
          "break_in": fmt("break_in"),
          "break_out": fmt("break_out"),
          "is_remote_today": is_remote_sched or (worked_method == "Continued From Home"),
          "is_off_today": not is_active,
          "worked_method": worked_method,
        })

    return jsonify({"status": "success", "logs": summaries})

  except Exception as e:
    print(f"Filter error: {e}")
    return jsonify({"status": "error", "message": str(e)}), 500
@app.route("/schedule", methods=["GET"])
def get_schedule():
    name = request.args.get("name")
    if not name:
        return jsonify({"status": "error", "message": "Name is required"}), 400

    print(f"🔎 Fetching schedule for: {name}") # LOG

    employee = employees_col.find_one({"name": name}, {"_id": 0, "schedule": 1, "department": 1})
    
    if not employee:
        return jsonify({"status": "error", "message": "Employee not found"}), 404
        
    db_schedule = employee.get("schedule", {})

    # Ensure defaults exist
    full_schedule = {
        "job_type": db_schedule.get("job_type", "Full-Time"),
        "weekly": db_schedule.get("weekly", {}) # Pass raw weekly, frontend will fill gaps
    }
    
    department = employee.get("department", "Unassigned")

    return jsonify({
        "status": "success", 
        "schedule": full_schedule,
        "department": department
    })


@app.route("/schedule", methods=["POST"])
def update_schedule():
    try:
        data = request.json
        name = data.get("name")
        department = data.get("department")
        new_schedule = data.get("schedule")

        if not name or not new_schedule:
            print("❌ Missing data in POST /schedule")
            return jsonify({"status": "error", "message": "Missing data"}), 400

        # --- DEBUG LOGGING ---
        print(f"📥 UPDATING SCHEDULE FOR: {name}")
        print(f"🏢 Department: {department}")
        print("📅 New Schedule Data:")
        print(json.dumps(new_schedule, indent=2)) 
        # ---------------------

        result = employees_col.update_one(
            {"name": name},
            {"$set": {
                "schedule": new_schedule,
                "department": department
            }}
        )

        if result.matched_count == 0:
            print(f"❌ Employee {name} not found in DB")
            return jsonify({"status": "error", "message": "Employee not found"}), 404

        print("✅ Update Success")
        return jsonify({"status": "success", "message": "Profile updated successfully"})
    except Exception as e:
        print(f"❌ CRITICAL ERROR: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500



@app.route("/delete_employee", methods=["POST"])
def delete_employee():
    """
    Deletes employee by Mongo _id + removes their face encoding.
    Refreshes all face encodings after deletion.
    """
    try:
        data = request.json
        emp_id = data.get("id")
        emp_name = data.get("name")

        if not emp_id:
            return jsonify({"status": "error", "message": "No employee ID provided"}), 400

        # Delete from MongoDB
        result = employees_col.delete_one({"_id": ObjectId(emp_id)})

        if result.deleted_count == 0:
            return jsonify({"status": "error", "message": "Employee not found"}), 404

        print(f"🗑 Deleted employee: {emp_name} ({emp_id})")

        # Refresh loaded encodings
        reload_face_data()

        return jsonify({"status": "success", "message": f"{emp_name} deleted successfully"}), 200

    except Exception as e:
        print(f"❌ Delete Error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500
def reload_face_data():
    global known_face_encodings, known_face_names, known_face_owner_ids

    known_face_encodings = []
    known_face_names = []
    known_face_owner_ids = []

    for emp in employees_col.find({}):
        encoding = pickle.loads(emp["face_encoding"])
        known_face_encodings.append(encoding)
        known_face_names.append(emp["name"])
        known_face_owner_ids.append(emp.get("OwnerId"))

    print(f"🔄 Refreshed face encodings: {len(known_face_encodings)} employees loaded.")

# ... (Keep register_new_employee and others) ...
@app.route("/register_new_employee", methods=["POST"])
def register_new_employee():
    """
    Registers a new employee with:
    1. Face Encodings (averaged from 5 photos)
    2. Salesforce OwnerId
    3. Department
    4. Default Professional Schedule
    """
    try:
        data = request.json
        name = data.get("name", "").strip().lower()
        owner_id = data.get("ownerId", "").strip()
        department = data.get("department", "Unassigned") # <--- CAPTURE DEPARTMENT
        images_base64 = data.get("images", [])

        if not name or not owner_id or len(images_base64) == 0:
            return jsonify({"status": "error", "message": "Missing name, ID, or images"}), 400

        # 1. Check Duplicates
        if employees_col.find_one({"name": name}):
            return jsonify({"status": "error", "message": f"User '{name}' already exists."}), 400

        print(f"📝 Processing registration for {name} ({department})...")

        all_encodings = []

        # 2. Process Images (Base64 -> CV2 -> Face Recognition)
        for img_str in images_base64:
            if "," in img_str:
                img_str = img_str.split(",")[1]
            
            img_bytes = base64.b64decode(img_str)
            img_arr = np.frombuffer(img_bytes, dtype=np.uint8)
            img = cv2.imdecode(img_arr, cv2.IMREAD_COLOR)
            rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            
            encs = face_recognition.face_encodings(rgb_img)
            if len(encs) > 0:
                all_encodings.append(encs[0])

        if not all_encodings:
            return jsonify({"status": "error", "message": "No faces detected. Please retake photos."}), 400

        # 3. Average Encodings
        mean_encoding = np.mean(all_encodings, axis=0)
        
        # 4. Define Default Professional Schedule
        default_schedule = {
            "job_type": "Full-Time",
            "work_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
            "remote_days": [],  # <--- IMPORTANT: Initialize empty to prevent frontend crash
            "shift_start": "09:00",
            "shift_end": "17:00",
            "is_remote_allowed": False
        }

        # 5. Insert into MongoDB
        employees_col.insert_one({
            "name": name,
            "face_encoding": pickle.dumps(mean_encoding),
            "OwnerId": owner_id,
            "department": department, # <--- STORE DEPARTMENT
            "schedule": default_schedule
        })
        reload_face_data()

        print(f"✅ Registered {name} successfully.")
        return jsonify({"status": "success", "message": "Employee registered successfully!"}), 200

    except Exception as e:
        print(f"❌ Registration Error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500
    
    
# ======================================
# 🔹 Start Flask Server
# ======================================
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)

