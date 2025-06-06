# Aeroclub Project

This project consists of a React frontend application (`aeroclub-app`) and a FastAPI backend application (`backend`).

## Project Structure

```
aeroclub/
├── aeroclub-app/   # React Frontend
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── App.tsx
│   │   └── index.tsx
│   ├── package.json
│   └── README.md   # Frontend specific README
└── backend/        # FastAPI Backend
    ├── app/
    │   ├── api/
    │   ├── core/
    │   ├── db_json/
    │   ├── services/
    │   ├── uploads/
    │   ├── crud.py
    │   ├── main.py
    │   └── models_db.py
    ├── tests/
    ├── .env
    ├── requirements.txt
    └── README.md   # Backend specific README
```

## Frontend (aeroclub-app)

The frontend is a React application built with Create React App and TypeScript.

### Key Features:
*   **Login Page**: Allows admin users to log in.
*   **Admin Page**: Provides a dashboard for managing:
    *   Users (creation, viewing - full list functionality pending backend endpoint)
    *   Menu Items (uploading new drinks, editing existing ones - backend integration pending)
    *   Orders (viewing current orders - backend integration pending)
    *   Scaling/Locations (managing locations, generating QR codes - backend integration pending)
*   **Client App Page**: (Placeholder for client-facing application)

### Setup and Running:

1.  **Navigate to the frontend directory:**
    ```bash
    cd aeroclub/aeroclub-app
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Start the development server:**
    ```bash
    npm start
    ```
    The application will typically be available at `http://localhost:3000`.

### Backend API Interaction:
*   The Login page (`src/components/LoginPage.tsx`) interacts with the backend's `/api/v1/auth/token` endpoint for authentication.
*   The Admin page (`src/components/AdminPage.tsx`) is set up to:
    *   Fetch user information (currently uses `/api/v1/users/me/` as a placeholder for the current user, a full user list endpoint `GET /api/v1/users/` would be needed).
    *   Create new users via `POST /api/v1/users/`.
*   Other Admin page functionalities (menu, orders, locations) have UI elements but require further backend API integration. The backend API base URL is hardcoded as `http://localhost:8000`.

## Backend (backend)

The backend is a FastAPI application.

### Key Features:
*   **Authentication**: JWT-based token authentication (`/api/v1/auth/token`).
*   **User Management**:
    *   Create users (`POST /api/v1/users/`) - admin protected.
    *   Get current user (`GET /api/v1/users/me/`).
    *   Initial admin user setup (`POST /api/v1/auth/setup-admin`).
*   **API Endpoints**: Organized under `/api/v1/` for various resources (locations, menu items, orders - further implementation details in `backend/app/api/v1/endpoints/`).
*   **CORS Enabled**: Allows requests from all origins (`*`) for development.
*   **Static File Serving**: Serves uploaded files from `/uploads`.

### Setup and Running:

1.  **Navigate to the backend directory:**
    ```bash
    cd aeroclub/backend
    ```
2.  **Create a virtual environment (recommended):**
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    ```
3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```
4.  **Configure environment variables:**
    Create a `.env` file in the `aeroclub/backend` directory by copying `.env.example` (if one exists) or by creating it manually.
    It should contain at least:
    ```env
    SECRET_KEY=your_strong_secret_key
    ACCESS_TOKEN_EXPIRE_MINUTES=30
    ADMIN_USERNAME=your_admin_login
    ADMIN_PASSWORD=your_admin_password
    # Optional:
    # TELEGRAM_BOT_TOKEN=your_telegram_bot_token
    # TELEGRAM_CHAT_ID=your_telegram_chat_id
    ```
5.  **Run the development server:**
    ```bash
    uvicorn app.main:app --reload
    ```
    The API will typically be available at `http://localhost:8000`. API documentation can be found at `http://localhost:8000/docs` and `http://localhost:8000/redoc`.

## Connecting Frontend to Backend

*   The frontend expects the backend API to be running on `http://localhost:8000`.
*   The backend is configured with CORS to allow requests from `http://localhost:3000` (and other common development ports, or `*` for wide open access during development).
*   The `LoginPage.tsx` component in the frontend makes a `POST` request to `http://localhost:8000/api/v1/auth/token` to authenticate.
*   The `AdminPage.tsx` component in the frontend makes requests to:
    *   `http://localhost:8000/api/v1/users/` for creating users.
    *   `http://localhost:8000/api/v1/users/me/` to fetch current user data (as a placeholder for a full user list).

## Further Development & TODOs

### Frontend:
*   Implement API calls for all CRUD operations in the Admin Page (Menu, Orders, Locations).
*   Replace mock data with data fetched from the backend for all sections.
*   Implement proper error handling and loading states for all API interactions.
*   Develop the Client App page.
*   Add functionality for editing and deleting users.
*   Secure admin routes, ensuring only authenticated users can access them.
*   Implement logout functionality.

### Backend:
*   Implement `GET /api/v1/users/` to retrieve a list of all users (admin protected).
*   Implement `PUT /api/v1/users/{user_id}` and `DELETE /api/v1/users/{user_id}` for user management.
*   Fully implement CRUD operations for `locations`, `menu_items`, and `orders` endpoints.
*   Enhance database interactions (currently JSON files, consider a more robust database like PostgreSQL or SQLite for production).
*   Add more comprehensive tests.
*   Refine security, especially for production (e.g., more specific CORS origins).

This `README.md` provides a general overview. For more specific details, refer to the `README.md` files within the `aeroclub-app` and `backend` directories.
