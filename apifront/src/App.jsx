import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import HomePage from './pages/HomePage';
import OrderPage from './pages/OrderPage';
import PaymentPage from './pages/PaymentPage';
import MyOrdersPage from './pages/MyOrdersPage';
import NotFoundPage from './pages/NotFoundPage'; // Import the 404 page

function App() {
    return (
        <BrowserRouter>
            <nav>
                <ul>
                    <li><Link to="/">Home</Link></li>
                    <li><Link to="/my-orders">My Orders</Link></li>
                    {/* Add other global navigation links if needed */}
                </ul>
            </nav>
            <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/order/:serviceId" element={<OrderPage />} />
                <Route path="/payment" element={<PaymentPage />} />
                <Route path="/my-orders" element={<MyOrdersPage />} />
                {/* Catch-all route for 404 Not Found */}
                 <Route path="*" element={<NotFoundPage />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
